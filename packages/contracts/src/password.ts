import { z } from 'zod';

/** FR-ACC-01: a password has at least 10 characters. */
export const MIN_PASSWORD_LENGTH = 10;

/** Bounded so that a huge body cannot make the server hash megabytes (NFR-08). */
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * The one rule for a new password (FR-ACC-01, FR-ACC-03): activation, reset, change and the
 * first-admin seed all use it.
 */
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export function isAcceptablePassword(password: string): boolean {
  return passwordSchema.safeParse(password).success;
}
