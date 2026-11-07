import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  citext,
  createdAt,
  geographyMultiPolygon,
  geographyPoint,
  primaryId,
  timestamptz,
  updatedAt,
} from '../../../shared/database/column-types.js';
import {
  areaLevelEnum,
  historyFieldEnum,
  mediaTypeEnum,
  milestoneTimingEnum,
  ownershipTypeEnum,
  projectStageEnum,
  publishStatusEnum,
  recordStatusEnum,
  unitStatusEnum,
} from '../../../shared/database/enums.js';
import {
  amenitiesTarget,
  furnishingTypesTarget,
  layoutsTarget,
  propertyTypesTarget,
  unitLevelsTarget,
  unitTagsTarget,
  usersTarget,
} from '../../../shared/database/fk-targets.js';

export const developers = pgTable(
  'developers',
  {
    id: primaryId(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    logoPath: text('logo_path'),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    website: varchar('website', { length: 255 }),
    status: recordStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [index('developers_name_trgm').using('gin', sql`(name_en || ' ' || name_ar) gin_trgm_ops`)],
);

export const salesContacts = pgTable(
  'sales_contacts',
  {
    id: primaryId(),
    developerId: uuid('developer_id').notNull(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    title: varchar('title', { length: 100 }),
    phone: varchar('phone', { length: 20 }).notNull(),
    whatsapp: varchar('whatsapp', { length: 20 }),
    email: citext('email'),
    languages: text('languages')
      .array()
      .notNull()
      .default(sql`'{}'`),
    verifiedAt: date('verified_at'),
    verificationSource: text('verification_source'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'sales_contacts_developer_id_fk',
      columns: [t.developerId],
      foreignColumns: [developers.id],
    }),
  ],
);

export const areas = pgTable(
  'areas',
  {
    id: primaryId(),
    parentId: uuid('parent_id'),
    level: areaLevelEnum('level').notNull(),
    countryCode: char('country_code', { length: 2 }).notNull().default('AE'),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    center: geographyPoint('center').notNull(),
    boundary: geographyMultiPolygon('boundary'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('areas_check', sql`(level = 'community') = (parent_id IS NOT NULL)`),
    foreignKey({
      name: 'areas_parent_id_fk',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }),
    index('areas_name_trgm').using('gin', sql`(name_en || ' ' || name_ar) gin_trgm_ops`),
    index('areas_boundary_gix').using('gist', t.boundary),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    developerId: uuid('developer_id').notNull(),
    communityId: uuid('community_id').notNull(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    location: geographyPoint('location').notNull(),
    stage: projectStageEnum('stage').notNull(),
    expectedLaunchDate: date('expected_launch_date'),
    handoverQuarter: smallint('handover_quarter'),
    handoverYear: smallint('handover_year'),
    actualHandoverDate: date('actual_handover_date'),
    ownershipType: ownershipTypeEnum('ownership_type').notNull(),
    leaseTermYears: smallint('lease_term_years'),
    serviceChargeAedSqm: numeric('service_charge_aed_sqm', { precision: 10, scale: 2 }),
    status: publishStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamptz('published_at'),
    lastVerifiedAt: timestamptz('last_verified_at'),
    lastVerificationSource: text('last_verification_source'),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('projects_handover_quarter_check', sql`handover_quarter BETWEEN 1 AND 4`),
    check('projects_check', sql`ownership_type = 'freehold' OR lease_term_years IS NOT NULL`),
    foreignKey({
      name: 'projects_developer_id_fk',
      columns: [t.developerId],
      foreignColumns: [developers.id],
    }),
    foreignKey({
      name: 'projects_community_id_fk',
      columns: [t.communityId],
      foreignColumns: [areas.id],
    }),
    foreignKey({
      name: 'projects_created_by_fk',
      columns: [t.createdBy],
      foreignColumns: [usersTarget.id],
    }),
    foreignKey({
      name: 'projects_updated_by_fk',
      columns: [t.updatedBy],
      foreignColumns: [usersTarget.id],
    }),
    index('projects_location_gix').using('gist', t.location),
    index('projects_published_idx')
      .on(t.status, t.stage)
      .where(sql`status = 'published'`),
    index('projects_name_trgm').using('gin', sql`(name_en || ' ' || name_ar) gin_trgm_ops`),
  ],
);

export const projectVerifications = pgTable(
  'project_verifications',
  {
    id: primaryId(),
    projectId: uuid('project_id').notNull(),
    verifiedAt: timestamptz('verified_at').notNull(),
    source: text('source').notNull(),
    notes: text('notes'),
    verifiedBy: uuid('verified_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'project_verifications_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }),
    foreignKey({
      name: 'project_verifications_verified_by_fk',
      columns: [t.verifiedBy],
      foreignColumns: [usersTarget.id],
    }),
  ],
);

export const paymentPlans = pgTable(
  'payment_plans',
  {
    id: primaryId(),
    projectId: uuid('project_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'payment_plans_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }),
    uniqueIndex('payment_plans_one_default')
      .on(t.projectId)
      .where(sql`is_default`),
  ],
);

export const paymentPlanMilestones = pgTable(
  'payment_plan_milestones',
  {
    id: primaryId(),
    planId: uuid('plan_id').notNull(),
    seq: smallint('seq').notNull(),
    labelEn: varchar('label_en', { length: 150 }).notNull(),
    labelAr: varchar('label_ar', { length: 150 }),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).notNull(),
    timing: milestoneTimingEnum('timing').notNull(),
    dueDate: date('due_date'),
    constructionPct: smallint('construction_pct'),
    monthsAfterHandover: smallint('months_after_handover'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('payment_plan_milestones_percentage_check', sql`percentage > 0 AND percentage <= 100`),
    unique('payment_plan_milestones_plan_id_seq_key').on(t.planId, t.seq),
    foreignKey({
      name: 'payment_plan_milestones_plan_id_fk',
      columns: [t.planId],
      foreignColumns: [paymentPlans.id],
    }).onDelete('cascade'),
  ],
);

export const units = pgTable(
  'units',
  {
    id: primaryId(),
    projectId: uuid('project_id').notNull(),
    unitNumber: varchar('unit_number', { length: 30 }).notNull(),
    propertyTypeId: uuid('property_type_id').notNull(),
    layoutId: uuid('layout_id').notNull(),
    unitLevelId: uuid('unit_level_id'),
    furnishingTypeId: uuid('furnishing_type_id'),
    bathrooms: smallint('bathrooms'),
    internalAreaSqm: numeric('internal_area_sqm', { precision: 10, scale: 2 }).notNull(),
    totalAreaSqm: numeric('total_area_sqm', { precision: 10, scale: 2 }),
    floorLabel: varchar('floor_label', { length: 10 }),
    floorSortKey: smallint('floor_sort_key'),
    view: varchar('view', { length: 100 }),
    priceAed: numeric('price_aed', { precision: 14, scale: 2 }),
    status: unitStatusEnum('status').notNull().default('available'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('units_project_id_unit_number_key').on(t.projectId, t.unitNumber),
    check('units_price_aed_check', sql`price_aed IS NULL OR price_aed > 0`),
    check('units_internal_area_sqm_check', sql`internal_area_sqm > 0`),
    check('units_check', sql`status = 'on_request' OR price_aed IS NOT NULL`),
    foreignKey({
      name: 'units_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }),
    foreignKey({
      name: 'units_property_type_id_fk',
      columns: [t.propertyTypeId],
      foreignColumns: [propertyTypesTarget.id],
    }),
    foreignKey({
      name: 'units_layout_id_fk',
      columns: [t.layoutId],
      foreignColumns: [layoutsTarget.id],
    }),
    foreignKey({
      name: 'units_unit_level_id_fk',
      columns: [t.unitLevelId],
      foreignColumns: [unitLevelsTarget.id],
    }),
    foreignKey({
      name: 'units_furnishing_type_id_fk',
      columns: [t.furnishingTypeId],
      foreignColumns: [furnishingTypesTarget.id],
    }),
    index('units_filter_idx').on(t.projectId, t.status, t.priceAed, t.layoutId, t.propertyTypeId),
  ],
);

export const mediaFiles = pgTable(
  'media_files',
  {
    id: primaryId(),
    projectId: uuid('project_id').notNull(),
    unitId: uuid('unit_id'),
    type: mediaTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    filePath: text('file_path').notNull(),
    mimeType: varchar('mime_type', { length: 80 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    displayOrder: smallint('display_order').notNull().default(0),
    sourceNote: text('source_note').notNull(),
    licenseNote: text('license_note').notNull(),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'media_files_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }),
    foreignKey({
      name: 'media_files_unit_id_fk',
      columns: [t.unitId],
      foreignColumns: [units.id],
    }),
    foreignKey({
      name: 'media_files_uploaded_by_fk',
      columns: [t.uploadedBy],
      foreignColumns: [usersTarget.id],
    }),
  ],
);

/** Append-only (BR-16). The log_unit_change trigger writes it; nothing else should. */
export const unitHistory = pgTable(
  'unit_history',
  {
    id: primaryId(),
    unitId: uuid('unit_id').notNull(),
    field: historyFieldEnum('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value').notNull(),
    changedBy: uuid('changed_by').notNull(),
    changedAt: timestamptz('changed_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'unit_history_unit_id_fk',
      columns: [t.unitId],
      foreignColumns: [units.id],
    }),
    foreignKey({
      name: 'unit_history_changed_by_fk',
      columns: [t.changedBy],
      foreignColumns: [usersTarget.id],
    }),
    // NULLS FIRST is what a bare DESC means in schema.sql; drizzle-kit would write NULLS LAST.
    index('unit_history_unit_idx').on(t.unitId, t.changedAt.desc().nullsFirst()),
  ],
);

export const projectAmenities = pgTable(
  'project_amenities',
  {
    projectId: uuid('project_id').notNull(),
    amenityId: uuid('amenity_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'project_amenities_pkey', columns: [t.projectId, t.amenityId] }),
    foreignKey({
      name: 'project_amenities_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_amenities_amenity_id_fk',
      columns: [t.amenityId],
      foreignColumns: [amenitiesTarget.id],
    }).onDelete('cascade'),
  ],
);

export const projectSalesContacts = pgTable(
  'project_sales_contacts',
  {
    projectId: uuid('project_id').notNull(),
    salesContactId: uuid('sales_contact_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'project_sales_contacts_pkey', columns: [t.projectId, t.salesContactId] }),
    foreignKey({
      name: 'project_sales_contacts_project_id_fk',
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'project_sales_contacts_sales_contact_id_fk',
      columns: [t.salesContactId],
      foreignColumns: [salesContacts.id],
    }).onDelete('cascade'),
  ],
);

export const unitTagLinks = pgTable(
  'unit_tag_links',
  {
    unitId: uuid('unit_id').notNull(),
    unitTagId: uuid('unit_tag_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'unit_tag_links_pkey', columns: [t.unitId, t.unitTagId] }),
    foreignKey({
      name: 'unit_tag_links_unit_id_fk',
      columns: [t.unitId],
      foreignColumns: [units.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'unit_tag_links_unit_tag_id_fk',
      columns: [t.unitTagId],
      foreignColumns: [unitTagsTarget.id],
    }).onDelete('cascade'),
  ],
);
