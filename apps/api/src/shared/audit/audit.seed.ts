import { seedId, type SeedDb } from '../database/seed-helpers.js';
import { auditLogs } from './audit.schema.js';

/** Records what a seed wrote and why, so demo values stay identifiable in the database. */
export async function recordSeedAudit(
  db: SeedDb,
  entry: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    newValues: Record<string, unknown>;
    reason: string;
  },
): Promise<void> {
  await db
    .insert(auditLogs)
    .values({ id: seedId('audit', entry.action, entry.entityId), ...entry })
    .onConflictDoNothing();
}
