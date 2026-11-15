import {
  type CreateProjectRequest,
  createProjectRequestSchema,
  expectedHandoverSchema,
  type Project,
  type ReferenceItem,
} from '@reih/contracts';
import { z } from 'zod';

/** An empty select or field is "not chosen", so the message reads "required". */
const emptyAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema);

/**
 * BR-05: the expected handover is a quarter and a year, or neither. Both empty clears it; one
 * without the other is refused on the missing field.
 */
const handoverField = z
  .preprocess((value) => {
    if (value && typeof value === 'object') {
      const { quarter, year } = value as { quarter?: unknown; year?: unknown };
      const empty = (part: unknown) => part === undefined || part === null || part === '';
      if (empty(quarter) && empty(year)) return null;
    }
    return value;
  }, expectedHandoverSchema.nullable())
  .optional();

const shape = createProjectRequestSchema.shape;

/**
 * FR-DAT-04: the Details form, the same for a new project and an existing one. Built from the
 * contract's create schema, so the API's rules apply here too; amenities have their own tab.
 */
export const projectDetailsSchema = createProjectRequestSchema.omit({ amenityIds: true }).extend({
  developerId: emptyAsMissing(shape.developerId),
  communityId: emptyAsMissing(shape.communityId),
  stage: emptyAsMissing(shape.stage),
  expectedHandover: handoverField,
});

export type ProjectDetailsInput = z.input<typeof projectDetailsSchema>;
export type ProjectDetailsValues = z.output<typeof projectDetailsSchema>;

/** The form's starting values: a project's, or empty ones for a new project. */
export function projectDetailsDefaults(project?: Project): ProjectDetailsInput {
  return {
    nameAr: project?.nameAr ?? '',
    nameEn: project?.nameEn ?? '',
    descriptionAr: project?.descriptionAr ?? '',
    descriptionEn: project?.descriptionEn ?? '',
    developerId: project?.developer.id ?? '',
    communityId: project?.community.id ?? '',
    location: { lng: project?.location.lng, lat: project?.location.lat } as never,
    stage: project?.stage ?? ('' as never),
    expectedLaunchDate: project?.expectedLaunchDate ?? '',
    expectedHandover: {
      quarter: project?.expectedHandover?.quarter,
      year: project?.expectedHandover?.year,
    } as never,
    actualHandoverDate: project?.actualHandoverDate ?? '',
    ownershipType: project?.ownershipType ?? 'freehold',
    leaseTermYears: project?.leaseTermYears ?? null,
    serviceChargeAedPerSqm: project?.serviceChargeAedPerSqm ?? '',
  };
}

/**
 * The request body for POST and PATCH. A lease term goes only with leasehold: switching to
 * freehold clears it, as the API requires (leaseTermYears: not_allowed).
 */
export function projectDetailsRequest(values: ProjectDetailsValues): CreateProjectRequest {
  return {
    ...values,
    leaseTermYears: values.ownershipType === 'leasehold' ? (values.leaseTermYears ?? null) : null,
  } as CreateProjectRequest;
}

/** An empty number field clears its value (null), unlike leaving a PATCH field out. */
export const asNullableNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);

/** The amenities of one category, for the checkbox groups of the Amenities tab. */
export interface AmenityGroup {
  category: ReferenceItem | null;
  amenities: ReferenceItem[];
}

/**
 * FR-DAT-04, FR-ADM-04: amenities grouped by category, in the categories' order and then the
 * amenities' order as the API lists them. An amenity whose category is missing from the list goes
 * in a last group without a category.
 */
export function groupAmenities(
  categories: readonly ReferenceItem[],
  amenities: readonly ReferenceItem[],
): AmenityGroup[] {
  const groups = categories.map((category) => ({
    category,
    amenities: amenities.filter((amenity) => amenity.categoryId === category.id),
  }));
  const known = new Set(categories.map((category) => category.id));
  const orphans = amenities.filter(
    (amenity) => amenity.categoryId === null || !known.has(amenity.categoryId),
  );
  return [
    ...groups.filter((group) => group.amenities.length > 0),
    ...(orphans.length > 0 ? [{ category: null, amenities: orphans }] : []),
  ];
}

/**
 * Whether an amenity's checkbox can change: an active one always; a deactivated one (isActive
 * false, FR-ADM-04) only to be unchecked, never checked again.
 */
export function amenityCheckable(amenity: ReferenceItem, checked: boolean): boolean {
  return amenity.isActive || checked;
}
