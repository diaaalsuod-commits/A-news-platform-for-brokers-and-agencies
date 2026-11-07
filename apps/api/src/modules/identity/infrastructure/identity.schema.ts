import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  index,
  inet,
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
import {
  areaUnitEnum,
  langCodeEnum,
  userRoleEnum,
  userStatusEnum,
} from '../../../shared/database/enums.js';
import { agenciesTarget, currenciesTarget } from '../../../shared/database/fk-targets.js';

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    agencyId: uuid('agency_id'),
    email: citext('email').notNull().unique('users_email_key'),
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('invited'),
    fullName: varchar('full_name', { length: 150 }),
    mobile: varchar('mobile', { length: 20 }),
    whatsapp: varchar('whatsapp', { length: 20 }),
    jobTitle: varchar('job_title', { length: 100 }),
    photoPath: text('photo_path'),
    brn: varchar('brn', { length: 30 }),
    prefLanguage: langCodeEnum('pref_language').notNull().default('en'),
    prefCurrency: char('pref_currency', { length: 3 }).notNull().default('AED'),
    prefAreaUnit: areaUnitEnum('pref_area_unit').notNull().default('sqm'),
    termsVersion: varchar('terms_version', { length: 20 }),
    termsAcceptedAt: timestamptz('terms_accepted_at'),
    failedLoginCount: smallint('failed_login_count').notNull().default(0),
    lockedUntil: timestamptz('locked_until'),
    lastLoginAt: timestamptz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_check', sql`(role IN ('broker','agency_admin')) = (agency_id IS NOT NULL)`),
    foreignKey({
      name: 'users_agency_id_fk',
      columns: [t.agencyId],
      foreignColumns: [agenciesTarget.id],
    }),
    foreignKey({
      name: 'users_pref_currency_fk',
      columns: [t.prefCurrency],
      foreignColumns: [currenciesTarget.code],
    }),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    agencyId: uuid('agency_id'),
    email: citext('email').notNull(),
    role: userRoleEnum('role').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique('invitations_token_hash_key'),
    invitedBy: uuid('invited_by'),
    expiresAt: timestamptz('expires_at').notNull(),
    lastSentAt: timestamptz('last_sent_at').notNull().defaultNow(),
    acceptedAt: timestamptz('accepted_at'),
    cancelledAt: timestamptz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'invitations_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'invitations_agency_id_fk',
      columns: [t.agencyId],
      foreignColumns: [agenciesTarget.id],
    }),
    foreignKey({
      name: 'invitations_invited_by_fk',
      columns: [t.invitedBy],
      foreignColumns: [users.id],
    }),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique('sessions_token_hash_key'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    lastActivityAt: timestamptz('last_activity_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    endedAt: timestamptz('ended_at'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'sessions_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    index('sessions_user_idx')
      .on(t.userId)
      .where(sql`ended_at IS NULL`),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    tokenHash: char('token_hash', { length: 64 })
      .notNull()
      .unique('password_reset_tokens_token_hash_key'),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'password_reset_tokens_user_id_fk',
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
  ],
);
