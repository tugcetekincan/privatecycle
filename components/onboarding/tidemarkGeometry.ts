/**
 * Shared geometry for the Tidemark onboarding illustrations.
 *
 * The marker must sit on the arc it belongs to. Both values are derived from
 * the same center/radius/angle, and every illustration draws its arc and its
 * marker inside one SVG viewBox. Keeping the math here means the visual and
 * the regression test can never drift apart.
 */
export interface Point {
  x: number;
  y: number;
}

export interface CircleCenter {
  cx: number;
  cy: number;
}

export interface ArcSpec {
  radius: number;
  width: number;
  opacity: number;
}

export interface MarkerSpec {
  radius: number;
  angle: number;
  dotRadius: number;
  haloRadius: number;
}

export interface TidemarkGeometry {
  viewBox: { width: number; height: number };
  center: CircleCenter;
  arcs: readonly ArcSpec[];
  marker: MarkerSpec;
}

export function pointOnCircle(
  center: CircleCenter,
  radius: number,
  angleDegrees: number
): Point {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: center.cx + radius * Math.cos(radians),
    y: center.cy + radius * Math.sin(radians),
  };
}

export function markerPoint(geometry: TidemarkGeometry): Point {
  return pointOnCircle(geometry.center, geometry.marker.radius, geometry.marker.angle);
}

export function isMarkerOnArc(geometry: TidemarkGeometry, tolerance = 0.0001): boolean {
  const point = markerPoint(geometry);
  const distance = Math.hypot(
    point.x - geometry.center.cx,
    point.y - geometry.center.cy
  );
  const radiusExists = geometry.arcs.some(
    (arc) => Math.abs(arc.radius - geometry.marker.radius) < tolerance
  );
  return radiusExists && Math.abs(distance - geometry.marker.radius) < tolerance;
}

/**
 * Screen 1. The arcs are cropped by the SVG viewport, not by transforms, so the
 * marker and its arc share the exact same coordinate system at every width.
 */
export const tidemarkHeroGeometry: TidemarkGeometry = {
  viewBox: { width: 390, height: 330 },
  center: { cx: 352, cy: -18 },
  arcs: [
    { radius: 140, width: 1.6, opacity: 0.9 },
    { radius: 188, width: 1.6, opacity: 0.85 },
    { radius: 236, width: 1.8, opacity: 0.8 },
    { radius: 286, width: 1.8, opacity: 0.72 },
    { radius: 338, width: 1.7, opacity: 0.64 },
    { radius: 392, width: 1.6, opacity: 0.56 },
    { radius: 448, width: 1.4, opacity: 0.46 },
  ],
  marker: { radius: 338, angle: 140, dotRadius: 5.2, haloRadius: 12 },
};

/**
 * Screen 3. A second, quieter tide cradles the device and backup file. The
 * marker is derived from the r=220 arc so it cannot float between lines.
 */
export const tidemarkPrivacyGeometry: TidemarkGeometry = {
  viewBox: { width: 340, height: 250 },
  center: { cx: 10, cy: 260 },
  arcs: [
    { radius: 130, width: 1, opacity: 0.52 },
    { radius: 175, width: 1.1, opacity: 0.48 },
    { radius: 220, width: 1.3, opacity: 0.62 },
    { radius: 265, width: 1.1, opacity: 0.38 },
  ],
  marker: { radius: 220, angle: -70, dotRadius: 3.8, haloRadius: 9 },
};

export const tidemarkHeroMarker = markerPoint(tidemarkHeroGeometry);
export const tidemarkPrivacyMarker = markerPoint(tidemarkPrivacyGeometry);
