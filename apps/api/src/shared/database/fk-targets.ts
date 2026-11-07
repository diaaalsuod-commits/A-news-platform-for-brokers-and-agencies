import { char, pgTable, uuid } from 'drizzle-orm/pg-core';

/**
 * Name-only stand-ins for foreign keys that cross a module boundary. A schema file points at these
 * instead of importing another module's table, which CLAUDE.md rules 1 and 5 forbid.
 *
 * Use them only inside foreignKey(), never in a query (rule 2). drizzle.config.ts leaves this file
 * out, so no table is created from it. The owning module's schema file defines the real table, and
 * test/schema.integration.test.ts compares the result with docs/design/schema.sql.
 */
const target = (name: string) => pgTable(name, { id: uuid('id').notNull() });

export const usersTarget = target('users');
export const agenciesTarget = target('agencies');
export const currenciesTarget = pgTable('currencies', {
  code: char('code', { length: 3 }).notNull(),
});
export const exchangeRatesTarget = target('exchange_rates');
export const catalogThemesTarget = target('catalog_themes');
export const propertyTypesTarget = target('property_types');
export const layoutsTarget = target('layouts');
export const unitLevelsTarget = target('unit_levels');
export const furnishingTypesTarget = target('furnishing_types');
export const unitTagsTarget = target('unit_tags');
export const amenitiesTarget = target('amenities');
export const developersTarget = target('developers');
export const salesContactsTarget = target('sales_contacts');
export const projectsTarget = target('projects');
export const unitsTarget = target('units');
export const paymentPlansTarget = target('payment_plans');
