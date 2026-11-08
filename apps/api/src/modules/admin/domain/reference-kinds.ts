import type { ReferenceKind } from '@reih/contracts';

/** FR-ADM-04: the fields each kind of reference data has (docs/design/schema.sql). */
export interface ReferenceKindShape {
  code: boolean;
  sortOrder: boolean;
  bedrooms: boolean;
  icon: boolean;
  category: boolean;
}

const coded: ReferenceKindShape = {
  code: true,
  sortOrder: true,
  bedrooms: false,
  icon: false,
  category: false,
};

export const REFERENCE_KINDS: Record<ReferenceKind, ReferenceKindShape> = {
  'property-types': coded,
  layouts: { ...coded, bedrooms: true },
  'unit-levels': coded,
  'furnishing-types': coded,
  'unit-tags': coded,
  'amenity-categories': {
    code: false,
    sortOrder: true,
    bedrooms: false,
    icon: true,
    category: false,
  },
  amenities: { code: false, sortOrder: false, bedrooms: false, icon: true, category: true },
};

/**
 * FR-ADM-04: an item appears in new selections only while it is active, and an amenity only while
 * its category is active too.
 */
export function isSelectable(
  item: { isActive: boolean },
  category?: { isActive: boolean },
): boolean {
  return item.isActive && (category === undefined || category.isActive);
}
