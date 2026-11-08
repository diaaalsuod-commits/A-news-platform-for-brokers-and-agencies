import { z } from 'zod';
import { emailSchema, phoneSchema } from './account.js';
import { invitationSummarySchema } from './admin.js';
import { langCodeSchema, userStatusSchema } from './enums.js';
import { listResponseSchema, pageQuerySchema } from './lists.js';

// Agency and team (SRS 4.2). The agency is always the caller's own, from the session (NFR-09).

const isoDateTime = z.iso.datetime();

// ---------------------------------------------------------------- branding (FR-AGY-01)

/** FR-AGY-01: a logo is PNG or SVG up to 2 MB, sent as multipart/form-data in this field. */
export const AGENCY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const agencyLogoField = 'logo';

/** #RRGGBB only. */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** https only, so a catalog never links to a page without TLS. */
export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(255);

/** The Office Registration Number: 3 to 10 digits (docs/decisions.md, P3.2). */
export const ornSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{3,10}$/);

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema.nullable());

/** PUT /api/v1/agency/branding: the whole branding; an optional field is null when absent. */
export const updateBrandingRequestSchema = z
  .object({
    marketingName: z.string().trim().min(1).max(200),
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    phone: optional(phoneSchema).default(null),
    email: optional(emailSchema).default(null),
    website: optional(z.string().trim().pipe(httpsUrlSchema)).default(null),
    address: optional(z.string().trim().max(500)).default(null),
    orn: optional(ornSchema).default(null),
  })
  .strict();
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequestSchema>;

export const brandingSchema = z.object({
  marketingName: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  orn: z.string().nullable(),
  /** Behind the session, for members of the agency; null without a logo. */
  logoUrl: z.string().nullable(),
  /** True until the Agency Admin saves branding: the values are the defaults. */
  isDefault: z.boolean(),
  updatedAt: isoDateTime.nullable(),
});
export type Branding = z.infer<typeof brandingSchema>;

// ---------------------------------------------------------------- members (FR-AGY-02 to FR-AGY-04)

export const memberRoleValues = ['broker', 'agency_admin'] as const;
export const memberRoleSchema = z.enum(memberRoleValues);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const memberSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: memberRoleSchema,
  status: userStatusSchema,
  lastLoginAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  pendingInvitation: invitationSummarySchema.nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListResponseSchema = listResponseSchema(memberSchema);
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

export const memberListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  role: memberRoleSchema.optional(),
  status: userStatusSchema.optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

/** FR-AGY-02: a Broker or an Agency Admin of the caller's own agency. */
export const inviteMemberRequestSchema = z
  .object({ email: emailSchema, role: memberRoleSchema, language: langCodeSchema.optional() })
  .strict();
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const changeMemberRoleRequestSchema = z.object({ role: memberRoleSchema }).strict();
export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleRequestSchema>;

/** FR-AGY-04, UC-04.7: PATCH /agency/members/:id/status. */
export const changeMemberStatusRequestSchema = z
  .object({ status: z.enum(['active', 'deactivated']) })
  .strict();
export type ChangeMemberStatusRequest = z.infer<typeof changeMemberStatusRequestSchema>;
