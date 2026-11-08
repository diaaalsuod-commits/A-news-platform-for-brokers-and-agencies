import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/index.js';
import { buildPinoHttpOptions, LOG_REDACT_PATHS, redactUrl } from './logger.options.js';

const env = parseEnv({
  NODE_ENV: 'test',
  API_PORT: '4000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://user:password@localhost:5432/unused',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'REIH <no-reply@example.test>',
  FILES_DIR: './files',
  URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
  APP_URL: 'https://app.localhost',
  OPS_URL: 'https://ops.localhost',
});

describe('log redaction', () => {
  it('NFR-08 an invitation token in the path is replaced in the logged URL', () => {
    const token = 'Abc_def-123'.padEnd(43, 'x');
    expect(redactUrl(`/api/v1/auth/invitations/${token}`)).toBe(
      '/api/v1/auth/invitations/[Redacted]',
    );
    expect(redactUrl(`/api/v1/auth/invitations/${token}?lang=ar`)).toBe(
      '/api/v1/auth/invitations/[Redacted]?lang=ar',
    );
    expect(redactUrl('/api/v1/me')).toBe('/api/v1/me');
  });

  it('NFR-08 the logged request keeps no route params, which repeat the token', () => {
    const serialize = (buildPinoHttpOptions(env).serializers as { req: (r: object) => object }).req;
    expect(
      serialize({
        url: '/api/v1/auth/invitations/secret-token',
        params: { token: 'secret-token' },
      }),
    ).toEqual({ url: '/api/v1/auth/invitations/[Redacted]' });
  });

  it('NFR-08 cookies, the CSRF header and passwords are redacted', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.headers["x-csrf-token"]',
        '*.password',
      ]),
    );
  });
});
