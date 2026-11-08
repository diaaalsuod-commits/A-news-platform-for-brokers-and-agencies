import { describe, expect, it } from 'vitest';
import { isSelectable, REFERENCE_KINDS } from './reference-kinds.js';

describe('reference data kinds', () => {
  it('FR-ADM-04 only amenity categories and amenities have an icon', () => {
    const withIcon = Object.entries(REFERENCE_KINDS)
      .filter(([, shape]) => shape.icon)
      .map(([kind]) => kind);
    expect(withIcon.sort()).toEqual(['amenities', 'amenity-categories']);
  });

  it('FR-ADM-04 a deactivated amenity no longer appears in new selections', () => {
    expect(isSelectable({ isActive: true }, { isActive: true })).toBe(true);
    expect(isSelectable({ isActive: false }, { isActive: true })).toBe(false);
    expect(isSelectable({ isActive: true }, { isActive: false })).toBe(false);
    expect(isSelectable({ isActive: true })).toBe(true);
  });
});
