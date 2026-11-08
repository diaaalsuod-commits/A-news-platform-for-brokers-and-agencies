import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { langCodeSchema } from '@reih/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppModule } from '../app.module.js';
import { InvitationService } from '../modules/identity/index.js';
import { EnvValidationError, parseEnv } from '../shared/config/index.js';
import { SeedRefused } from '../shared/database/seed-helpers.js';
import { assertE2eAllowed } from './e2e-guards.js';
import { ensureE2eAgency, ensureE2eInviter } from './e2e-fixtures.js';

/** Printed before the JSON result, so a caller can find it in the output. */
export const E2E_INVITE_MARKER = 'E2E_INVITE';

/**
 * Invites a fresh Agency Admin into the E2E Test Agency through InvitationService, the same path
 * the agency and admin modules use, and prints the email. Not an HTTP endpoint; local stacks only.
 *
 *   pnpm --filter @reih/api e2e:invite [--email <address>] [--language en|ar]
 */
async function main(): Promise<void> {
  const env = parseEnv(process.env);
  // Refuse before connecting to anything.
  assertE2eAllowed(env);

  const { values } = parseArgs({
    options: { email: { type: 'string' }, language: { type: 'string', default: 'en' } },
  });
  const email = values.email ?? `e2e-${Date.now()}-${randomUUID().slice(0, 6)}@reih.test`;
  const language = langCodeSchema.parse(values.language);

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  let agencyId: string;
  let inviterId: string;
  try {
    const db = drizzle({ client: pool });
    agencyId = await ensureE2eAgency(db);
    inviterId = await ensureE2eInviter(db);
  } finally {
    await pool.end();
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await app
      .get(InvitationService)
      .invite(
        { id: inviterId, role: 'platform_admin', agencyId: null },
        email,
        'agency_admin',
        agencyId,
        language,
      );
    process.stdout.write(
      `${E2E_INVITE_MARKER} ${JSON.stringify({ email, agencyId, ...result })}\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const expected = error instanceof SeedRefused || error instanceof EnvValidationError;
  process.stderr.write(`${expected ? (error as Error).message : String(error)}\n`);
  process.exitCode = 1;
});
