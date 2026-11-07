import { foreignKey, index, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../database/column-types.js';
import { usersTarget } from '../database/fk-targets.js';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    actorId: uuid('actor_id').notNull(),
    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'audit_logs_actor_id_fk',
      columns: [t.actorId],
      foreignColumns: [usersTarget.id],
    }),
    // NULLS FIRST is what a bare DESC means in schema.sql; drizzle-kit would write NULLS LAST.
    index('audit_logs_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc().nullsFirst()),
  ],
);
