import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { RequestWithUser } from '../../../shared/http/index.js';

/**
 * Keys for @RateLimit. Counted before validation, so each normalises the raw value the same way the
 * schema will, and counts an unknown email or token exactly like a known one. Hashed, so Redis
 * holds no email address and no usable token.
 */
const hashed = (value: unknown, normalise: (text: string) => string = (text) => text) =>
  createHash('sha256')
    .update(typeof value === 'string' ? normalise(value) : '')
    .digest('hex');

const body = (request: Request) => (request.body ?? {}) as Record<string, unknown>;

export const emailKey = (request: Request) =>
  hashed(body(request).email, (email) => email.trim().toLowerCase());

export const bodyTokenKey = (request: Request) => hashed(body(request).token);

export const paramTokenKey = (request: Request) => hashed(request.params.token);

/** After AuthGuard, which runs first, so the user is known. */
export const userKey = (request: Request) => (request as RequestWithUser).user?.id ?? 'unknown';
