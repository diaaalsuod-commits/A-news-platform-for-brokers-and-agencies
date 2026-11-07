import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.schema.js';

const valid = {
  NODE_ENV: 'test',
  API_PORT: '4000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://user:secret-value@localhost:5432/reih',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'REIH <no-reply@example.test>',
  FILES_DIR: './files',
  URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
  APP_URL: 'https://app.localhost',
  OPS_URL: 'https://ops.localhost',
};

describe('parseEnv', () => {
  it('accepts a valid environment and converts the port to a number', () => {
    expect(parseEnv(valid).API_PORT).toBe(4000);
  });

  it('fails when a variable is missing and names it', () => {
    const { REDIS_URL: _removed, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(EnvValidationError);
    expect(() => parseEnv(rest)).toThrow(/REDIS_URL/);
  });

  it('fails when a URL has the wrong protocol', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost/reih' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses a signing secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...valid, URL_SIGNING_SECRET: 'too-short' })).toThrow(
      /URL_SIGNING_SECRET/,
    );
  });

  it('does not need the first admin or an SMTP login, and treats a blank value as not set', () => {
    const env = parseEnv({ ...valid, SMTP_USER: '', FIRST_ADMIN_EMAIL: '' });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.FIRST_ADMIN_EMAIL).toBeUndefined();
    expect(env.FIRST_ADMIN_PASSWORD).toBeUndefined();
  });

  it('refuses a first admin email that is not an email', () => {
    expect(() => parseEnv({ ...valid, FIRST_ADMIN_EMAIL: 'not-an-email' })).toThrow(
      /FIRST_ADMIN_EMAIL/,
    );
  });

  it('NFR-10 the error never prints a value', () => {
    const secret = 'secret-value';
    const message = (() => {
      try {
        parseEnv({ ...valid, API_PORT: secret, DATABASE_URL: `not a url ${secret}` });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toMatch(/API_PORT/);
    expect(message).not.toContain(secret);
  });
});
