import { z } from 'zod';
import { areaUnitSchema, langCodeSchema, userRoleSchema } from './enums.js';
import { MAX_PASSWORD_LENGTH, passwordSchema } from './password.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** A link token: 32 random bytes in base64url. Anything else cannot be a token. */
export const linkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** FR-ACC-01: GET /api/v1/auth/invitations/:token. */
export const invitationCheckResponseSchema = z.object({
  email: z.string(),
  role: userRoleSchema,
  expiresAt: z.iso.datetime(),
  termsVersion: z.string(),
});
export type InvitationCheckResponse = z.infer<typeof invitationCheckResponseSchema>;

/**
 * FR-ACC-01: POST /api/v1/auth/activate. acceptTerms is checked by the server, not here, so a
 * missing acceptance gets its own error code (TERMS_NOT_ACCEPTED).
 */
export const activateRequestSchema = z.object({
  token: z.string().max(100),
  password: passwordSchema,
  acceptTerms: z.boolean().optional(),
});
export type ActivateRequest = z.infer<typeof activateRequestSchema>;

/** FR-ACC-03: POST /api/v1/auth/forgot. */
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** FR-ACC-03: POST /api/v1/auth/reset. */
export const resetPasswordRequestSchema = z.object({
  token: z.string().max(100),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** FR-ACC-03: POST /api/v1/me/password. The current password follows no length rule of today. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** FR-ACC-05: international format, for example +971501234567 (E.164). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

/** FR-ACC-05: PATCH /api/v1/me. Only the fields sent change; null clears an optional field. */
export const updateProfileRequestSchema = z
  .object({
    fullName: z.string().trim().min(1).max(150),
    mobile: phoneSchema.nullable(),
    whatsapp: phoneSchema.nullable(),
    jobTitle: optionalText(100),
    brn: optionalText(30),
  })
  .partial()
  .strict();
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** FR-ACC-06: PATCH /api/v1/me/preferences. The currency must be one the admin enabled. */
export const updatePreferencesRequestSchema = z
  .object({
    language: langCodeSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    areaUnit: areaUnitSchema,
  })
  .partial()
  .strict();
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

/** FR-ACC-05: the profile photo. */
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const profilePhotoField = 'photo';
