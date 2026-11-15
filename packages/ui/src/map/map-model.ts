/** A WGS 84 point, as the API takes it (FR-DAT-03, FR-DAT-04). */
export interface LngLat {
  lng: number;
  lat: number;
}

/**
 * The view the map opens on when no point is set: the UAE, as the API's bounding box
 * (content/domain/uae-bounds.ts, 51.4 to 56.6 east, 22.4 to 26.5 north). West-south, east-north.
 */
export const UAE_VIEW: [[number, number], [number, number]] = [
  [51.4, 22.4],
  [56.6, 26.5],
];

/** The zoom the map opens at on a point already set: a community, roughly. */
export const POINT_ZOOM = 13;

/** Six decimals, about 0.1 m: more than a click can mean, and short enough to read and type. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A clicked point, rounded, with the longitude wrapped into -180..180. */
export function pickedPoint(point: LngLat): LngLat {
  const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180;
  return { lng: roundCoordinate(lng), lat: roundCoordinate(point.lat) };
}

/**
 * The point the fields hold, or null while either is empty or not a valid WGS 84 coordinate, so the
 * marker follows what is typed and disappears while a field is incomplete.
 */
export function pointFromFields(lng: unknown, lat: unknown): LngLat | null {
  const x =
    typeof lng === 'number' ? lng : typeof lng === 'string' && lng.trim() ? Number(lng) : NaN;
  const y =
    typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() ? Number(lat) : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  return { lng: x, lat: y };
}
