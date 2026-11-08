import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A random 32-byte token in base64url (43 characters). */
export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isWellFormedToken(value: string | undefined): value is string {
  return value !== undefined && TOKEN_PATTERN.test(value);
}

/** The value stored for a session token: its SHA-256 in hex, never the token itself. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compares two strings in time that does not depend on where they differ. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
