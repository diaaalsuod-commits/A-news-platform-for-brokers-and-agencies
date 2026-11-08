import type { CookieOptions, Request, Response } from 'express';
import { parseCookies } from '../../../shared/http/index.js';

/** FR-ACC-02, SRS 3.3: the session cookie. */
export const SESSION_COOKIE = 'reih_session';

/**
 * SRS 3.3: the double-submit CSRF cookie. The __Host- prefix makes the browser refuse it unless it is
 * Secure, has Path=/ and no Domain, so a sibling subdomain cannot plant a value (docs/decisions.md).
 */
export const CSRF_COOKIE = '__Host-reih_csrf';

/**
 * No Max-Age or Expires: a browser-session cookie. The 8-hour idle limit is the server's
 * (docs/decisions.md). Secure always: browsers accept Secure cookies on http://localhost too.
 */
const BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export function readCookie(request: Request, name: string): string | undefined {
  return parseCookies(request.headers.cookie)[name];
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, BASE);
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, BASE);
}

export function setCsrfCookie(response: Response, token: string): void {
  response.cookie(CSRF_COOKIE, token, BASE);
}
