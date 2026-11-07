import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../../shared/database/column-types.js';
import { favoriteTargetEnum } from '../../../shared/database/enums.js';
import {
  developersTarget,
  projectsTarget,
  unitsTarget,
  usersTarget,
} from '../../../shared/database/fk-targets.js';

export const favorites = pgTable(
  'favorites',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    targetType: favoriteTargetEnum('target_type').notNull(),
    projectId: uuid('project_id'),
    unitId: uuid('unit_id'),
    developerId: uuid('developer_id'),
    createdAt: createdAt(),
  },
  (t) => [
    check('favorites_check', sql`num_nonnulls(project_id, unit_id, developer_id) = 1`),
    check(
      'favorites_check1',
      sql`(target_type = 'project') = (project_id IS NOT NULL) AND (target_type = 'unit') = (unit_id IS NOT NULL) AND (target_type = 'developer') = (developer_id IS NOT NULL)`,
    ),
    foreignKey({
      name: 'favorites_user_id_fk',
      columns: [t.userId],
      foreignColumns: [usersTarget.id],
    }),
    foreignKey({
      name: 'favorites_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projectsTarget.id],
    }),
    foreignKey({
      name: 'favorites_unit_id_fk',
      columns: [t.unitId],
      foreignColumns: [unitsTarget.id],
    }),
    foreignKey({
      name: 'favorites_developer_id_fk',
      columns: [t.developerId],
      foreignColumns: [developersTarget.id],
    }),
    uniqueIndex('favorites_unique').on(
      t.userId,
      t.targetType,
      sql`coalesce(project_id, unit_id, developer_id)`,
    ),
  ],
);
