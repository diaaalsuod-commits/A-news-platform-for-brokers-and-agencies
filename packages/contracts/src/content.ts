import { z } from 'zod';
import { emailSchema, phoneSchema } from './account.js';
import { referenceItemSchema } from './admin.js';
import { httpsUrlSchema } from './agency.js';
import {
  areaLevelSchema,
  type MediaType,
  mediaTypeSchema,
  ownershipTypeSchema,
  projectStageSchema,
  publishStatusSchema,
  recordStatusSchema,
} from './enums.js';
import { listResponseSchema, pageQuerySchema } from './lists.js';

// Content management (SRS 4.11), part 1: developers, sales contacts and areas. Every endpoint is
// for the Data Operator only, under /api/v1/content. Content is global: it belongs to no agency.

const isoDateTime = z.iso.datetime();
const nameSchema = z.string().trim().min(1).max(200);
const optionalSearch = z.string().trim().max(200).optional();
const activeFilter = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/** An optional field: null or an empty string clears it; leaving it out changes nothing. */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema.nullable()).optional();

/** FR-LOC-03: descriptions are optional in each language; the other language is the fallback. */
export const CONTENT_DESCRIPTION_MAX = 5000;
const descriptionSchema = z.string().trim().max(CONTENT_DESCRIPTION_MAX);

// ---------------------------------------------------------------- developers (FR-DAT-01)

/** FR-DAT-01: a logo is PNG or SVG up to 2 MB, sent as multipart/form-data in this field. */
export const DEVELOPER_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const developerLogoField = 'logo';

export const developerSchema = z.object({
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  website: z.string().nullable(),
  /** Behind the session, for Data Operators; null without a logo. */
  logoUrl: z.string().nullable(),
  status: recordStatusSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Developer = z.infer<typeof developerSchema>;

export const developerListResponseSchema = listResponseSchema(developerSchema);
export type DeveloperListResponse = z.infer<typeof developerListResponseSchema>;

export const developerListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  status: recordStatusSchema.optional(),
});
export type DeveloperListQuery = z.infer<typeof developerListQuerySchema>;

const developerFields = {
  nameAr: nameSchema,
  nameEn: nameSchema,
  descriptionAr: clearable(descriptionSchema),
  descriptionEn: clearable(descriptionSchema),
  /** https only, as an agency's website (docs/decisions.md, P3.2). */
  website: clearable(z.string().trim().pipe(httpsUrlSchema)),
};

/** FR-DAT-01: Arabic and English names are both required. A new developer starts active. */
export const createDeveloperRequestSchema = z.object(developerFields).strict();
export type CreateDeveloperRequest = z.infer<typeof createDeveloperRequestSchema>;

/** Only the fields sent change. status: "archived" archives the developer, "active" restores it. */
export const updateDeveloperRequestSchema = z
  .object({ ...developerFields, status: recordStatusSchema })
  .partial()
  .strict();
export type UpdateDeveloperRequest = z.infer<typeof updateDeveloperRequestSchema>;

// ---------------------------------------------------------------- sales contacts (FR-DAT-02)

/** Lower-case two-letter language codes (ar, en, ru), at most 10, each once. */
export const CONTACT_LANGUAGES_MAX = 10;
export const contactLanguagesSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2}$/),
  )
  .max(CONTACT_LANGUAGES_MAX)
  .refine((codes) => new Set(codes).size === codes.length, { message: 'duplicate language' });

export const CONTACT_PROJECTS_MAX = 500;
const projectIdsSchema = z
  .array(z.uuid())
  .max(CONTACT_PROJECTS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate project' });

const namedRefSchema = z.object({ id: z.uuid(), nameAr: z.string(), nameEn: z.string() });

/**
 * FR-DAT-02: a sales contact as the Data Operator manages it. Phone, WhatsApp and email appear
 * here and in no other response but the reveal (FR-CNT-01).
 */
export const salesContactSchema = z.object({
  id: z.uuid(),
  developer: namedRefSchema.extend({ status: recordStatusSchema }),
  fullName: z.string(),
  title: z.string().nullable(),
  phone: z.string(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  languages: z.array(z.string()),
  /** A UAE calendar day (YYYY-MM-DD). */
  verifiedAt: z.iso.date().nullable(),
  verificationSource: z.string().nullable(),
  isActive: z.boolean(),
  projectCount: z.number().int().min(0),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SalesContact = z.infer<typeof salesContactSchema>;

/** One contact, with the projects it is assigned to. */
export const salesContactDetailSchema = salesContactSchema.extend({
  projects: z.array(namedRefSchema),
});
export type SalesContactDetail = z.infer<typeof salesContactDetailSchema>;

export const salesContactListResponseSchema = listResponseSchema(salesContactSchema);
export type SalesContactListResponse = z.infer<typeof salesContactListResponseSchema>;

/**
 * q searches the name and the title only: the request URL is logged, so a phone number or an
 * email must never travel in it.
 */
export const salesContactListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  developerId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  active: activeFilter,
});
export type SalesContactListQuery = z.infer<typeof salesContactListQuerySchema>;

const salesContactFields = {
  developerId: z.uuid(),
  fullName: z.string().trim().min(1).max(150),
  /** E.164, for example +971501234567. */
  phone: phoneSchema,
  title: clearable(z.string().trim().max(100)),
  whatsapp: clearable(phoneSchema),
  email: clearable(emailSchema),
  languages: contactLanguagesSchema.optional(),
  /** A UAE calendar day, today or earlier; it comes together with the source or not at all. */
  verifiedAt: clearable(z.iso.date()),
  verificationSource: clearable(z.string().trim().max(500)),
  isActive: z.boolean().optional(),
  /** The whole set of assigned projects; each must belong to the contact's developer. */
  projectIds: projectIdsSchema.optional(),
};

export const createSalesContactRequestSchema = z.object(salesContactFields).strict();
export type CreateSalesContactRequest = z.infer<typeof createSalesContactRequestSchema>;

/** Only the fields sent change. projectIds, when sent, replaces the whole set. */
export const updateSalesContactRequestSchema = z.object(salesContactFields).partial().strict();
export type UpdateSalesContactRequest = z.infer<typeof updateSalesContactRequestSchema>;

// ---------------------------------------------------------------- areas (FR-DAT-03, FR-LOC-04)

/** FR-LOC-04: the only market of v1.0. The server sets it; a client never sends it. */
export const COUNTRY_CODE = 'AE';

/** WGS 84 degrees. The server checks that the point lies inside the UAE. */
export const geoPointSchema = z.object({ lng: z.number(), lat: z.number() }).strict();
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const areaSchema = z.object({
  id: z.uuid(),
  level: areaLevelSchema,
  /** The emirate of a community; null for an emirate. */
  parentId: z.uuid().nullable(),
  countryCode: z.literal(COUNTRY_CODE),
  nameAr: z.string(),
  nameEn: z.string(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  center: geoPointSchema,
  isActive: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Area = z.infer<typeof areaSchema>;

export const areaListResponseSchema = listResponseSchema(areaSchema);
export type AreaListResponse = z.infer<typeof areaListResponseSchema>;

export const areaListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  level: areaLevelSchema.optional(),
  parentId: z.uuid().optional(),
  active: activeFilter,
});
export type AreaListQuery = z.infer<typeof areaListQuerySchema>;

const areaFields = {
  nameAr: nameSchema,
  nameEn: nameSchema,
  descriptionAr: clearable(descriptionSchema),
  descriptionEn: clearable(descriptionSchema),
  center: geoPointSchema,
  isActive: z.boolean().optional(),
};

/** FR-DAT-03: a community names its emirate in parentId; an emirate has none. */
export const createAreaRequestSchema = z
  .object({ level: areaLevelSchema, parentId: z.uuid().nullable().optional(), ...areaFields })
  .strict();
export type CreateAreaRequest = z.infer<typeof createAreaRequestSchema>;

/** The level is fixed once created. A community may move to another emirate. */
export const updateAreaRequestSchema = z
  .object({ parentId: z.uuid(), ...areaFields })
  .partial()
  .strict();
export type UpdateAreaRequest = z.infer<typeof updateAreaRequestSchema>;

// ---------------------------------------------------------------- projects (FR-DAT-04, FR-DAT-05, FR-DAT-10)

/** Any valid WGS 84 point. Whether it lies inside the UAE is checked when publishing (FR-DAT-05). */
export const wgs84PointSchema = z
  .object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) })
  .strict();

/** BR-05: the expected handover, a quarter and a year, kept apart from the actual handover date. */
export const expectedHandoverSchema = z
  .object({
    quarter: z.number().int().min(1).max(4),
    year: z.number().int().min(2000).max(2100),
  })
  .strict();
export type ExpectedHandover = z.infer<typeof expectedHandoverSchema>;

/** A leasehold term in whole years. */
export const LEASE_TERM_MAX_YEARS = 99;
/** AED per m², numeric(10,2): up to 8 digits, then up to 2 decimals, as a string, never a float. */
export const serviceChargeSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/);
export const PROJECT_AMENITIES_MAX = 100;
const amenityIdsSchema = z
  .array(z.uuid())
  .max(PROJECT_AMENITIES_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate amenity' });

/**
 * FR-DAT-05: everything a project may lack for publishing, by a stable code, in this order. The
 * Operations Dashboard names each one in the user's language.
 */
export const publishBlockerValues = [
  'developer_missing',
  'developer_archived',
  'community_missing',
  'location_missing',
  'location_outside_uae',
  'stage_missing',
  'expected_handover_missing',
  'licensed_image_missing',
  'verification_missing',
] as const;
export const publishBlockerSchema = z.enum(publishBlockerValues);
export type PublishBlocker = z.infer<typeof publishBlockerSchema>;

const projectRefFields = {
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string(),
  developer: namedRefSchema.extend({ status: recordStatusSchema }),
  community: namedRefSchema.extend({ isActive: z.boolean() }),
  stage: projectStageSchema,
  status: publishStatusSchema,
  /** The UAE calendar day of the latest verification (FR-DAT-10, BR-07). */
  lastVerifiedAt: z.iso.date().nullable(),
  lastVerificationSource: z.string().nullable(),
  updatedAt: isoDateTime,
};

/** A project in a list (FR-DAT-04) and in the needs-verification list (FR-DAT-10). */
export const projectSummarySchema = z.object(projectRefFields);
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** FR-DAT-04: a project as the Data Operator manages it. */
export const projectSchema = z.object({
  ...projectRefFields,
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  location: geoPointSchema,
  /** Optional, shown for upcoming projects (FR-PRJ-09); never a publishing blocker. */
  expectedLaunchDate: z.iso.date().nullable(),
  expectedHandover: expectedHandoverSchema.nullable(),
  actualHandoverDate: z.iso.date().nullable(),
  ownershipType: ownershipTypeSchema,
  leaseTermYears: z.number().int().nullable(),
  serviceChargeAedPerSqm: z.string().nullable(),
  amenityIds: z.array(z.uuid()),
  publishedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Project = z.infer<typeof projectSchema>;

export const projectListResponseSchema = listResponseSchema(projectSummarySchema);
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

/** q matches either name. */
export const projectListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  status: publishStatusSchema.optional(),
  stage: projectStageSchema.optional(),
  developerId: z.uuid().optional(),
  communityId: z.uuid().optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

/** FR-DAT-10: archived projects never appear, so only draft and published can be asked for. */
export const needsVerificationQuerySchema = pageQuerySchema.extend({
  status: z.enum(['draft', 'published']).optional(),
});
export type NeedsVerificationQuery = z.infer<typeof needsVerificationQuerySchema>;

const projectFields = {
  nameAr: nameSchema,
  nameEn: nameSchema,
  descriptionAr: clearable(descriptionSchema),
  descriptionEn: clearable(descriptionSchema),
  developerId: z.uuid(),
  communityId: z.uuid(),
  location: wgs84PointSchema,
  stage: projectStageSchema,
  expectedLaunchDate: clearable(z.iso.date()),
  expectedHandover: clearable(expectedHandoverSchema),
  actualHandoverDate: clearable(z.iso.date()),
  ownershipType: ownershipTypeSchema,
  /** Required for leasehold, refused for freehold. */
  leaseTermYears: clearable(z.number().int().min(1).max(LEASE_TERM_MAX_YEARS)),
  serviceChargeAedPerSqm: clearable(serviceChargeSchema),
  /** The whole set of amenities; a new one must be active (FR-ADM-04). */
  amenityIds: amenityIdsSchema.optional(),
};

/** FR-DAT-04: a new project is always a draft; there is no status field. */
export const createProjectRequestSchema = z.object(projectFields).strict();
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

/** Only the fields sent change. Status changes through publish, unpublish and archive only. */
export const updateProjectRequestSchema = z.object(projectFields).partial().strict();
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

/** FR-DAT-10: the date is a UAE calendar day, today or earlier; the source is required. */
export const verifyProjectRequestSchema = z
  .object({
    date: z.iso.date(),
    source: z.string().trim().min(1).max(500),
    notes: clearable(z.string().trim().max(2000)),
  })
  .strict();
export type VerifyProjectRequest = z.infer<typeof verifyProjectRequestSchema>;

// ---------------------------------------------------------------- reference options (FR-DAT-04, FR-DAT-08, FR-ADM-04)

/** At most this many ids in ?include, so the whole list stays small. */
export const REFERENCE_INCLUDE_MAX = 100;

/**
 * GET /content/reference/:kind. include names items already on a record (a project's amenities, a
 * unit's property type), so they show their names even when they can no longer be chosen. A
 * comma-separated list of ids; a malformed id, more than 100 ids or a repeated parameter is a 400.
 */
export const contentReferenceQuerySchema = z
  .object({
    include: z
      .string()
      .max(REFERENCE_INCLUDE_MAX * 37)
      .transform((value) => value.split(','))
      .pipe(z.array(z.uuid()).min(1).max(REFERENCE_INCLUDE_MAX))
      .optional(),
  })
  .strict();
export type ContentReferenceQuery = z.infer<typeof contentReferenceQuerySchema>;

/**
 * The options of one kind of reference data for the Data Operator's forms. Not paged, an exception
 * to the list rule (docs/decisions.md, P4.4 part b): these are small dictionaries the Platform Admin
 * keeps, so the list is every item new selections may offer plus at most 100 included ones.
 *
 * Here isActive means "can be chosen for new selections" (FR-ADM-04), not the item's own flag: an
 * included item that is deactivated is false, and so is an amenity that is active itself but whose
 * category is deactivated. Every item listed without include is true.
 */
export const contentReferenceListResponseSchema = z.object({
  items: z.array(referenceItemSchema),
});
export type ContentReferenceListResponse = z.infer<typeof contentReferenceListResponseSchema>;

// ---------------------------------------------------------------- media (FR-DAT-06, BR-14)

const MB = 1024 * 1024;

/**
 * FR-DAT-06: the largest file for each media type. Images are JPEG, PNG or WebP; floor plans,
 * brochures and master plans are PDF; videos are MP4. The real type is judged by the file's bytes.
 */
export const MEDIA_MAX_BYTES = {
  image: 10 * MB,
  floor_plan: 25 * MB,
  brochure: 25 * MB,
  master_plan: 25 * MB,
  video: 200 * MB,
} as const satisfies Record<MediaType, number>;

/** The multipart form field that carries the file; the text fields must come before it. */
export const mediaFileField = 'file';
export const MEDIA_NOTE_MAX = 1000;
export const MEDIA_DISPLAY_ORDER_MAX = 9999;

const mediaNoteSchema = z.string().trim().min(1).max(MEDIA_NOTE_MAX);
const mediaTitleSchema = z.string().trim().min(1).max(200);

/**
 * FR-DAT-06, BR-14: the text fields of an upload, sent before the file part as multipart fields
 * (strings). The source and the license note are mandatory.
 */
export const mediaUploadFieldsSchema = z
  .object({
    type: mediaTypeSchema,
    title: mediaTitleSchema,
    displayOrder: z
      .string()
      .regex(/^\d{1,4}$/)
      .transform(Number)
      .optional(),
    sourceNote: mediaNoteSchema,
    licenseNote: mediaNoteSchema,
  })
  .strict();
export type MediaUploadFields = z.infer<typeof mediaUploadFieldsSchema>;

/** Only the fields sent change. The type is fixed: it decided which files were accepted. */
export const updateMediaRequestSchema = z
  .object({
    title: mediaTitleSchema,
    displayOrder: z.number().int().min(0).max(MEDIA_DISPLAY_ORDER_MAX),
    sourceNote: mediaNoteSchema,
    licenseNote: mediaNoteSchema,
  })
  .partial()
  .strict();
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;

/** A media file as the Data Operator manages it. */
export const mediaSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** FR-DAT-08: the unit whose floor plan this is, linked from the unit (PATCH …/units/:unitId). */
  unitId: z.uuid().nullable(),
  type: mediaTypeSchema,
  title: z.string(),
  displayOrder: z.number().int(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sourceNote: z.string(),
  licenseNote: z.string(),
  /** Behind the session, for Data Operators. */
  fileUrl: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Media = z.infer<typeof mediaSchema>;

export const mediaListResponseSchema = listResponseSchema(mediaSchema);
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;

export const mediaListQuerySchema = pageQuerySchema.extend({ type: mediaTypeSchema.optional() });
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
