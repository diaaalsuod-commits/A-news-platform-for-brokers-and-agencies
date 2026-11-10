import { describe, expect, it } from 'vitest';
import { isInsideUae, UAE_BOUNDS } from './uae-bounds.js';

/** The centers the reference seed gives the seven emirates (content.seed.ts). */
const SEEDED_EMIRATES: [name: string, lng: number, lat: number][] = [
  ['Abu Dhabi', 54.3773, 24.4539],
  ['Dubai', 55.2708, 25.2048],
  ['Sharjah', 55.4033, 25.3463],
  ['Ajman', 55.44, 25.41],
  ['Umm Al Quwain', 55.5532, 25.5647],
  ['Ras Al Khaimah', 55.9432, 25.7895],
  ['Fujairah', 56.3265, 25.1288],
];

describe('UAE bounding box', () => {
  it('FR-LOC-04 the box is 51.4 to 56.6 east and 22.4 to 26.5 north', () => {
    expect(UAE_BOUNDS).toEqual({ west: 51.4, east: 56.6, south: 22.4, north: 26.5 });
  });

  it.each(SEEDED_EMIRATES)('FR-LOC-04 the seeded center of %s is inside', (_name, lng, lat) => {
    expect(isInsideUae({ lng, lat })).toBe(true);
  });

  it.each(SEEDED_EMIRATES)(
    'FR-DAT-03 the center of %s with lng and lat swapped is refused',
    (_name, lng, lat) => {
      expect(isInsideUae({ lng: lat, lat: lng })).toBe(false);
    },
  );

  it('FR-LOC-04 no pair can be inside both ways round: the two ranges do not overlap', () => {
    expect(UAE_BOUNDS.north).toBeLessThan(UAE_BOUNDS.west);
  });

  it('FR-LOC-04 the edges are inside and a point just past each edge is outside', () => {
    const { west, east, south, north } = UAE_BOUNDS;
    expect(isInsideUae({ lng: west, lat: south })).toBe(true);
    expect(isInsideUae({ lng: east, lat: north })).toBe(true);
    for (const point of [
      { lng: west - 0.01, lat: 24 },
      { lng: east + 0.01, lat: 24 },
      { lng: 54, lat: south - 0.01 },
      { lng: 54, lat: north + 0.01 },
    ]) {
      expect(isInsideUae(point), JSON.stringify(point)).toBe(false);
    }
  });

  it('FR-LOC-04 places far outside the UAE are refused', () => {
    for (const [name, lng, lat] of [
      ['Riyadh', 46.6753, 24.7136],
      ['Muscat', 58.4059, 23.588],
      ['Manama', 50.5861, 26.2235],
      ['Null Island', 0, 0],
      ['London', -0.1276, 51.5072],
    ] as [string, number, number][]) {
      expect(isInsideUae({ lng, lat }), name).toBe(false);
    }
  });

  it('a box is not the border: a neighbouring town inside the box still passes', () => {
    // Al Buraimi, Oman, next to Al Ain. Only a boundary polygon could refuse it.
    expect(isInsideUae({ lng: 55.79, lat: 24.25 })).toBe(true);
  });

  it('refuses values that are not finite numbers', () => {
    expect(isInsideUae({ lng: Number.NaN, lat: 25 })).toBe(false);
    expect(isInsideUae({ lng: 55, lat: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
