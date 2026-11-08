import { z } from 'zod';
import { emailSchema, phoneSchema } from './account.js';
import { agencyStatusSchema, langCodeSchema, userStatusSchema } from './enums.js';
import { currencySchema, listResponseSchema, pageQuerySchema } from './lists.js';

// Platform administration (SRS 4.12). Every endpoint is for the Platform Admin only.

/** A path id. A malformed one is refused before it reaches the database. */
export const idParamSchema = z.uuid();

const nameSchema = z.string().trim().min(1).max(200);
const optionalSearch = z.string().trim().max(200).optional();
const isoDateTime = z.iso.datetime();

// ---------------------------------------------------------------- agencies (FR-ADM-01, FR-ADM-02)

export const agencySchema = z.object({
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string(),
  tradeLicenseNo: z.string(),
  contactEmail: z.string(),
  contactPhone: z.string(),
  status: agencyStatusSchema,
  statusReason: z.string().nullable(),
  statusChangedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Agency = z.infer<typeof agencySchema>;

export const agencyListResponseSchema = listResponseSchema(agencySchema);
export type AgencyListResponse = z.infer<typeof agencyListResponseSchema>;

export const agencyListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  status: agencyStatusSchema.optional(),
});
export type AgencyListQuery = z.infer<typeof agencyListQuerySchema>;

/** FR-ADM-01: Arabic and English names, a unique trade license number, contact email and phone. */
export const createAgencyRequestSchema = z
  .object({
    nameAr: nameSchema,
    nameEn: nameSchema,
    tradeLicenseNo: z.string().trim().min(1).max(50),
    contactEmail: emailSchema,
    contactPhone: phoneSchema,
  })
  .strict();
export type CreateAgencyRequest = z.infer<typeof createAgencyRequestSchema>;

export const updateAgencyRequestSchema = createAgencyRequestSchema.partial().strict();
export type UpdateAgencyRequest = z.infer<typeof updateAgencyRequestSchema>;

/** FR-ADM-02: suspending and reactivating both need a reason; an empty or blank one is refused. */
export const AGENCY_STATUS_REASON_MAX = 1000;
export const agencyStatusChangeRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(AGENCY_STATUS_REASON_MAX) })
  .strict();
export type AgencyStatusChangeRequest = z.infer<typeof agencyStatusChangeRequestSchema>;

// ---------------------------------------------------------------- invitations and staff (FR-ADM-01, FR-ADM-03)

export const staffRoleValues = ['data_operator', 'platform_admin'] as const;
export const staffRoleSchema = z.enum(staffRoleValues);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** A pending invitation; an expired one can still be resent or cancelled. */
export const invitationSummarySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  role: z.string(),
  state: z.enum(['pending', 'expired']),
  expiresAt: isoDateTime,
  lastSentAt: isoDateTime,
  createdAt: isoDateTime,
});
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;

export const invitationListResponseSchema = listResponseSchema(invitationSummarySchema);
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/** FR-ADM-01: the agency's first Agency Admin. The email language defaults to the inviter's. */
export const inviteAgencyAdminRequestSchema = z
  .object({ email: emailSchema, language: langCodeSchema.optional() })
  .strict();
export type InviteAgencyAdminRequest = z.infer<typeof inviteAgencyAdminRequestSchema>;

/** FR-ADM-03: a Data Operator or a Platform Admin. */
export const inviteStaffRequestSchema = z
  .object({ email: emailSchema, role: staffRoleSchema, language: langCodeSchema.optional() })
  .strict();
export type InviteStaffRequest = z.infer<typeof inviteStaffRequestSchema>;

export const inviteResponseSchema = z.object({ invitationId: z.uuid(), userId: z.uuid() });
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const staffMemberSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: staffRoleSchema,
  status: userStatusSchema,
  lastLoginAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  pendingInvitation: invitationSummarySchema.nullable(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const staffListResponseSchema = listResponseSchema(staffMemberSchema);
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;

export const staffListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  role: staffRoleSchema.optional(),
  status: userStatusSchema.optional(),
});
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

export const changeStaffRoleRequestSchema = z.object({ role: staffRoleSchema }).strict();
export type ChangeStaffRoleRequest = z.infer<typeof changeStaffRoleRequestSchema>;

// ---------------------------------------------------------------- reference data (FR-ADM-04)

export const referenceKindValues = [
  'property-types',
  'layouts',
  'unit-levels',
  'furnishing-types',
  'unit-tags',
  'amenity-categories',
  'amenities',
] as const;
export const referenceKindSchema = z.enum(referenceKindValues);
export type ReferenceKind = z.infer<typeof referenceKindSchema>;

/**
 * FR-ADM-04: icons of amenity categories and amenities are keys from this list, not uploads
 * (docs/decisions.md, P3.1). The web apps and the PDF worker map each key to a bundled icon.
 */
export const AMENITY_ICON_KEYS = [
  'pool',
  'kids-pool',
  'gym',
  'spa',
  'sauna',
  'jacuzzi',
  'yoga',
  'running-track',
  'cycling',
  'tennis',
  'padel',
  'basketball',
  'football',
  'golf',
  'beach',
  'marina',
  'park',
  'garden',
  'bbq',
  'playground',
  'kids-club',
  'parking',
  'ev-charging',
  'security',
  'cctv',
  'concierge',
  'reception',
  'elevator',
  'retail',
  'supermarket',
  'restaurant',
  'cafe',
  'mosque',
  'school',
  'nursery',
  'clinic',
  'pharmacy',
  'cinema',
  'games-room',
  'business-center',
  'co-working',
  'library',
  'pet-friendly',
  'laundry',
  'maintenance',
  'smart-home',
  'wifi',
  'balcony',
  'view',
  'storage',
  'other',
] as const;
export const amenityIconKeySchema = z.enum(AMENITY_ICON_KEYS);
export type AmenityIconKey = z.infer<typeof amenityIconKeySchema>;

/** A stable key for imports and seeds; set once, when the item is created. */
export const referenceCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,30}$/);

const sortOrderSchema = z.number().int().min(0).max(32_767);
const bedroomsSchema = z.number().int().min(0).max(20);

/** Every kind in one shape; a field the kind does not have is null. */
export const referenceItemSchema = z.object({
  id: z.uuid(),
  kind: referenceKindSchema,
  code: z.string().nullable(),
  nameAr: z.string(),
  nameEn: z.string(),
  sortOrder: z.number().int().nullable(),
  bedrooms: z.number().int().nullable(),
  icon: amenityIconKeySchema.nullable(),
  categoryId: z.uuid().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type ReferenceItem = z.infer<typeof referenceItemSchema>;

export const referenceListResponseSchema = listResponseSchema(referenceItemSchema);
export type ReferenceListResponse = z.infer<typeof referenceListResponseSchema>;

export const referenceListQuerySchema = pageQuerySchema.extend({
  q: optionalSearch,
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  categoryId: z.uuid().optional(),
});
export type ReferenceListQuery = z.infer<typeof referenceListQuerySchema>;

const codedFields = {
  code: referenceCodeSchema,
  nameAr: nameSchema,
  nameEn: nameSchema,
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
};
const categoryFields = {
  nameAr: nameSchema,
  nameEn: nameSchema,
  icon: amenityIconKeySchema.nullable().optional(),
  sortOrder: sortOrderSchema.optional(),
  isActive: z.boolean().optional(),
};
const amenityFields = {
  categoryId: z.uuid(),
  nameAr: nameSchema,
  nameEn: nameSchema,
  icon: amenityIconKeySchema.nullable().optional(),
  isActive: z.boolean().optional(),
};
const coded = z.object(codedFields).strict();
const layout = z.object({ ...codedFields, bedrooms: bedroomsSchema }).strict();
const category = z.object(categoryFields).strict();
const amenity = z.object(amenityFields).strict();

/** FR-ADM-04: the fields each kind takes on creation. Arabic and English names are both required. */
export const createReferenceRequestSchemas = {
  'property-types': coded,
  layouts: layout,
  'unit-levels': coded,
  'furnishing-types': coded,
  'unit-tags': coded,
  'amenity-categories': category,
  amenities: amenity,
} as const satisfies Record<ReferenceKind, z.ZodType>;

const codedUpdate = coded.omit({ code: true }).partial().strict();
const layoutUpdate = layout.omit({ code: true }).partial().strict();

/** The code is fixed once created; everything else may change, including isActive. */
export const updateReferenceRequestSchemas = {
  'property-types': codedUpdate,
  layouts: layoutUpdate,
  'unit-levels': codedUpdate,
  'furnishing-types': codedUpdate,
  'unit-tags': codedUpdate,
  'amenity-categories': category.partial().strict(),
  amenities: amenity.partial().strict(),
} as const satisfies Record<ReferenceKind, z.ZodType>;

/** Every field any kind accepts on creation; the service reads the ones its kind has. */
export interface CreateReferenceRequest {
  code?: string;
  nameAr: string;
  nameEn: string;
  sortOrder?: number;
  bedrooms?: number;
  icon?: AmenityIconKey | null;
  categoryId?: string;
  isActive?: boolean;
}
export type UpdateReferenceRequest = Partial<Omit<CreateReferenceRequest, 'code'>>;

// ---------------------------------------------------------------- currencies and rates (FR-ADM-05, FR-LOC-01)

/** Prices are stored in AED, which is always enabled and has no rate (BR-03). */
export const BASE_CURRENCY = 'AED';

export const currencyCodeParamSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((code) => code.toUpperCase());

/**
 * AED for one unit of the currency, as a decimal string: greater than 0, at most 10 digits before
 * the point and 8 after (numeric(18,8)). Never a JSON number, so no float rounding.
 */
export const aedPerUnitSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,8})?$/)
  .refine((value) => /[1-9]/.test(value), { message: 'must be greater than 0' });

/** A UAE calendar day (YYYY-MM-DD), today or earlier (docs/decisions.md, P3.1). */
export const addExchangeRateRequestSchema = z
  .object({ aedPerUnit: aedPerUnitSchema, effectiveDate: z.iso.date() })
  .strict();
export type AddExchangeRateRequest = z.infer<typeof addExchangeRateRequestSchema>;

export const exchangeRateSchema = z.object({
  id: z.uuid(),
  currencyCode: z.string().length(3),
  aedPerUnit: z.string(),
  /** The UAE calendar day the rate applies from. */
  effectiveDate: z.iso.date(),
  effectiveAt: isoDateTime,
  enteredBy: z.uuid(),
  createdAt: isoDateTime,
});
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

export const exchangeRateListResponseSchema = listResponseSchema(exchangeRateSchema);
export type ExchangeRateListResponse = z.infer<typeof exchangeRateListResponseSchema>;

export const adminCurrencySchema = currencySchema.extend({
  isEnabled: z.boolean(),
  latestRate: exchangeRateSchema.nullable(),
});
export type AdminCurrency = z.infer<typeof adminCurrencySchema>;

export const adminCurrencyListResponseSchema = listResponseSchema(adminCurrencySchema);
export type AdminCurrencyListResponse = z.infer<typeof adminCurrencyListResponseSchema>;

export const updateCurrencyRequestSchema = z.object({ isEnabled: z.boolean() }).strict();
export type UpdateCurrencyRequest = z.infer<typeof updateCurrencyRequestSchema>;

// ---------------------------------------------------------------- settings (FR-ADM-06)

/** Allowed ranges (docs/decisions.md, P3.1). */
export const SETTINGS_LIMITS = {
  staleThresholdDays: { min: 1, max: 365 },
  invitationValidityDays: { min: 1, max: 30 },
  dailyRevealLimit: { min: 1, max: 1000 },
} as const;

const limited = (range: { min: number; max: number }) =>
  z.number().int().min(range.min).max(range.max);

export const platformSettingsSchema = z.object({
  staleThresholdDays: z.number().int(),
  invitationValidityDays: z.number().int(),
  /** Stored now; FR-CNT-02 (Should) uses it once delivered. */
  dailyRevealLimit: z.number().int(),
  currentTermsVersion: z.string(),
  updatedAt: isoDateTime,
});
export type PlatformSettingsResponse = z.infer<typeof platformSettingsSchema>;

export const updateSettingsRequestSchema = z
  .object({
    staleThresholdDays: limited(SETTINGS_LIMITS.staleThresholdDays),
    invitationValidityDays: limited(SETTINGS_LIMITS.invitationValidityDays),
    dailyRevealLimit: limited(SETTINGS_LIMITS.dailyRevealLimit),
  })
  .partial()
  .strict();
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
