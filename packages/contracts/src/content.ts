import { z } from 'zod';
import { emailSchema, phoneSchema } from './account.js';
import { httpsUrlSchema } from './agency.js';
import { areaLevelSchema, recordStatusSchema } from './enums.js';
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
