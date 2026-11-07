import { foreignKey, index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamptz } from '../../../shared/database/column-types.js';
import {
  agenciesTarget,
  projectsTarget,
  salesContactsTarget,
  usersTarget,
} from '../../../shared/database/fk-targets.js';

/** Kept 12 months (NFR-11). */
export const contactReveals = pgTable(
  'contact_reveals',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    agencyId: uuid('agency_id').notNull(),
    salesContactId: uuid('sales_contact_id').notNull(),
    projectId: uuid('project_id').notNull(),
    revealedAt: timestamptz('revealed_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'contact_reveals_user_id_fk',
      columns: [t.userId],
      foreignColumns: [usersTarget.id],
    }),
    foreignKey({
      name: 'contact_reveals_agency_id_fk',
      columns: [t.agencyId],
      foreignColumns: [agenciesTarget.id],
    }),
    foreignKey({
      name: 'contact_reveals_sales_contact_id_fk',
      columns: [t.salesContactId],
      foreignColumns: [salesContactsTarget.id],
    }),
    foreignKey({
      name: 'contact_reveals_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projectsTarget.id],
    }),
    index('contact_reveals_user_day_idx').on(t.userId, t.revealedAt),
  ],
);
