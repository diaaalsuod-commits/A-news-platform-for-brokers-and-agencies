import { describe, expect, it } from 'vitest';
import { SeedRefused } from '../shared/database/seed-helpers.js';
import { assertE2eAllowed } from './e2e-guards.js';

const local = {
  NODE_ENV: 'development',
  APP_URL: 'https://app.localhost',
  OPS_URL: 'https://ops.localhost',
};

describe('e2e:invite guard', () => {
  it('allows a development stack on *.localhost', () => {
    expect(() => assertE2eAllowed(local)).not.toThrow();
    expect(() => assertE2eAllowed({ ...local, NODE_ENV: 'test' })).not.toThrow();
  });

  it('refuses when NODE_ENV is production, even on *.localhost', () => {
    expect(() => assertE2eAllowed({ ...local, NODE_ENV: 'production' })).toThrow(SeedRefused);
    expect(() => assertE2eAllowed({ ...local, NODE_ENV: 'production' })).toThrow(/production/);
  });

  it.each([
    'https://app.reih.ae',
    'https://localhost',
    'https://app.localhost.evil.test',
    'https://app.localhost@evil.test',
    'not a url',
  ])('refuses an APP_URL of %s', (url) => {
    expect(() => assertE2eAllowed({ ...local, APP_URL: url })).toThrow(SeedRefused);
  });

  it('refuses when only OPS_URL is not local', () => {
    expect(() => assertE2eAllowed({ ...local, OPS_URL: 'https://ops.reih.ae' })).toThrow(
      SeedRefused,
    );
  });
});
