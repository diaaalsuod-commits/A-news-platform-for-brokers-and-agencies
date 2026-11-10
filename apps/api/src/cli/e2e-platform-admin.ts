import { randomBytes, randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createActivePlatformAdmin } from '../modules/identity/index.js';
import { EnvValidationError, parseEnv } from '../shared/config/index.js';
import { SeedRefused } from '../shared/database/seed-helpers.js';
import { assertE2eAllowed } from './e2e-guards.js';

/** Printed before the JSON result, so a caller can find it in the output. */
export const E2E_PLATFORM_ADMIN_MARKER = 'E2E_PLATFORM_ADMIN';

/**
 * Creates a fresh, active Platform Admin for the end-to-end tests and prints its email and a
 * random password, so no password lives in the code. Not an HTTP endpoint; local stacks only
 * (never in production, and only when both web apps are on *.localhost).
 *
 *   pnpm --filter @reih/api e2e:platform-admin
 */
async function main(): Promise<void> {
  const env = parseEnv(process.env);
  // Refuse before connecting to anything.
  assertE2eAllowed(env);

  const email = `e2e-admin-${Date.now()}-${randomUUID().slice(0, 6)}@reih.test`;
  const password = randomBytes(18).toString('base64url');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    const id = await createActivePlatformAdmin(drizzle({ client: pool }), {
      email,
      password,
      fullName: 'E2E Platform Admin',
    });
    process.stdout.write(
      `${E2E_PLATFORM_ADMIN_MARKER} ${JSON.stringify({ id, email, password })}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const expected = error instanceof SeedRefused || error instanceof EnvValidationError;
  process.stderr.write(`${expected ? (error as Error).message : String(error)}\n`);
  process.exitCode = 1;
});
