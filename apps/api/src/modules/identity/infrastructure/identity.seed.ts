import { eq, sql } from 'drizzle-orm';
import { seedId, type SeedDb, SeedRefused } from '../../../shared/database/seed-helpers.js';
import { isAcceptablePassword, MIN_PASSWORD_LENGTH } from '../domain/password-rules.js';
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
      `FIRST_ADMIN_PASSWORD must have at least ${MIN_PASSWORD_LENGTH} characters.`,
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
