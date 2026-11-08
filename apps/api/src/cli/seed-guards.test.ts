import { describe, expect, it } from 'vitest';
import { SeedRefused } from '../shared/database/seed-helpers.js';
import { assertDemoSeedAllowed, assertLoadSeedAllowed } from './seed-guards.js';

const LOAD_URL = 'postgres://user:secret-value@localhost:5432/reih_load';
const DEV_URL = 'postgres://user:secret-value@localhost:5432/reih';

describe('db:seed:load guard', () => {
  it('allows a database whose name ends with _load outside production', () => {
    expect(() =>
      assertLoadSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: LOAD_URL }),
    ).not.toThrow();
  });

  it('refuses in production, even on a database named _load', () => {
    expect(() => assertLoadSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: LOAD_URL })).toThrow(
      SeedRefused,
    );
  });

  it.each(['reih', 'reih_load_copy', 'load', 'reihload'])('refuses a database named %s', (name) => {
    expect(() =>
      assertLoadSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: `postgres://user:pass@localhost:5432/${name}`,
      }),
    ).toThrow(SeedRefused);
  });

  it('reads the name from the path, so a query string cannot satisfy the check', () => {
    expect(() =>
      assertLoadSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/reih?x=_load',
      }),
    ).toThrow(SeedRefused);
  });

  it('NFR-10 never prints the password in its message', () => {
    expect(() => assertLoadSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: DEV_URL })).toThrow(
      /^(?!.*secret-value).*"reih"/,
    );
  });
});

describe('db:seed:demo guard', () => {
  it('allows the demo seed outside production', () => {
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: DEV_URL }),
    ).not.toThrow();
  });

  it('refuses in production without ALLOW_DEMO_SEED', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: DEV_URL })).toThrow(
      SeedRefused,
    );
  });

  it('refuses in production when ALLOW_DEMO_SEED is anything but true', () => {
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: DEV_URL,
        ALLOW_DEMO_SEED: 'false',
      }),
    ).toThrow(SeedRefused);
  });

  it('allows it in production with ALLOW_DEMO_SEED=true', () => {
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: DEV_URL,
        ALLOW_DEMO_SEED: 'true',
      }),
    ).not.toThrow();
  });
});
