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

/**
 * Link tokens that travel in a URL path, today only GET /api/v1/auth/invitations/:token (FR-ACC-01).
 * The logged URL keeps the route and loses the token.
 */
const TOKEN_IN_PATH = /(\/auth\/invitations\/)[^/?#]+/g;

export function redactUrl(url: string): string {
  return url.replace(TOKEN_IN_PATH, '$1[Redacted]');
}

export function buildPinoHttpOptions(env: Env): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: assignRequestId,
    redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' },
    // pino-http hands this the already serialized request. The params repeat the path's parts,
    // a link token among them, so they are left out; the redacted URL already shows the route.
    serializers: {
      req: (req: { url?: string; params?: unknown }) => {
        const { params: _params, ...logged } = req;
        if (typeof logged.url === 'string') {
          logged.url = redactUrl(logged.url);
        }
        return logged;
      },
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}
