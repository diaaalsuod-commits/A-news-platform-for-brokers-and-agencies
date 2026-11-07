import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  primaryId,
  timestamptz,
  updatedAt,
} from '../../../shared/database/column-types.js';
import {
  areaUnitEnum,
  generationStatusEnum,
  langCodeEnum,
  noteVisibilityEnum,
} from '../../../shared/database/enums.js';
import {
  catalogThemesTarget,
  currenciesTarget,
  exchangeRatesTarget,
  paymentPlansTarget,
  projectsTarget,
  unitsTarget,
  usersTarget,
} from '../../../shared/database/fk-targets.js';

export const catalogs = pgTable(
  'catalogs',
  {
    id: primaryId(),
    ownerId: uuid('owner_id').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    clientName: varchar('client_name', { length: 150 }),
    language: langCodeEnum('language').notNull().default('en'),
    currencyCode: char('currency_code', { length: 3 }).notNull().default('AED'),
    areaUnit: areaUnitEnum('area_unit').notNull().default('sqm'),
    showPrices: boolean('show_prices').notNull().default(true),
    showPaymentPlans: boolean('show_payment_plans').notNull().default(true),
    showAmenities: boolean('show_amenities').notNull().default(true),
    showDeveloper: boolean('show_developer').notNull().default(true),
    showBrokerContact: boolean('show_broker_contact').notNull().default(true),
    themeId: uuid('theme_id'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'catalogs_owner_id_fk',
      columns: [t.ownerId],
      foreignColumns: [usersTarget.id],
    }),
    foreignKey({
      name: 'catalogs_theme_id_fk',
      columns: [t.themeId],
      foreignColumns: [catalogThemesTarget.id],
    }),
    foreignKey({
      name: 'catalogs_currency_fk',
      columns: [t.currencyCode],
      foreignColumns: [currenciesTarget.code],
    }),
    index('catalogs_owner_idx')
      .on(t.ownerId)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: primaryId(),
    catalogId: uuid('catalog_id').notNull(),
    projectId: uuid('project_id').notNull(),
    unitId: uuid('unit_id'),
    position: smallint('position').notNull(),
    paymentPlanId: uuid('payment_plan_id'),
    note: text('note'),
    noteVisibility: noteVisibilityEnum('note_visibility').notNull().default('internal'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('catalog_items_catalog_id_project_id_unit_id_key')
      .on(t.catalogId, t.projectId, t.unitId)
      .nullsNotDistinct(),
    foreignKey({
      name: 'catalog_items_catalog_id_fk',
      columns: [t.catalogId],
      foreignColumns: [catalogs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'catalog_items_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projectsTarget.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'catalog_items_unit_id_fk',
      columns: [t.unitId],
      foreignColumns: [unitsTarget.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'catalog_items_payment_plan_id_fk',
      columns: [t.paymentPlanId],
      foreignColumns: [paymentPlansTarget.id],
    }).onDelete('cascade'),
  ],
);

export const catalogVersions = pgTable(
  'catalog_versions',
  {
    id: primaryId(),
    catalogId: uuid('catalog_id').notNull(),
    versionNo: integer('version_no').notNull(),
    status: generationStatusEnum('status').notNull().default('queued'),
    progress: smallint('progress').notNull().default(0),
    attempts: smallint('attempts').notNull().default(0),
    snapshot: jsonb('snapshot').notNull(),
    pdfPath: text('pdf_path'),
    exchangeRateId: uuid('exchange_rate_id'),
    aedPerUnitUsed: numeric('aed_per_unit_used', { precision: 18, scale: 8 }),
    errorMessage: text('error_message'),
    requestedBy: uuid('requested_by').notNull(),
    generatedAt: timestamptz('generated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('catalog_versions_progress_check', sql`progress BETWEEN 0 AND 100`),
    unique('catalog_versions_catalog_id_version_no_key').on(t.catalogId, t.versionNo),
    foreignKey({
      name: 'catalog_versions_catalog_id_fk',
      columns: [t.catalogId],
      foreignColumns: [catalogs.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'catalog_versions_exchange_rate_id_fk',
      columns: [t.exchangeRateId],
      foreignColumns: [exchangeRatesTarget.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'catalog_versions_requested_by_fk',
      columns: [t.requestedBy],
      foreignColumns: [usersTarget.id],
    }).onDelete('restrict'),
  ],
);
