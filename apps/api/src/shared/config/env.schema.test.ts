import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.schema.js';

const valid = {
  NODE_ENV: 'test',
  API_PORT: '4000',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://user:secret-value@localhost:5432/reih',
  REDIS_URL: 'redis://localhost:6379',
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
