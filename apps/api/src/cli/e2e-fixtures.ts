import { sql } from 'drizzle-orm';
import { seedId, type SeedDb } from '../shared/database/seed-helpers.js';

/**
 * Fictional test data for the end-to-end tests (D-02). It lives with the seed commands, not in any
 * module's public API, and only e2e-invite calls it. Both rows are idempotent: a second run
 * changes nothing.
 */

export const E2E_AGENCY_ID = seedId('e2e', 'agency');
export const E2E_INVITER_ID = seedId('e2e', 'inviter');

/** The agency the end-to-end Agency Admin is invited into. */
export async function ensureE2eAgency(db: SeedDb): Promise<string> {
  await db.execute(sql`
    INSERT INTO agencies (id, name_ar, name_en, trade_license_no, contact_email, contact_phone)
    VALUES (${E2E_AGENCY_ID}, 'وكالة اختبار آلي', 'E2E Test Agency', 'E2E-TEST-0001',
            'e2e-agency@reih.localhost', '+971500000001')
    ON CONFLICT DO NOTHING
  `);
  return E2E_AGENCY_ID;
}

/**
 * The user recorded as the inviter. A Platform Admin may invite an agency's first Agency Admin. It
 * is deactivated and has no password, so nobody can log in with it.
 */
export async function ensureE2eInviter(db: SeedDb): Promise<string> {
  await db.execute(sql`
    INSERT INTO users (id, email, role, status, full_name)
    VALUES (${E2E_INVITER_ID}, 'e2e-inviter@reih.localhost', 'platform_admin', 'deactivated',
            'E2E inviter')
    ON CONFLICT DO NOTHING
  `);
  return E2E_INVITER_ID;
}
