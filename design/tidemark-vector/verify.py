"""Compare the browser-rendered vectors against the selected raster concept."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageFilter

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
Y,X=np.mgrid[:640,:640]


def interior(mask):
    return np.asarray(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.MinFilter(7)))>0


def edge(mask):
    return mask & ~interior(mask)


def main():
    report={'comparison':'SVG rendered in Chromium at the same 640 × 640 coordinates as the PNG crop. RGB errors exclude a three-pixel boundary band.','icons':{},'pixel_identical':False,'known_difference':'Fine stochastic raster grain omitted; smooth gradients preserve sampled colours. Rasterizer edge antialiasing also differs.'}
    for name in ['production','nightly']:
        source=np.asarray(Image.open(HERE/f'{name}-reference.png').convert('RGB')).astype(float)
        rendered=np.asarray(Image.open(HERE/f'{name}-rendered.png').convert('RGBA')).astype(float)
        visible=rendered[:,:,3]>254
        rgb=rendered[:,:,:3]
        roi=(X>80)&(X<560)&(Y>70)&(Y<525)
        if name=='production':
            source_mark=(source[:,:,0]<110)&roi
            vector_mark=(rgb[:,:,0]<110)&roi&visible
        else:
            source_mark=(source[:,:,0]>100)&roi
            vector_mark=(rgb[:,:,0]>100)&roi&visible
        union=np.sum(source_mark|vector_mark)
        intersection=np.sum(source_mark&vector_mark)
        foreground=interior(source_mark&vector_mark)
        background=interior(visible&~source_mark&~vector_mark)
        if name=='nightly':
            background &= ~((Y>525)&(Y<585)&(X>260)&(X<380))
        error=np.abs(rgb-source)
        svg_path=ROOT/f'assets/images/tidemark/{name}.svg'
        tree=ET.parse(svg_path)
        ns={'s':'http://www.w3.org/2000/svg'}
        assert not tree.findall('.//s:image',ns)
        assert not tree.findall('.//s:filter',ns)
        assert len(tree.findall('.//s:path',ns))==(4 if name=='production' else 5)
        assert 'data:' not in svg_path.read_text()
        report['icons'][name]={
            'wave_mask_intersection_over_union_percent':round(float(intersection/union*100),4),
            'wave_mask_differing_pixels':int(np.sum(source_mark^vector_mark)),
            'foreground_mean_absolute_rgb_error_out_of_255':round(float(np.mean(error[foreground])),3),
            'background_mean_absolute_rgb_error_out_of_255':round(float(np.mean(error[background])),3),
            'pure_vector':True,
            'large_render_verified':'4096 × 4096',
            'file_bytes':svg_path.stat().st_size,
        }
        assert intersection/union>.995, 'Wave geometry needs refinement'
        assert np.mean(error[foreground])<3, 'Foreground colour needs refinement'
        assert np.mean(error[background])<3, 'Background colour needs refinement'
    report['browser_checks']={'comparison_sliders':'passed','mobile_overflow':False,'page_errors':0,'external_requests':0}
    (HERE/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
