import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  readSeedReferences,
  seedAdminReference,
  seedDemoExchangeRates,
} from '../modules/admin/index.js';
import {
  DEMO_PROJECT_COUNT,
  FULL_LOAD_SIZE,
  type LoadSeedSize,
  seedAreas,
  seedDemoContent,
  seedLoadContent,
} from '../modules/content/index.js';
import { seedDemoAgencies } from '../modules/agency/index.js';
import {
  createFirstPlatformAdmin,
  ensureSeedOperator,
  seedDemoAgencyUsers,
} from '../modules/identity/index.js';
import type { Env } from '../shared/config/index.js';
import type { SeedDb } from '../shared/database/seed-helpers.js';
import { FileStorage } from '../shared/files/index.js';
import { assertDemoSeedAllowed, assertLoadSeedAllowed } from './seed-guards.js';

export const seedCommands = ['reference', 'admin', 'demo', 'load'] as const;
export type SeedCommand = (typeof seedCommands)[number];

export interface SeedOptions {
  log?: (message: string) => void;
  /** Tests use a small size. The commands always use the full one. */
  loadSize?: LoadSeedSize;
}

async function seedReference(db: SeedDb): Promise<void> {
  await seedAdminReference(db);
  await seedAreas(db);
}

/**
 * D-02, P3.2: two fictional agencies with branding, and, when DEMO_USER_PASSWORD is set, an Agency
 * Admin and two brokers in each who log in with it. Never in production, even with
 * ALLOW_DEMO_SEED=true: these users share a known password (docs/decisions.md, P3.2).
 */
async function seedDemoTeams(
  db: SeedDb,
  env: Env,
  operatorId: string,
  log: (message: string) => void,
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    log('Demo agencies and their users are never created in production; skipped.');
    return;
  }
  const demoAgencies = await seedDemoAgencies(db, operatorId);
  if (!env.DEMO_USER_PASSWORD) {
    log(
      `Demo agencies are in place (${demoAgencies.length}) without users: ` +
        'set DEMO_USER_PASSWORD to add their logins.',
    );
    return;
  }
  const emails = await seedDemoAgencyUsers(db, demoAgencies, env.DEMO_USER_PASSWORD);
  log(
    `Demo agencies are in place (${demoAgencies.length}), with ${emails.length} users ` +
      'who log in with DEMO_USER_PASSWORD.',
  );
}

export async function runSeedCommand(
  command: SeedCommand,
  env: Env,
  { log = () => {}, loadSize = FULL_LOAD_SIZE }: SeedOptions = {},
): Promise<void> {
  // Refuse before connecting to anything.
  if (command === 'demo') assertDemoSeedAllowed(env);
  if (command === 'load') assertLoadSeedAllowed(env);

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const db: SeedDb = drizzle({ client: pool });

  try {
    if (command === 'admin') {
      await createFirstPlatformAdmin(db, {
        email: env.FIRST_ADMIN_EMAIL,
        password: env.FIRST_ADMIN_PASSWORD,
      });
      log('The first Platform Admin was created.');
      return;
    }

    // Demo and load content point at the reference data, and seeding it again changes nothing.
    await seedReference(db);
    log('Reference data is in place.');
    if (command === 'reference') {
      return;
    }

    const operatorId = await ensureSeedOperator(db);
    const references = await readSeedReferences(db);
    const storage = new FileStorage(env);

    if (command === 'demo') {
      await seedDemoExchangeRates(db, operatorId);
      await seedDemoContent(db, { operatorId, references, storage });
      log(`Demo data is in place: ${DEMO_PROJECT_COUNT} published projects.`);
      await seedDemoTeams(db, env, operatorId, log);
      return;
    }

    await seedLoadContent(db, {
      operatorId,
      references,
      storage,
      size: loadSize,
      onProgress: (done, total) => {
        if (done % 500 === 0 || done === total) {
          log(`Load data: ${done} of ${total} projects.`);
        }
      },
    });
    log(`Load data is in place: ${loadSize.projects} projects, ${loadSize.units} units.`);
  } finally {
    await pool.end();
  }
}
