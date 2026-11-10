import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../config/index.js';
import {
  isRedactedQueryKey,
  REDACTED,
  redactSensitive,
  serializeError,
  withSafeMessage,
} from './log-safety.js';

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
 *
 * pino's paths match fixed depths only. Passwords, phone numbers and emails nested deeper are
 * removed by key in redactSensitive (log-safety.ts), which every logged object passes through.
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

/**
 * The logged URL keeps its path and its query keys. The value of q, the free-text search of every
 * list, is replaced, and so is the value of a key that is never logged anywhere (an email, a phone
 * number). Page, status and id values stay (NFR-08, NFR-11).
 */
export function redactUrl(url: string): string {
  const withoutToken = url.replace(TOKEN_IN_PATH, '$1[Redacted]');
  const queryAt = withoutToken.indexOf('?');
  if (queryAt === -1) return withoutToken;
  const hashAt = withoutToken.indexOf('#', queryAt);
  const end = hashAt === -1 ? withoutToken.length : hashAt;
  const query = withoutToken
    .slice(queryAt + 1, end)
    .split('&')
    .map((pair) => {
      const equalsAt = pair.indexOf('=');
      const key = equalsAt === -1 ? pair : pair.slice(0, equalsAt);
      return isRedactedQueryKey(key) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');
  return `${withoutToken.slice(0, queryAt + 1)}${query}${withoutToken.slice(end)}`;
}

/** The parsed query of a logged request, with the same values replaced as in its URL. */
function redactQuery(query: unknown): unknown {
  if (typeof query !== 'object' || query === null) return query;
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, isRedactedQueryKey(key) ? REDACTED : value]),
  );
}

export function buildPinoHttpOptions(env: Env): Options {
  return {
    level: env.LOG_LEVEL,
    genReqId: assignRequestId,
    redact: { paths: [...LOG_REDACT_PATHS], censor: REDACTED },
    // Every logged object: sensitive keys are removed at any depth (NFR-08, NFR-11).
    formatters: { log: (object) => redactSensitive(object) },
    hooks: {
      logMethod(args, method) {
        method.apply(this, withSafeMessage(args) as Parameters<typeof method>);
      },
    },
    // pino-http would otherwise run pino's own error serializer first, which copies the message
    // and the params of a failed query. With this off, the three serializers below see the raw
    // request, response and error, and the first two call pino's standard ones themselves.
    wrapSerializers: false,
    serializers: {
      // The params repeat the path's parts, a link token among them, so they are left out; the
      // redacted URL already shows the route.
      req: (req: IncomingMessage) => {
        const { params: _params, ...logged } = pino.stdSerializers.req(req);
        if (typeof logged.url === 'string') {
          logged.url = redactUrl(logged.url);
        }
        return redactSensitive({ ...logged, query: redactQuery(logged.query) });
      },
      res: (res: ServerResponse) => pino.stdSerializers.res(res),
      // A failed query is logged without its parameters, whichever module ran it.
      err: (error: unknown) => serializeError(error),
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}
