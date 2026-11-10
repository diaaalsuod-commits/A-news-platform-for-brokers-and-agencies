import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm';
import pino from 'pino';
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

  it('NFR-08 NFR-11 the value of q is replaced; the path, the keys and the other values stay', () => {
    expect(redactUrl('/api/v1/admin/staff?q=name@example.com&page=2&status=active')).toBe(
      '/api/v1/admin/staff?q=[Redacted]&page=2&status=active',
    );
    expect(redactUrl('/api/v1/content/areas?parentId=abc&q=Dubai%20Marina')).toBe(
      '/api/v1/content/areas?parentId=abc&q=[Redacted]',
    );
    expect(redactUrl('/api/v1/content/areas?q=')).toBe('/api/v1/content/areas?q=[Redacted]');
    expect(redactUrl('/api/v1/content/areas?page=1')).toBe('/api/v1/content/areas?page=1');
  });

  it('NFR-08 q is found however the key is written, and sensitive keys are replaced too', () => {
    for (const url of [
      '/x?%71=name@example.com',
      '/x?q[]=name@example.com',
      '/x?q[0]=name@example.com',
      '/x?q=a&q=name@example.com',
      '/x?email=name@example.com',
      '/x?Phone=%2B971501234567',
    ]) {
      expect(redactUrl(url), url).not.toMatch(/name@example\.com|971501234567/);
    }
    // A key that only starts with q is another parameter.
    expect(redactUrl('/x?quarter=2')).toBe('/x?quarter=2');
  });

  it('NFR-08 a link token in the path and q in the query are both replaced', () => {
    expect(redactUrl('/api/v1/auth/invitations/secret-token?q=name@example.com&lang=ar')).toBe(
      '/api/v1/auth/invitations/[Redacted]?q=[Redacted]&lang=ar',
    );
  });

  it('NFR-08 NFR-11 the logged request replaces q in its URL and in its parsed query', () => {
    const serialize = (buildPinoHttpOptions(env).serializers as { req: (r: object) => object }).req;
    const logged = serialize({
      method: 'GET',
      url: '/api/v1/admin/staff?q=name@example.com&page=2',
      originalUrl: '/api/v1/admin/staff?q=name@example.com&page=2',
      query: { q: 'name@example.com', page: '2' },
      headers: {},
      socket: {},
    }) as { url: string; query: Record<string, string> };
    expect(logged.url).toBe('/api/v1/admin/staff?q=[Redacted]&page=2');
    expect(logged.query).toEqual({ q: '[Redacted]', page: '2' });
    expect(JSON.stringify(logged)).not.toContain('name@example.com');
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

describe('the logger built from these options', () => {
  const PHONE = '+971501234567';
  const WHATSAPP = '+971509876543';
  const EMAIL = 'sales.manager@developer.example';
  const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkLXBhc3N3b3Jk';
  const QUERY = 'insert into "sales_contacts" ("phone", "whatsapp", "email") values ($1, $2, $3)';

  const failedQuery = () =>
    new DrizzleQueryError(
      QUERY,
      [PHONE, WHATSAPP, EMAIL, HASH],
      Object.assign(new Error(`duplicate value "${EMAIL}"`), {
        severity: 'ERROR',
        code: '23505',
        detail: `Key (email)=(${EMAIL}) already exists.`,
        constraint: 'users_email_key',
      }),
    );

  /** A real pino logger with the application's options, writing to memory. */
  function capture() {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(...chunk.toString().split('\n').filter(Boolean));
        callback();
      },
    });
    const {
      genReqId: _genReqId,
      wrapSerializers: _wrapSerializers,
      ...options
    } = buildPinoHttpOptions({ ...env, LOG_LEVEL: 'info' });
    return { logger: pino(options, destination), lines };
  }

  const expectNoSecret = (lines: string[]) => {
    const text = lines.join('\n');
    for (const secret of [PHONE, WHATSAPP, EMAIL, HASH]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('params');
    expect(text).not.toContain('already exists');
  };

  it('NFR-08 NFR-11 a failed query with a phone, a WhatsApp number, an email and a password hash is logged without any of them', () => {
    const { logger, lines } = capture();
    // The three ways an error reaches the log: alone, as nestjs-pino passes it, and as a cause.
    logger.error(failedQuery());
    logger.error({ context: 'HttpExceptionFilter', err: failedQuery() });
    logger.error({ err: new Error('Seeding failed', { cause: failedQuery() }) });

    expect(lines).toHaveLength(3);
    expectNoSecret(lines);
    const [alone, fromNest, wrapped] = lines.map(
      (line) => JSON.parse(line) as { msg: string; err: Record<string, unknown> },
    );
    for (const entry of [alone, fromNest]) {
      expect(entry?.msg).toBe('Database query failed');
      expect(entry?.err).toMatchObject({
        type: 'DatabaseError',
        message: 'Database query failed',
        query: QUERY,
        code: '23505',
        constraint: 'users_email_key',
      });
      expect(entry?.err.stack).toMatch(/^\s+at /);
    }
    expect(wrapped?.msg).toBe('Seeding failed');
    expect(wrapped?.err.cause).toMatchObject({ type: 'DatabaseError', code: '23505' });
  });

  it('NFR-08 NFR-11 phone, WhatsApp, email and passwords are removed from nested objects too', () => {
    const { logger, lines } = capture();
    logger.info({
      msg: 'Contact saved',
      email: EMAIL,
      contact: { phone: PHONE, links: [{ whatsapp: WHATSAPP }] },
      user: { account: { secrets: { passwordHash: HASH, password: 'a-plain-password-1' } } },
    });

    expectNoSecret(lines);
    expect(lines.join('\n')).not.toContain('a-plain-password-1');
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      msg: 'Contact saved',
      email: '[Redacted]',
      contact: { phone: '[Redacted]', links: [{ whatsapp: '[Redacted]' }] },
      user: { account: { secrets: { passwordHash: '[Redacted]', password: '[Redacted]' } } },
    });
  });

  it('an ordinary error is logged as before, with its message and stack', () => {
    const { logger, lines } = capture();
    logger.error({ err: new Error('SMTP connection lost') });
    const entry = JSON.parse(lines[0] as string) as { msg: string; err: { stack: string } };
    expect(entry.msg).toBe('SMTP connection lost');
    expect(entry.err).toMatchObject({ type: 'Error', message: 'SMTP connection lost' });
    expect(entry.err.stack).toContain('Error: SMTP connection lost');
  });

  it('an ordinary error keeps its name, message, stack and code, and its cause is logged the same way', () => {
    const { logger, lines } = capture();
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const error = Object.assign(new TypeError('Redis is unavailable', { cause }), {
      code: 'ERR_REDIS',
      details: { host: 'redis' },
    });
    logger.error({ err: error });

    const entry = JSON.parse(lines[0] as string) as { msg: string; err: Record<string, unknown> };
    expect(entry.msg).toBe('Redis is unavailable');
    expect(entry.err).toMatchObject({
      type: 'TypeError',
      name: 'TypeError',
      message: 'Redis is unavailable',
      code: 'ERR_REDIS',
      cause: { type: 'Error', name: 'Error', message: 'socket hang up', code: 'ECONNRESET' },
    });
    expect(entry.err.stack).toContain('TypeError: Redis is unavailable');
    expect((entry.err.cause as { stack: string }).stack).toContain('Error: socket hang up');
    // Only simple properties are kept: a nested object on the error is left out.
    expect(entry.err).not.toHaveProperty('details');
  });
});
