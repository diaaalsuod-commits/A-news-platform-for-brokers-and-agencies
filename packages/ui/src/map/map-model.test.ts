import { describe, expect, it } from 'vitest';
import { pickedPoint, pointFromFields, roundCoordinate, UAE_VIEW } from './map-model';

describe('map model (FR-DAT-03, FR-DAT-04)', () => {
  it('rounds a coordinate to six decimals', () => {
    expect(roundCoordinate(55.123456789)).toBe(55.123457);
    expect(roundCoordinate(-0.0000004)).toBe(-0);
  });

  it('a clicked point is rounded and its longitude wrapped into -180..180', () => {
    expect(pickedPoint({ lng: 55.2708456789, lat: 25.2048493123 })).toEqual({
      lng: 55.270846,
      lat: 25.204849,
    });
    expect(pickedPoint({ lng: 415.27, lat: 25.2 }).lng).toBeCloseTo(55.27, 6);
  });

  it('a point comes from the fields only when both are valid WGS 84 numbers', () => {
    expect(pointFromFields(55.27, 25.2)).toEqual({ lng: 55.27, lat: 25.2 });
    expect(pointFromFields('55.27', '25.2')).toEqual({ lng: 55.27, lat: 25.2 });
    expect(pointFromFields(undefined, 25.2)).toBeNull();
    expect(pointFromFields('', '25.2')).toBeNull();
    expect(pointFromFields(55.27, Number.NaN)).toBeNull();
    expect(pointFromFields(181, 25)).toBeNull();
    expect(pointFromFields(55, -91)).toBeNull();
    // Outside the UAE is still a point; the API refuses it with outside_uae (FR-LOC-04).
    expect(pointFromFields(2.35, 48.85)).toEqual({ lng: 2.35, lat: 48.85 });
  });

  it('the UAE view is the API bounding box', () => {
    expect(UAE_VIEW).toEqual([
      [51.4, 22.4],
      [56.6, 26.5],
    ]);
  });
});
