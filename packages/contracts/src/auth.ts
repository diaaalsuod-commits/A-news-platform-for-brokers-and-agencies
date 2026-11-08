import { z } from 'zod';
import { areaUnitSchema, langCodeSchema, userRoleSchema } from './enums.js';
import { MAX_PASSWORD_LENGTH } from './password.js';

/** FR-ACC-02: POST /api/v1/auth/login. */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** SRS 3.3: GET /api/v1/auth/csrf. The same value goes in the X-CSRF-Token header. */
export const csrfResponseSchema = z.object({ token: z.string().min(1) });
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

export const meAgencySchema = z.object({
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string(),
});
export type MeAgency = z.infer<typeof meAgencySchema>;

/** GET /api/v1/me, and the body of a successful login. */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    fullName: z.string().nullable(),
    mobile: z.string().nullable(),
    whatsapp: z.string().nullable(),
    jobTitle: z.string().nullable(),
    brn: z.string().nullable(),
    /** GET /api/v1/me/photo with a version, so a new photo is not served from cache; null if none. */
    photoUrl: z.string().nullable(),
  }),
  role: userRoleSchema,
  /** Null for staff (Data Operator, Platform Admin), who belong to no agency. */
  agency: meAgencySchema.nullable(),
  preferences: z.object({
    language: langCodeSchema,
    currency: z.string().length(3),
    areaUnit: areaUnitSchema,
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Header that carries the CSRF token on POST, PUT, PATCH and DELETE (SRS 3.3). */
export const csrfHeaderName = 'x-csrf-token';
