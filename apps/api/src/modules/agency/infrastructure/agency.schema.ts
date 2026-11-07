import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  pgTable,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  citext,
  createdAt,
  primaryId,
  timestamptz,
  updatedAt,
} from '../../../shared/database/column-types.js';
import { agencyStatusEnum } from '../../../shared/database/enums.js';
import { usersTarget } from '../../../shared/database/fk-targets.js';

export const agencies = pgTable(
  'agencies',
  {
    id: primaryId(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    tradeLicenseNo: varchar('trade_license_no', { length: 50 })
      .notNull()
      .unique('agencies_trade_license_no_key'),
    contactEmail: citext('contact_email').notNull(),
    contactPhone: varchar('contact_phone', { length: 20 }).notNull(),
    status: agencyStatusEnum('status').notNull().default('active'),
    statusReason: text('status_reason'),
    statusChangedAt: timestamptz('status_changed_at'),
    statusChangedBy: uuid('status_changed_by'),
    memberLimit: smallint('member_limit'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('agencies_check', sql`status <> 'suspended' OR status_reason IS NOT NULL`),
    foreignKey({
      name: 'agencies_status_changed_by_fk',
      columns: [t.statusChangedBy],
      foreignColumns: [usersTarget.id],
    }),
    foreignKey({
      name: 'agencies_created_by_fk',
      columns: [t.createdBy],
      foreignColumns: [usersTarget.id],
    }),
  ],
);

export const agencyBranding = pgTable(
  'agency_branding',
  {
    id: primaryId(),
    agencyId: uuid('agency_id').notNull().unique('agency_branding_agency_id_key'),
    marketingName: varchar('marketing_name', { length: 200 }).notNull(),
    logoPath: text('logo_path'),
    primaryColor: char('primary_color', { length: 7 }).notNull().default('#1F3A5F'),
    secondaryColor: char('secondary_color', { length: 7 }).notNull().default('#C9A227'),
    phone: varchar('phone', { length: 20 }),
    email: citext('email'),
    website: varchar('website', { length: 255 }),
    address: text('address'),
    orn: varchar('orn', { length: 30 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'agency_branding_agency_id_fk',
      columns: [t.agencyId],
      foreignColumns: [agencies.id],
    }).onDelete('cascade'),
  ],
);
