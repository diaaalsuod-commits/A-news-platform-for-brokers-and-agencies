import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('fails when REDIS_URL is missing and names it', () => {
    const source = { NODE_ENV: 'test', LOG_LEVEL: 'silent' };
    expect(() => parseEnv(source)).toThrow(EnvValidationError);
    expect(() => parseEnv(source)).toThrow(/REDIS_URL/);
  });
});
