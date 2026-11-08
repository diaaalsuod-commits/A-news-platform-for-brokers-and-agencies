import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { Env } from '../config/index.js';

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[\w-]{8,128}$/;

/** Reuses a well-formed incoming request id, or creates one, and returns it to the caller. */
export function assignRequestId(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Never logged (NFR-08): the session and CSRF cookies and header, and any password in a body. pino-http
 * logs no body today; the body paths guard a later change, and *.password covers any logged object.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'body.password',
  'password',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
] as const;

export function buildPinoHttpOptions(env: Env): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: assignRequestId,
    redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}
