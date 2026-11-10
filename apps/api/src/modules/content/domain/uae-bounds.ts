/**
 * FR-LOC-04: the UAE is the only market, so every point the content module stores lies inside this
 * box: an area's center now, a project's location in FR-DAT-05.
 *
 * The box is the UAE's extent (about 51.5 to 56.4 east, 22.6 to 26.1 north) with a small margin, in
 * WGS 84 degrees. Its longitudes and latitudes do not overlap, so a pair entered the wrong way
 * round is always outside it.
 *
 * A box is not the border: it also covers strips of Oman, Saudi Arabia and Qatar next to the UAE,
 * so it catches gross mistakes, not a point just across the border.
 */
export const UAE_BOUNDS = { west: 51.4, east: 56.6, south: 22.4, north: 26.5 } as const;

export interface LngLat {
  lng: number;
  lat: number;
}

/** True when the point lies inside the UAE's bounding box. */
export function isInsideUae({ lng, lat }: LngLat): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= UAE_BOUNDS.west &&
    lng <= UAE_BOUNDS.east &&
    lat >= UAE_BOUNDS.south &&
    lat <= UAE_BOUNDS.north
  );
}
