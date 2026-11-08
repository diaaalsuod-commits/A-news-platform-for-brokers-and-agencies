import { SeedRefused } from '../shared/database/seed-helpers.js';

interface GuardEnv {
  NODE_ENV: string;
  DATABASE_URL: string;
  ALLOW_DEMO_SEED?: string | undefined;
}

const LOAD_DATABASE_SUFFIX = '_load';

/** The load seed has no undo, so it runs only on a database made for it. */
export function assertLoadSeedAllowed(env: GuardEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new SeedRefused('db:seed:load never runs when NODE_ENV is production.');
  }
  const databaseName = decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1));
  if (!databaseName.endsWith(LOAD_DATABASE_SUFFIX)) {
    throw new SeedRefused(
      `db:seed:load runs only on a database whose name ends with "${LOAD_DATABASE_SUFFIX}". ` +
        `This one is "${databaseName}".`,
    );
  }
}

/** Fictional content on a production database has to be asked for by name. */
export function assertDemoSeedAllowed(env: GuardEnv): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true') {
    throw new SeedRefused('db:seed:demo in production needs ALLOW_DEMO_SEED=true.');
  }
}
