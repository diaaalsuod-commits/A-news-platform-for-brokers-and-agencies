-- REIH v1.0 — physical schema (PostgreSQL 16 + PostGIS 3.4 + pg_trgm)
-- Generated from SRS v3.1 Section 8: 33 entity tables + 3 join tables = 36 tables.
-- Prices in AED, areas in m², times in UTC (timestamptz).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('broker', 'agency_admin', 'data_operator', 'platform_admin');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'deactivated');
CREATE TYPE agency_status AS ENUM ('active', 'suspended');
CREATE TYPE lang_code AS ENUM ('ar', 'en');
CREATE TYPE area_unit AS ENUM ('sqm', 'sqft');
CREATE TYPE area_level AS ENUM ('emirate', 'community');
CREATE TYPE record_status AS ENUM ('active', 'archived');
CREATE TYPE project_stage AS ENUM ('upcoming', 'under_construction', 'ready');
CREATE TYPE publish_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE ownership_type AS ENUM ('freehold', 'leasehold');
CREATE TYPE media_type AS ENUM ('image', 'floor_plan', 'brochure', 'master_plan', 'video');
CREATE TYPE milestone_timing AS ENUM ('on_booking', 'on_date', 'construction_stage', 'on_handover', 'after_handover');
CREATE TYPE unit_status AS ENUM ('available', 'reserved', 'sold', 'on_request');
CREATE TYPE history_field AS ENUM ('price', 'status');
CREATE TYPE note_visibility AS ENUM ('client', 'internal');
CREATE TYPE generation_status AS ENUM ('queued', 'generating', 'ready', 'failed');
CREATE TYPE favorite_target AS ENUM ('project', 'unit', 'developer');

-- ===================== Accounts =====================
CREATE TABLE users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agency_id uuid,
  email citext NOT NULL UNIQUE,
  password_hash text,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'invited',
  full_name varchar(150),
  mobile varchar(20),
  whatsapp varchar(20),
  job_title varchar(100),
  photo_path text,
  brn varchar(30),
  pref_language lang_code NOT NULL DEFAULT 'en',
  pref_currency char(3) NOT NULL DEFAULT 'AED',
  pref_area_unit area_unit NOT NULL DEFAULT 'sqm',
  terms_version varchar(20),
  terms_accepted_at timestamptz,
  failed_login_count smallint NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((role IN ('broker','agency_admin')) = (agency_id IS NOT NULL))
);

CREATE TABLE invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agency_id uuid,
  email citext NOT NULL,
  role user_role NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  invited_by uuid,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  ip_address inet,
  user_agent text,
  last_activity_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  PRIMARY KEY (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  PRIMARY KEY (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== Agencies =====================
CREATE TABLE agencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  trade_license_no varchar(50) NOT NULL UNIQUE,
  contact_email citext NOT NULL,
  contact_phone varchar(20) NOT NULL,
  status agency_status NOT NULL DEFAULT 'active',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  member_limit smallint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK (status <> 'suspended' OR status_reason IS NOT NULL)
);

CREATE TABLE agency_branding (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE,
  marketing_name varchar(200) NOT NULL,
  logo_path text,
  primary_color char(7) NOT NULL DEFAULT '#1F3A5F',
  secondary_color char(7) NOT NULL DEFAULT '#C9A227',
  phone varchar(20),
  email citext,
  website varchar(255),
  address text,
  orn varchar(30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ===================== Reference =====================
CREATE TABLE areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid,
  level area_level NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'AE',
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  description_ar text,
  description_en text,
  center geography(Point,4326) NOT NULL,
  boundary geography(MultiPolygon,4326),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((level = 'community') = (parent_id IS NOT NULL))
);

CREATE TABLE property_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE layouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  bedrooms smallint NOT NULL,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE unit_levels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE furnishing_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE unit_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE amenity_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  icon varchar(50),
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE amenities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  icon varchar(50),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE currencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code char(3) NOT NULL UNIQUE,
  symbol varchar(5) NOT NULL,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE exchange_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  currency_id uuid NOT NULL,
  aed_per_unit numeric(18,8) NOT NULL,
  effective_at timestamptz NOT NULL,
  entered_by uuid NOT NULL,
  PRIMARY KEY (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (aed_per_unit > 0)
);

CREATE TABLE catalog_themes ( -- Should
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  primary_color char(7) NOT NULL,
  secondary_color char(7) NOT NULL,
  accent_color char(7) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE settings ( -- single row
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stale_threshold_days smallint NOT NULL DEFAULT 14,
  invitation_validity_days smallint NOT NULL DEFAULT 7,
  daily_reveal_limit smallint NOT NULL DEFAULT 30,
  current_terms_version varchar(20) NOT NULL DEFAULT '1.0',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ===================== Content =====================
CREATE TABLE developers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  logo_path text,
  description_ar text,
  description_en text,
  website varchar(255),
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE sales_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  full_name varchar(150) NOT NULL,
  title varchar(100),
  phone varchar(20) NOT NULL,
  whatsapp varchar(20),
  email citext,
  languages text[] NOT NULL DEFAULT '{}',
  verified_at date,
  verification_source text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  community_id uuid NOT NULL,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  description_ar text,
  description_en text,
  location geography(Point,4326) NOT NULL,
  stage project_stage NOT NULL,
  expected_launch_date date,
  handover_quarter smallint CHECK (handover_quarter BETWEEN 1 AND 4),
  handover_year smallint,
  actual_handover_date date,
  ownership_type ownership_type NOT NULL,
  lease_term_years smallint,
  service_charge_aed_sqm numeric(10,2),
  status publish_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  last_verified_at timestamptz,
  last_verification_source text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK (ownership_type = 'freehold' OR lease_term_years IS NOT NULL)
);

CREATE TABLE project_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  verified_at timestamptz NOT NULL,
  source text NOT NULL,
  notes text,
  verified_by uuid NOT NULL,
  PRIMARY KEY (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  unit_id uuid,
  type media_type NOT NULL,
  title varchar(200) NOT NULL,
  file_path text NOT NULL,
  mime_type varchar(80) NOT NULL,
  size_bytes bigint NOT NULL,
  display_order smallint NOT NULL DEFAULT 0,
  source_note text NOT NULL,
  license_note text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE payment_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE payment_plan_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  seq smallint NOT NULL,
  label_en varchar(150) NOT NULL,
  label_ar varchar(150),
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  timing milestone_timing NOT NULL,
  due_date date,
  construction_pct smallint,
  months_after_handover smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (plan_id, seq)
);

CREATE TABLE units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  unit_number varchar(30) NOT NULL,
  property_type_id uuid NOT NULL,
  layout_id uuid NOT NULL,
  unit_level_id uuid,
  furnishing_type_id uuid,
  bathrooms smallint,
  internal_area_sqm numeric(10,2) NOT NULL,
  total_area_sqm numeric(10,2),
  floor_label varchar(10),
  floor_sort_key smallint,
  view varchar(100),
  price_aed numeric(14,2),
  status unit_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (project_id, unit_number),
  CHECK (price_aed IS NULL OR price_aed > 0),
  CHECK (internal_area_sqm > 0),
  CHECK (status = 'on_request' OR price_aed IS NOT NULL)
);

CREATE TABLE unit_history ( -- append-only (BR-16)
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  field history_field NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ===================== Broker work =====================
CREATE TABLE catalogs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title varchar(200) NOT NULL,
  client_name varchar(150),
  language lang_code NOT NULL DEFAULT 'en',
  currency_code char(3) NOT NULL DEFAULT 'AED',
  area_unit area_unit NOT NULL DEFAULT 'sqm',
  show_prices boolean NOT NULL DEFAULT true,
  show_payment_plans boolean NOT NULL DEFAULT true,
  show_amenities boolean NOT NULL DEFAULT true,
  show_developer boolean NOT NULL DEFAULT true,
  show_broker_contact boolean NOT NULL DEFAULT true,
  theme_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE catalog_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL,
  project_id uuid NOT NULL,
  unit_id uuid,
  position smallint NOT NULL,
  payment_plan_id uuid,
  note text,
  note_visibility note_visibility NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE NULLS NOT DISTINCT (catalog_id, project_id, unit_id)
);

CREATE TABLE catalog_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL,
  version_no integer NOT NULL,
  status generation_status NOT NULL DEFAULT 'queued',
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts smallint NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  pdf_path text,
  exchange_rate_id uuid,
  aed_per_unit_used numeric(18,8),
  error_message text,
  requested_by uuid NOT NULL,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (catalog_id, version_no)
);

CREATE TABLE favorites ( -- Should
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type favorite_target NOT NULL,
  project_id uuid,
  unit_id uuid,
  developer_id uuid,
  PRIMARY KEY (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(project_id, unit_id, developer_id) = 1),
  CHECK ((target_type = 'project') = (project_id IS NOT NULL) AND (target_type = 'unit') = (unit_id IS NOT NULL) AND (target_type = 'developer') = (developer_id IS NOT NULL))
);

-- ===================== Logs =====================
CREATE TABLE contact_reveals ( -- kept 12 months (NFR-11)
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  sales_contact_id uuid NOT NULL,
  project_id uuid NOT NULL,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE audit_logs ( -- Should
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action varchar(60) NOT NULL,
  entity_type varchar(60) NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ===================== Join =====================
CREATE TABLE project_amenities (
  project_id uuid NOT NULL,
  amenity_id uuid NOT NULL,
  PRIMARY KEY (project_id, amenity_id)
);

CREATE TABLE project_sales_contacts (
  project_id uuid NOT NULL,
  sales_contact_id uuid NOT NULL,
  PRIMARY KEY (project_id, sales_contact_id)
);

CREATE TABLE unit_tag_links (
  unit_id uuid NOT NULL,
  unit_tag_id uuid NOT NULL,
  PRIMARY KEY (unit_id, unit_tag_id)
);

-- ===================== Foreign keys =====================
ALTER TABLE users ADD CONSTRAINT users_agency_id_fk FOREIGN KEY (agency_id) REFERENCES agencies (id);
ALTER TABLE invitations ADD CONSTRAINT invitations_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE invitations ADD CONSTRAINT invitations_agency_id_fk FOREIGN KEY (agency_id) REFERENCES agencies (id);
ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_fk FOREIGN KEY (invited_by) REFERENCES users (id);
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE agencies ADD CONSTRAINT agencies_status_changed_by_fk FOREIGN KEY (status_changed_by) REFERENCES users (id);
ALTER TABLE agencies ADD CONSTRAINT agencies_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE agency_branding ADD CONSTRAINT agency_branding_agency_id_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE;
ALTER TABLE areas ADD CONSTRAINT areas_parent_id_fk FOREIGN KEY (parent_id) REFERENCES areas (id);
ALTER TABLE amenities ADD CONSTRAINT amenities_category_id_fk FOREIGN KEY (category_id) REFERENCES amenity_categories (id);
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_currency_id_fk FOREIGN KEY (currency_id) REFERENCES currencies (id);
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_entered_by_fk FOREIGN KEY (entered_by) REFERENCES users (id);
ALTER TABLE settings ADD CONSTRAINT settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE sales_contacts ADD CONSTRAINT sales_contacts_developer_id_fk FOREIGN KEY (developer_id) REFERENCES developers (id);
ALTER TABLE projects ADD CONSTRAINT projects_developer_id_fk FOREIGN KEY (developer_id) REFERENCES developers (id);
ALTER TABLE projects ADD CONSTRAINT projects_community_id_fk FOREIGN KEY (community_id) REFERENCES areas (id);
ALTER TABLE projects ADD CONSTRAINT projects_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id);
ALTER TABLE projects ADD CONSTRAINT projects_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users (id);
ALTER TABLE project_verifications ADD CONSTRAINT project_verifications_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE project_verifications ADD CONSTRAINT project_verifications_verified_by_fk FOREIGN KEY (verified_by) REFERENCES users (id);
ALTER TABLE media_files ADD CONSTRAINT media_files_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE media_files ADD CONSTRAINT media_files_unit_id_fk FOREIGN KEY (unit_id) REFERENCES units (id);
ALTER TABLE media_files ADD CONSTRAINT media_files_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES users (id);
ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE payment_plan_milestones ADD CONSTRAINT payment_plan_milestones_plan_id_fk FOREIGN KEY (plan_id) REFERENCES payment_plans (id) ON DELETE CASCADE;
ALTER TABLE units ADD CONSTRAINT units_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE units ADD CONSTRAINT units_property_type_id_fk FOREIGN KEY (property_type_id) REFERENCES property_types (id);
ALTER TABLE units ADD CONSTRAINT units_layout_id_fk FOREIGN KEY (layout_id) REFERENCES layouts (id);
ALTER TABLE units ADD CONSTRAINT units_unit_level_id_fk FOREIGN KEY (unit_level_id) REFERENCES unit_levels (id);
ALTER TABLE units ADD CONSTRAINT units_furnishing_type_id_fk FOREIGN KEY (furnishing_type_id) REFERENCES furnishing_types (id);
ALTER TABLE unit_history ADD CONSTRAINT unit_history_unit_id_fk FOREIGN KEY (unit_id) REFERENCES units (id);
ALTER TABLE unit_history ADD CONSTRAINT unit_history_changed_by_fk FOREIGN KEY (changed_by) REFERENCES users (id);
ALTER TABLE catalogs ADD CONSTRAINT catalogs_owner_id_fk FOREIGN KEY (owner_id) REFERENCES users (id);
ALTER TABLE catalogs ADD CONSTRAINT catalogs_theme_id_fk FOREIGN KEY (theme_id) REFERENCES catalog_themes (id);
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_catalog_id_fk FOREIGN KEY (catalog_id) REFERENCES catalogs (id) ON DELETE CASCADE;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_unit_id_fk FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_payment_plan_id_fk FOREIGN KEY (payment_plan_id) REFERENCES payment_plans (id) ON DELETE CASCADE;
ALTER TABLE catalog_versions ADD CONSTRAINT catalog_versions_catalog_id_fk FOREIGN KEY (catalog_id) REFERENCES catalogs (id) ON DELETE CASCADE;
ALTER TABLE catalog_versions ADD CONSTRAINT catalog_versions_exchange_rate_id_fk FOREIGN KEY (exchange_rate_id) REFERENCES exchange_rates (id) ON DELETE CASCADE;
ALTER TABLE catalog_versions ADD CONSTRAINT catalog_versions_requested_by_fk FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE favorites ADD CONSTRAINT favorites_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE favorites ADD CONSTRAINT favorites_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE favorites ADD CONSTRAINT favorites_unit_id_fk FOREIGN KEY (unit_id) REFERENCES units (id);
ALTER TABLE favorites ADD CONSTRAINT favorites_developer_id_fk FOREIGN KEY (developer_id) REFERENCES developers (id);
ALTER TABLE contact_reveals ADD CONSTRAINT contact_reveals_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE contact_reveals ADD CONSTRAINT contact_reveals_agency_id_fk FOREIGN KEY (agency_id) REFERENCES agencies (id);
ALTER TABLE contact_reveals ADD CONSTRAINT contact_reveals_sales_contact_id_fk FOREIGN KEY (sales_contact_id) REFERENCES sales_contacts (id);
ALTER TABLE contact_reveals ADD CONSTRAINT contact_reveals_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fk FOREIGN KEY (actor_id) REFERENCES users (id);
ALTER TABLE project_amenities ADD CONSTRAINT project_amenities_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE project_amenities ADD CONSTRAINT project_amenities_amenity_id_fk FOREIGN KEY (amenity_id) REFERENCES amenities (id) ON DELETE CASCADE;
ALTER TABLE project_sales_contacts ADD CONSTRAINT project_sales_contacts_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE project_sales_contacts ADD CONSTRAINT project_sales_contacts_sales_contact_id_fk FOREIGN KEY (sales_contact_id) REFERENCES sales_contacts (id) ON DELETE CASCADE;
ALTER TABLE unit_tag_links ADD CONSTRAINT unit_tag_links_unit_id_fk FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE;
ALTER TABLE unit_tag_links ADD CONSTRAINT unit_tag_links_unit_tag_id_fk FOREIGN KEY (unit_tag_id) REFERENCES unit_tags (id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_pref_currency_fk FOREIGN KEY (pref_currency) REFERENCES currencies (code);
ALTER TABLE catalogs ADD CONSTRAINT catalogs_currency_fk FOREIGN KEY (currency_code) REFERENCES currencies (code);

-- ===================== Indexes =====================
CREATE UNIQUE INDEX payment_plans_one_default ON payment_plans (project_id) WHERE is_default;
CREATE INDEX projects_location_gix ON projects USING gist (location);
CREATE INDEX projects_published_idx ON projects (status, stage) WHERE status = 'published';
CREATE INDEX projects_name_trgm ON projects USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);
CREATE INDEX developers_name_trgm ON developers USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);
CREATE INDEX areas_name_trgm ON areas USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);
CREATE INDEX areas_boundary_gix ON areas USING gist (boundary);
CREATE INDEX units_filter_idx ON units (project_id, status, price_aed, layout_id, property_type_id);
CREATE INDEX unit_history_unit_idx ON unit_history (unit_id, changed_at DESC);
CREATE INDEX contact_reveals_user_day_idx ON contact_reveals (user_id, revealed_at);
CREATE INDEX exchange_rates_latest_idx ON exchange_rates (currency_id, effective_at DESC);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE ended_at IS NULL;
CREATE INDEX catalogs_owner_idx ON catalogs (owner_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX favorites_unique ON favorites (user_id, target_type, coalesce(project_id, unit_id, developer_id));
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

-- ===================== Business rules in the database =====================
-- BR-02: a payment plan's milestones total exactly 100% (checked at commit time)
CREATE OR REPLACE FUNCTION check_plan_total() RETURNS trigger AS $$
DECLARE pid uuid := coalesce(NEW.plan_id, OLD.plan_id); total numeric;
BEGIN
  SELECT coalesce(sum(percentage), 0) INTO total FROM payment_plan_milestones WHERE plan_id = pid;
  IF EXISTS (SELECT 1 FROM payment_plans WHERE id = pid) AND total <> 100 THEN
    RAISE EXCEPTION 'BR-02: payment plan % totals % percent, expected 100', pid, total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER plan_total_100 AFTER INSERT OR UPDATE OR DELETE ON payment_plan_milestones
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_plan_total();

-- BR-16 / FR-DAT-09: unit price and status history is append-only
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'BR-16: % is append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;
CREATE TRIGGER unit_history_append_only BEFORE UPDATE OR DELETE ON unit_history
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- FR-DAT-09: every change of price or status adds exactly one history row
CREATE OR REPLACE FUNCTION log_unit_change() RETURNS trigger AS $$
BEGIN
  IF NEW.price_aed IS DISTINCT FROM OLD.price_aed THEN
    INSERT INTO unit_history (unit_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'price', OLD.price_aed::text, NEW.price_aed::text, current_setting('reih.user_id')::uuid);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO unit_history (unit_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status::text, NEW.status::text, current_setting('reih.user_id')::uuid);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER units_history AFTER UPDATE ON units FOR EACH ROW EXECUTE FUNCTION log_unit_change();

-- Seed: base currency and the single settings row
INSERT INTO currencies (code, symbol, name_ar, name_en, is_enabled) VALUES ('AED', 'د.إ', 'درهم إماراتي', 'UAE Dirham', true);
INSERT INTO settings DEFAULT VALUES;
