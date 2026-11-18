import {
  isMarkerOnArc,
  markerPoint,
  pointOnCircle,
  tidemarkHeroGeometry,
  tidemarkHeroMarker,
  tidemarkPrivacyGeometry,
  tidemarkPrivacyMarker,
} from '@/components/onboarding/tidemarkGeometry';

describe('Tidemark marker geometry', () => {
  it('computes the hero marker from the same center, radius and angle as the arc', () => {
    const point = pointOnCircle(
      tidemarkHeroGeometry.center,
      tidemarkHeroGeometry.marker.radius,
      tidemarkHeroGeometry.marker.angle
    );

    expect(point).toEqual(tidemarkHeroMarker);
    expect(isMarkerOnArc(tidemarkHeroGeometry)).toBe(true);
    expect(
      Math.hypot(
        point.x - tidemarkHeroGeometry.center.cx,
        point.y - tidemarkHeroGeometry.center.cy
      )
    ).toBeCloseTo(tidemarkHeroGeometry.marker.radius, 10);
  });

  it('keeps the privacy marker on its intended r=220 arc', () => {
    const point = markerPoint(tidemarkPrivacyGeometry);

    expect(point).toEqual(tidemarkPrivacyMarker);
    expect(isMarkerOnArc(tidemarkPrivacyGeometry)).toBe(true);
    expect(
      Math.hypot(
        point.x - tidemarkPrivacyGeometry.center.cx,
        point.y - tidemarkPrivacyGeometry.center.cy
      )
    ).toBeCloseTo(220, 10);
    expect(
      tidemarkPrivacyGeometry.arcs.some((arc) => arc.radius === tidemarkPrivacyGeometry.marker.radius)
    ).toBe(true);
  });

  it('runs the same arithmetic in the opposite direction (angle sanity)', () => {
    const origin = { cx: 0, cy: 0 };
    expect(pointOnCircle(origin, 10, 0).x).toBeCloseTo(10, 12);
    expect(pointOnCircle(origin, 10, 90).y).toBeCloseTo(10, 12);
    expect(pointOnCircle(origin, 10, 180).x).toBeCloseTo(-10, 12);
    expect(pointOnCircle(origin, 10, 270).y).toBeCloseTo(-10, 12);
  });
});
