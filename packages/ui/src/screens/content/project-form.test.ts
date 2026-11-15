import type { Project, ReferenceItem } from '@reih/contracts';
import { describe, expect, it } from 'vitest';
import {
  amenityCheckable,
  asNullableNumber,
  groupAmenities,
  projectDetailsDefaults,
  projectDetailsRequest,
  projectDetailsSchema,
} from './project-form';

const DEVELOPER = '0b9a7c1e-6a3e-4f43-9a51-4d6f9b1d2a01';
const COMMUNITY = '1c8b6d2f-7b4f-4e54-8b62-5e7a0c2e3b02';

const project: Project = {
  id: '2d7c5e3a-8c5a-4f65-9c73-6f8b1d3f4c03',
  nameAr: 'مرسى النخيل',
  nameEn: 'Palm Marina',
  developer: { id: DEVELOPER, nameAr: 'م', nameEn: 'D', status: 'active' },
  community: { id: COMMUNITY, nameAr: 'م', nameEn: 'C', isActive: true },
  stage: 'under_construction',
  status: 'draft',
  lastVerifiedAt: null,
  lastVerificationSource: null,
  updatedAt: '2026-11-15T08:00:00.000Z',
  descriptionAr: null,
  descriptionEn: 'A fictional tower.',
  location: { lng: 55.14, lat: 25.08 },
  expectedLaunchDate: null,
  expectedHandover: { quarter: 3, year: 2029 },
  actualHandoverDate: null,
  ownershipType: 'leasehold',
  leaseTermYears: 99,
  serviceChargeAedPerSqm: '15.50',
  amenityIds: [],
  publishedAt: null,
  createdAt: '2026-11-15T08:00:00.000Z',
};

describe('project Details form (FR-DAT-04)', () => {
  it('FR-DAT-04 a project round-trips through the form unchanged', () => {
    const parsed = projectDetailsSchema.parse(projectDetailsDefaults(project));
    expect(projectDetailsRequest(parsed)).toMatchObject({
      nameEn: 'Palm Marina',
      descriptionAr: null,
      descriptionEn: 'A fictional tower.',
      developerId: DEVELOPER,
      communityId: COMMUNITY,
      location: { lng: 55.14, lat: 25.08 },
      stage: 'under_construction',
      expectedLaunchDate: null,
      expectedHandover: { quarter: 3, year: 2029 },
      ownershipType: 'leasehold',
      leaseTermYears: 99,
      serviceChargeAedPerSqm: '15.50',
    });
  });

  it('FR-DAT-04 an empty new form names every required field', () => {
    const result = projectDetailsSchema.safeParse(projectDetailsDefaults());
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join('.')).sort();
    expect(paths).toEqual(
      [
        'communityId',
        'developerId',
        'location.lat',
        'location.lng',
        'nameAr',
        'nameEn',
        'stage',
      ].sort(),
    );
    // Empty selects read as missing, so the message is "required", not "invalid format".
    const developer = result.error!.issues.find((issue) => issue.path[0] === 'developerId');
    expect(developer?.code).toBe('invalid_type');
  });

  it('BR-05 the expected handover is both parts or neither', () => {
    const base = projectDetailsDefaults(project);
    const none = projectDetailsSchema.parse({
      ...base,
      expectedHandover: { quarter: undefined, year: undefined },
    });
    expect(none.expectedHandover).toBeNull();
    const half = projectDetailsSchema.safeParse({
      ...base,
      expectedHandover: { quarter: 2, year: undefined },
    });
    expect(half.success).toBe(false);
    expect(half.error!.issues[0]!.path).toEqual(['expectedHandover', 'year']);
  });

  it('switching to freehold clears the lease term', () => {
    const parsed = projectDetailsSchema.parse({
      ...projectDetailsDefaults(project),
      ownershipType: 'freehold',
    });
    expect(projectDetailsRequest(parsed).leaseTermYears).toBeNull();
  });

  it('the service charge is a decimal string with at most two decimals, never a float', () => {
    const base = projectDetailsDefaults(project);
    for (const ok of ['15', '15.5', '15.50', '12345678.99']) {
      expect(
        projectDetailsSchema.parse({ ...base, serviceChargeAedPerSqm: ok }).serviceChargeAedPerSqm,
      ).toBe(ok);
    }
    for (const bad of ['15.505', '1,000', '-1', '1e3']) {
      expect(projectDetailsSchema.safeParse({ ...base, serviceChargeAedPerSqm: bad }).success).toBe(
        false,
      );
    }
    expect(
      projectDetailsSchema.parse({ ...base, serviceChargeAedPerSqm: '' }).serviceChargeAedPerSqm,
    ).toBeNull();
  });

  it('an empty number field clears its value', () => {
    expect(asNullableNumber('')).toBeNull();
    expect(asNullableNumber('25')).toBe(25);
  });
});

describe('Amenities tab (FR-DAT-04, FR-ADM-04)', () => {
  const item = (
    id: string,
    nameEn: string,
    categoryId: string | null,
    isActive = true,
  ): ReferenceItem => ({
    id,
    kind: categoryId === null ? 'amenity-categories' : 'amenities',
    code: null,
    nameAr: nameEn,
    nameEn,
    sortOrder: null,
    bedrooms: null,
    icon: null,
    categoryId,
    isActive,
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
  });

  it('groups amenities by category in the API order, unknown categories last', () => {
    const sport = item('c1', 'Sport', null);
    const leisure = item('c2', 'Leisure', null);
    const empty = item('c3', 'Empty', null);
    const groups = groupAmenities(
      [sport, leisure, empty],
      [item('a1', 'Gym', 'c1'), item('a2', 'Pool', 'c2'), item('a3', 'Lost', 'c9')],
    );
    expect(groups.map((group) => group.category?.nameEn ?? null)).toEqual([
      'Sport',
      'Leisure',
      null,
    ]);
    expect(groups[2]!.amenities.map((amenity) => amenity.nameEn)).toEqual(['Lost']);
  });

  it('FR-ADM-04 a deactivated amenity can be unchecked but never checked again', () => {
    const off = item('a1', 'Old spa', 'c1', false);
    expect(amenityCheckable(off, true)).toBe(true);
    expect(amenityCheckable(off, false)).toBe(false);
    expect(amenityCheckable(item('a2', 'Gym', 'c1'), false)).toBe(true);
  });
});
