"""Rebuild the selected Tidemark concept as smooth, editable vector paths.

Requires Pillow and NumPy, used only by this design-time utility.
Run from the repository root. No dependencies are added to the application.
The raster's grain is intentionally not encoded as thousands of pixel shapes.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/images/tidemark'
HERE = Path(__file__).resolve().parent
SIZE = 640
Y, X = np.mgrid[:SIZE, :SIZE]
DESIGN = np.stack([np.ones_like(X), (X-320)/320, (Y-320)/320], axis=-1)


def erode(mask, n=7):
    return np.asarray(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.MinFilter(n))) > 0


def field(rgb, mask):
    coeff = np.linalg.lstsq(DESIGN[mask], rgb[mask], rcond=None)[0]
    return DESIGN @ coeff


def alpha(rgb, inside, outside):
    delta = inside-outside
    return np.clip(np.sum((rgb-outside)*delta, axis=2) / np.maximum(np.sum(delta*delta, axis=2), 1), 0, 1)


def contours(values, level=.5):
    """Marching squares with subpixel interpolation, in pixel-edge coordinates."""
    hits = values >= level
    cells = ((hits[:-1, :-1] != hits[:-1, 1:]) |
             (hits[:-1, 1:] != hits[1:, 1:]) |
             (hits[1:, 1:] != hits[1:, :-1]) |
             (hits[1:, :-1] != hits[:-1, :-1]))
    adjacency, positions = {}, {}
    for y, x in zip(*np.where(cells)):
        corners = [(x,y),(x+1,y),(x+1,y+1),(x,y+1)]
        keys = [('h',y,x),('v',y,x+1),('h',y+1,x),('v',y,x)]
        crossed = []
        for i in range(4):
            ax,ay = corners[i]
            bx,by = corners[(i+1)%4]
            va,vb = values[ay,ax], values[by,bx]
            if (va >= level) != (vb >= level):
                t = (level-va)/(vb-va)
                key = keys[i]
                positions[key] = np.array([ax+(bx-ax)*t+.5, ay+(by-ay)*t+.5])
                crossed.append(key)
        if len(crossed) == 4 and values[y:y+2,x:x+2].mean() < level:
            crossed = [crossed[3],crossed[0],crossed[1],crossed[2]]
        for a,b in zip(crossed[::2], crossed[1::2]):
            adjacency.setdefault(a,[]).append(b)
            adjacency.setdefault(b,[]).append(a)
    loops=[]
    visited=set()
    for start in adjacency:
        if start in visited:
            continue
        current, previous = start, None
        loop=[]
        while current not in visited:
            visited.add(current)
            loop.append(positions[current])
            neighbours=adjacency[current]
            following=next((n for n in neighbours if n != previous), start)
            previous,current=current,following
        if len(loop)>20 and current==start:
            loops.append(np.array(loop))
    def area(points):
        following=np.roll(points,-1,axis=0)
        return abs(np.sum(points[:,0]*following[:,1]-points[:,1]*following[:,0]))
    return sorted(loops, key=area, reverse=True)


def norm(v):
    return v / max(np.linalg.norm(v), 1e-12)


def bezier(curve, u):
    u=np.asarray(u)
    return ((1-u)**3)[:,None]*curve[0] + (3*(1-u)**2*u)[:,None]*curve[1] + (3*(1-u)*u*u)[:,None]*curve[2] + (u**3)[:,None]*curve[3]


def fit(points, first, last, tolerance=.28):
    if len(points)==2:
        d=np.linalg.norm(points[-1]-points[0])/3
        return [np.array([points[0],points[0]+first*d,points[-1]+last*d,points[-1]])]
    lengths=np.linalg.norm(np.diff(points,axis=0),axis=1)
    u=np.r_[0,np.cumsum(lengths)]/sum(lengths)
    for attempt in range(5):
        b0=(1-u)**3; b1=3*(1-u)**2*u; b2=3*(1-u)*u*u; b3=u**3
        a1=b1[:,None]*first; a2=b2[:,None]*last
        residual=points-(b0+b1)[:,None]*points[0]-(b2+b3)[:,None]*points[-1]
        mat=np.array([[np.sum(a1*a1),np.sum(a1*a2)],[np.sum(a1*a2),np.sum(a2*a2)]])
        rhs=np.array([np.sum(a1*residual),np.sum(a2*residual)])
        try:
            left,right=np.linalg.solve(mat,rhs)
        except np.linalg.LinAlgError:
            left=right=-1
        chord=np.linalg.norm(points[-1]-points[0])
        if min(left,right)<chord*1e-6 or max(left,right)>chord*4:
            left=right=chord/3
        curve=np.array([points[0],points[0]+first*left,points[-1]+last*right,points[-1]])
        q=bezier(curve,u)
        errors=np.sum((q-points)**2,axis=1)
        split=int(np.argmax(errors))
        if errors[split] <= tolerance*tolerance:
            return [curve]
        if errors[split]>tolerance*tolerance*16 or attempt==4:
            break
        # Reparameterize each sample with a Newton step on squared distance.
        q1=3*((1-u)**2)[:,None]*(curve[1]-curve[0])+6*((1-u)*u)[:,None]*(curve[2]-curve[1])+3*(u*u)[:,None]*(curve[3]-curve[2])
        q2=6*(1-u)[:,None]*(curve[2]-2*curve[1]+curve[0])+6*u[:,None]*(curve[3]-2*curve[2]+curve[1])
        denominator=np.sum(q1*q1+(q-points)*q2,axis=1)
        newer=np.clip(u-np.sum((q-points)*q1,axis=1)/np.maximum(denominator,1e-9),0,1)
        if np.any(np.diff(newer)<0):
            break
        u=newer
    split=max(1,min(split,len(points)-2))
    tangent=norm(points[split-1]-points[split+1])
    return fit(points[:split+1],first,tangent,tolerance)+fit(points[split:],-tangent,last,tolerance)


def path_from_contour(points):
    # Preserve the sharp junctions between the circle edge and wave cuts.
    step=6
    before=points-np.roll(points,step,axis=0)
    after=np.roll(points,-step,axis=0)-points
    cosine=np.sum(before*after,axis=1)/np.maximum(np.linalg.norm(before,axis=1)*np.linalg.norm(after,axis=1),1e-9)
    candidates=np.argsort(cosine)
    corners=[]
    for i in candidates:
        if cosine[i]>.76:
            break
        if all(min(abs(i-j),len(points)-abs(i-j))>18 for j in corners):
            corners.append(int(i))
    if len(corners)<2:
        corners=[int(np.argmin(points[:,1])),int(np.argmax(points[:,1]))]
    corners.sort()
    curves=[]
    for k,start in enumerate(corners):
        end=corners[(k+1)%len(corners)]
        section=points[start:end+1] if end>start else np.vstack([points[start:],points[:end+1]])
        curves.extend(fit(section,norm(section[min(3,len(section)-1)]-section[0]),norm(section[max(0,len(section)-4)]-section[-1])))
    def fmt(p): return f'{p[0]:.3f} {p[1]:.3f}'
    d='M '+fmt(curves[0][0])+' '+' '.join('C '+' '.join(fmt(p) for p in c[1:]) for c in curves)+' Z'
    return d, curves


def gradient(name,rgb,mask):
    # Fit one smooth direction to each ink. Five stops capture broad shading;
    # fine raster grain remains excluded from the resolution-independent source.
    coeff=np.linalg.lstsq(DESIGN[mask],rgb[mask],rcond=None)[0]
    direction=np.linalg.svd(coeff[1:],full_matrices=False)[0][:,0]
    u=((X-320)*direction[0]+(Y-320)*direction[1])/320
    low,high=np.min(u[mask]),np.max(u[mask])
    coeff1=np.linalg.lstsq(np.stack([np.ones(np.sum(mask)),u[mask],u[mask]**2],axis=1),rgb[mask],rcond=None)[0]
    stops=[]
    for t in np.linspace(low,high,5):
        color=np.clip(np.array([1,t,t*t])@coeff1,0,255)
        stops.append(f'<stop offset="{(t-low)/(high-low):.3f}" stop-color="rgb({color[0]:.2f},{color[1]:.2f},{color[2]:.2f})"/>')
    x1,y1=320+320*low*direction; x2,y2=320+320*high*direction
    return f'<linearGradient id="{name}" gradientUnits="userSpaceOnUse" x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}">\n      '+ '\n      '.join(stops)+'\n    </linearGradient>'


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    report={'sources':['design/tidemark-vector/production-reference.png','design/tidemark-vector/nightly-reference.png'],'method':'Subpixel contours fitted with cubic Bezier curves; sampled five-stop vector gradients. Raster grain excluded.','icons':{}}
    for name in ['production','nightly']:
        rgb=np.asarray(Image.open(HERE/f'{name}-reference.png').convert('RGB')).astype(float)
        smooth=np.asarray(Image.fromarray(rgb.astype('uint8')).filter(ImageFilter.GaussianBlur(.45))).astype(float)
        if name=='production':
            tile_rough=rgb[:,:,2]<224
            mark_rough=(rgb[:,:,0]<100)&(Y<520)
            tile_ink=(rgb[:,:,0]>210)&tile_rough
        else:
            tile_rough=rgb[:,:,0]<100
            mark_rough=(rgb[:,:,0]>100)&(X>100)&(X<550)&(Y>70)&(Y<520)
            tile_ink=tile_rough
        outside=erode((rgb[:,:,0]>235)&(rgb[:,:,2]>226))
        # The outer background is sampled only at the perimeter of the crop.
        outside &= (X<20)|(X>620)|(Y<10)|(Y>630)|((X<110)&(Y<100))
        outer_field=field(rgb,outside)
        background_field=field(rgb,erode(tile_ink))
        tile_alpha=alpha(smooth,background_field,outer_field)
        tile_contour=contours(tile_alpha)[0]
        # Generate the entire tile as a solid mask, including foreground holes.
        from PIL import ImageDraw
        tile_image=Image.new('L',(640,640))
        ImageDraw.Draw(tile_image).polygon([tuple(p) for p in tile_contour],fill=255)
        tile_mask=np.array(tile_image)>0
        foreground_field=field(rgb,erode(mark_rough))
        mark_alpha=alpha(smooth,foreground_field,background_field)
        mark_alpha[~tile_mask]=0
        mark_alpha[Y>525]=0
        mark_contours=contours(mark_alpha)[:3]
        mark_contours.sort(key=lambda pts: pts[:,1].mean())
        shapes=[('tile',tile_contour,erode(tile_mask & tile_ink))]
        for index,contour in enumerate(mark_contours,1):
            m=Image.new('L',(640,640))
            ImageDraw.Draw(m).polygon([tuple(p) for p in contour],fill=255)
            shapes.append((f'wave-{index}',contour,erode(np.array(m)>0)))
        if name=='nightly':
            badge_rough=(rgb[:,:,0]>150)&(rgb[:,:,1]<195)&(Y>525)&tile_mask
            badge_field=field(rgb,erode(badge_rough))
            badge_alpha=alpha(smooth,badge_field,background_field)
            badge_alpha[(Y<525)|(~tile_mask)]=0
            shapes.append(('nightly-marker',contours(badge_alpha)[0],erode(badge_rough)))
        definitions=[]; paths=[]; shape_data=[]
        for shape,contour,mask in shapes:
            d,curves=path_from_contour(contour)
            definitions.append(gradient(f'{name}-{shape}-ink',rgb,mask))
            paths.append(f'  <path id="{shape}" fill="url(#{name}-{shape}-ink)" d="{d}"/>')
            sampled=np.vstack([bezier(c,np.linspace(0,1,160)) for c in curves])
            a=sampled[:-1]; delta=sampled[1:]-a
            lengths=np.maximum(np.sum(delta*delta,axis=1),1e-12)
            distances=[]
            for chunk in np.array_split(contour,20):
                rel=chunk[:,None]-a[None,:]
                t=np.clip(np.sum(rel*delta[None,:],axis=2)/lengths[None,:],0,1)
                residual=rel-t[:,:,None]*delta[None,:]
                distances.extend(np.sqrt(np.min(np.sum(residual*residual,axis=2),axis=1)).tolist())
            shape_data.append({'name':shape,'cubic_segments':len(curves),'contour_p95_source_px':round(float(np.percentile(distances,95)),3),'median_rgb':np.median(rgb[mask],axis=0).tolist()})
        # Keep a source-coordinate proof for direct registration against the crop.
        def document(view, pathlist, label):
            return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="{view}" role="img" aria-labelledby="title desc">\n  <title id="title">PrivateCycle Tidemark — {label}</title>\n  <desc id="desc">Faithfully traced cubic vector paths and sampled smooth colours. No embedded bitmap. The concept image’s fine raster grain is not reproduced.</desc>\n  <defs>\n    '+'\n    '.join(definitions)+'\n  </defs>\n'+'\n'.join(pathlist)+'\n</svg>\n'
        (HERE/f'{name}-registered.svg').write_text(document('0 0 640 640',paths,name),encoding='utf8')
        minimum=tile_contour.min(axis=0); maximum=tile_contour.max(axis=0)
        side=float(np.max(maximum-minimum))
        center=(minimum+maximum)/2
        x0,y0=center-side/2
        view=f'{x0:.3f} {y0:.3f} {side:.3f} {side:.3f}'
        (OUT/f'{name}.svg').write_text(document(view,paths,name),encoding='utf8')
        (OUT/f'{name}-foreground.svg').write_text(document(view,paths[1:],f'{name} foreground'),encoding='utf8')
        report['icons'][name]={'viewBox':view,'shapes':shape_data,'path_count':len(paths),'file_bytes':(OUT/f'{name}.svg').stat().st_size}
    (HERE/'trace-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
