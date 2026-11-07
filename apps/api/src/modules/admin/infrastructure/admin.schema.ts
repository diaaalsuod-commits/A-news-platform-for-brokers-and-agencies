import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  smallint,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  primaryId,
  timestamptz,
  updatedAt,
} from '../../../shared/database/column-types.js';
import { usersTarget } from '../../../shared/database/fk-targets.js';

/** Columns shared by the reference tables that have a code and no other fields. */
const lookupColumns = (tableName: string) => ({
  id: primaryId(),
  code: varchar('code', { length: 30 }).notNull().unique(`${tableName}_code_key`),
  nameAr: varchar('name_ar', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }).notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const propertyTypes = pgTable('property_types', lookupColumns('property_types'));

export const layouts = pgTable('layouts', {
  id: primaryId(),
  code: varchar('code', { length: 30 }).notNull().unique('layouts_code_key'),
  bedrooms: smallint('bedrooms').notNull(),
  nameAr: varchar('name_ar', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }).notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const unitLevels = pgTable('unit_levels', lookupColumns('unit_levels'));

export const furnishingTypes = pgTable('furnishing_types', lookupColumns('furnishing_types'));

export const unitTags = pgTable('unit_tags', lookupColumns('unit_tags'));

export const amenityCategories = pgTable('amenity_categories', {
  id: primaryId(),
  nameAr: varchar('name_ar', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }).notNull(),
  icon: varchar('icon', { length: 50 }),
  sortOrder: smallint('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const amenities = pgTable(
  'amenities',
  {
    id: primaryId(),
    categoryId: uuid('category_id').notNull(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    icon: varchar('icon', { length: 50 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'amenities_category_id_fk',
      columns: [t.categoryId],
      foreignColumns: [amenityCategories.id],
    }),
  ],
);

export const currencies = pgTable('currencies', {
  id: primaryId(),
  code: char('code', { length: 3 }).notNull().unique('currencies_code_key'),
  symbol: varchar('symbol', { length: 5 }).notNull(),
  nameAr: varchar('name_ar', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }).notNull(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: primaryId(),
    currencyId: uuid('currency_id').notNull(),
    aedPerUnit: numeric('aed_per_unit', { precision: 18, scale: 8 }).notNull(),
    effectiveAt: timestamptz('effective_at').notNull(),
    enteredBy: uuid('entered_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('exchange_rates_aed_per_unit_check', sql`aed_per_unit > 0`),
    foreignKey({
      name: 'exchange_rates_currency_id_fk',
      columns: [t.currencyId],
      foreignColumns: [currencies.id],
    }),
    foreignKey({
      name: 'exchange_rates_entered_by_fk',
      columns: [t.enteredBy],
      foreignColumns: [usersTarget.id],
    }),
    // NULLS FIRST is what a bare DESC means in schema.sql; drizzle-kit would write NULLS LAST.
    index('exchange_rates_latest_idx').on(t.currencyId, t.effectiveAt.desc().nullsFirst()),
  ],
);

export const catalogThemes = pgTable('catalog_themes', {
  id: primaryId(),
  name: varchar('name', { length: 80 }).notNull().unique('catalog_themes_name_key'),
  primaryColor: char('primary_color', { length: 7 }).notNull(),
  secondaryColor: char('secondary_color', { length: 7 }).notNull(),
  accentColor: char('accent_color', { length: 7 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Holds a single row. */
export const settings = pgTable(
  'settings',
  {
    id: primaryId(),
    staleThresholdDays: smallint('stale_threshold_days').notNull().default(14),
    invitationValidityDays: smallint('invitation_validity_days').notNull().default(7),
    dailyRevealLimit: smallint('daily_reveal_limit').notNull().default(30),
    currentTermsVersion: varchar('current_terms_version', { length: 20 }).notNull().default('1.0'),
    updatedBy: uuid('updated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'settings_updated_by_fk',
      columns: [t.updatedBy],
      foreignColumns: [usersTarget.id],
    }),
  ],
);
