import { isAcceptablePassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@reih/contracts';
import { eq, sql } from 'drizzle-orm';
import { seedId, type SeedDb, SeedRefused } from '../../../shared/database/seed-helpers.js';
import { users } from './identity.schema.js';
import { hashPassword } from './password-hasher.js';

const SEED_OPERATOR_EMAIL = 'system-seed@reih.localhost';

/**
 * The user recorded as the author of seeded content, because projects need one. It is deactivated
 * and has no password, so nobody can log in with it. Returns its id.
 */
export async function ensureSeedOperator(db: SeedDb): Promise<string> {
  await db
    .insert(users)
    .values({
      id: seedId('user', 'system-seed'),
      email: SEED_OPERATOR_EMAIL,
      role: 'data_operator',
      status: 'deactivated',
      fullName: 'System seed',
    })
    .onConflictDoNothing();

  const [operator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_OPERATOR_EMAIL));
  return (operator as { id: string }).id;
}

/** SRS 2.5: the first Platform Admin, created once at installation. */
export async function createFirstPlatformAdmin(
  db: SeedDb,
  account: { email?: string | undefined; password?: string | undefined },
): Promise<void> {
  const { email, password } = account;
  if (!email || !password) {
    throw new SeedRefused(
      'Set FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD to create the first admin.',
    );
  }
  if (!isAcceptablePassword(password)) {
    throw new SeedRefused(
      `FIRST_ADMIN_PASSWORD must have ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  await db.transaction(async (tx) => {
    // Two commands started together must not both find no admin.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('reih.first-platform-admin'))`);

    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'platform_admin'))
      .limit(1);
    if (admin) {
      throw new SeedRefused('A Platform Admin already exists, so nothing was created.');
    }

    const [emailInUse] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (emailInUse) {
      throw new SeedRefused('FIRST_ADMIN_EMAIL already belongs to another user.');
    }

    await tx.insert(users).values({
      email,
      passwordHash: await hashPassword(password),
      role: 'platform_admin',
      status: 'active',
    });
  });
}

/** Two brokers and one Agency Admin in each demo agency (D-02). */
const DEMO_MEMBERS = [
  { key: 'admin', role: 'agency_admin', fullName: 'Agency Admin' },
  { key: 'broker1', role: 'broker', fullName: 'Broker One' },
  { key: 'broker2', role: 'broker', fullName: 'Broker Two' },
] as const;

/**
 * db:seed:demo: the demo agencies' users, who log in with the one password in DEMO_USER_PASSWORD.
 * The caller skips this without the password, and always in production (docs/decisions.md, P3.2).
 * ON CONFLICT DO NOTHING, so a second run keeps the users and their passwords. Returns the emails.
 */
export async function seedDemoAgencyUsers(
  db: SeedDb,
  demoAgencies: readonly { id: string; slug: string; name: string }[],
  password: string,
): Promise<string[]> {
  if (!isAcceptablePassword(password)) {
    throw new SeedRefused(
      `DEMO_USER_PASSWORD must have ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
  const passwordHash = await hashPassword(password);
  const rows = demoAgencies.flatMap((agency) =>
    DEMO_MEMBERS.map((member) => ({
      id: seedId('user', 'demo', agency.slug, member.key),
      agencyId: agency.id,
      email: `${member.key}@${agency.slug}.reih-demo.test`,
      passwordHash,
      role: member.role,
      status: 'active' as const,
      fullName: `${member.fullName}, ${agency.name}`,
    })),
  );
  await db.insert(users).values(rows).onConflictDoNothing();
  return rows.map((row) => row.email);
}

/**
 * The end-to-end tests' Platform Admin (src/cli/e2e-platform-admin.ts only; local stacks only): an
 * active account that logs in with the given password. Returns its id.
 */
export async function createActivePlatformAdmin(
  db: SeedDb,
  account: { email: string; password: string; fullName: string },
): Promise<string> {
  if (!isAcceptablePassword(account.password)) {
    throw new SeedRefused(
      `The password must have ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
  const [created] = await db
    .insert(users)
    .values({
      email: account.email,
      passwordHash: await hashPassword(account.password),
      role: 'platform_admin',
      status: 'active',
      fullName: account.fullName,
    })
    .returning({ id: users.id });
  return (created as { id: string }).id;
}
