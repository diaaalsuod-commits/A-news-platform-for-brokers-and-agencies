CREATE TYPE "public"."agency_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."area_level" AS ENUM('emirate', 'community');--> statement-breakpoint
CREATE TYPE "public"."area_unit" AS ENUM('sqm', 'sqft');--> statement-breakpoint
CREATE TYPE "public"."favorite_target" AS ENUM('project', 'unit', 'developer');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('queued', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."history_field" AS ENUM('price', 'status');--> statement-breakpoint
CREATE TYPE "public"."lang_code" AS ENUM('ar', 'en');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'floor_plan', 'brochure', 'master_plan', 'video');--> statement-breakpoint
CREATE TYPE "public"."milestone_timing" AS ENUM('on_booking', 'on_date', 'construction_stage', 'on_handover', 'after_handover');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('client', 'internal');--> statement-breakpoint
CREATE TYPE "public"."ownership_type" AS ENUM('freehold', 'leasehold');--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('upcoming', 'under_construction', 'ready');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('available', 'reserved', 'sold', 'on_request');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('broker', 'agency_admin', 'data_operator', 'platform_admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'deactivated');--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"icon" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenity_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"icon" varchar(50),
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"primary_color" char(7) NOT NULL,
	"secondary_color" char(7) NOT NULL,
	"accent_color" char(7) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_themes_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" char(3) NOT NULL,
	"symbol" varchar(5) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency_id" uuid NOT NULL,
	"aed_per_unit" numeric(18, 8) NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"entered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_aed_per_unit_check" CHECK (aed_per_unit > 0)
);
--> statement-breakpoint
CREATE TABLE "furnishing_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "furnishing_types_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"bedrooms" smallint NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "layouts_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "property_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_types_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stale_threshold_days" smallint DEFAULT 14 NOT NULL,
	"invitation_validity_days" smallint DEFAULT 7 NOT NULL,
	"daily_reveal_limit" smallint DEFAULT 30 NOT NULL,
	"current_terms_version" varchar(20) DEFAULT '1.0' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_levels_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "unit_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_tags_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"trade_license_no" varchar(50) NOT NULL,
	"contact_email" "citext" NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	"status" "agency_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"status_changed_by" uuid,
	"member_limit" smallint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_trade_license_no_key" UNIQUE("trade_license_no"),
	CONSTRAINT "agencies_check" CHECK (status <> 'suspended' OR status_reason IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "agency_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"marketing_name" varchar(200) NOT NULL,
	"logo_path" text,
	"primary_color" char(7) DEFAULT '#1F3A5F' NOT NULL,
	"secondary_color" char(7) DEFAULT '#C9A227' NOT NULL,
	"phone" varchar(20),
	"email" "citext",
	"website" varchar(255),
	"address" text,
	"orn" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_branding_agency_id_key" UNIQUE("agency_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_id" uuid,
	"position" smallint NOT NULL,
	"payment_plan_id" uuid,
	"note" text,
	"note_visibility" "note_visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_catalog_id_project_id_unit_id_key" UNIQUE NULLS NOT DISTINCT("catalog_id","project_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"pdf_path" text,
	"exchange_rate_id" uuid,
	"aed_per_unit_used" numeric(18, 8),
	"error_message" text,
	"requested_by" uuid NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_versions_catalog_id_version_no_key" UNIQUE("catalog_id","version_no"),
	CONSTRAINT "catalog_versions_progress_check" CHECK (progress BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"client_name" varchar(150),
	"language" "lang_code" DEFAULT 'en' NOT NULL,
	"currency_code" char(3) DEFAULT 'AED' NOT NULL,
	"area_unit" "area_unit" DEFAULT 'sqm' NOT NULL,
	"show_prices" boolean DEFAULT true NOT NULL,
	"show_payment_plans" boolean DEFAULT true NOT NULL,
	"show_amenities" boolean DEFAULT true NOT NULL,
	"show_developer" boolean DEFAULT true NOT NULL,
	"show_broker_contact" boolean DEFAULT true NOT NULL,
	"theme_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"sales_contact_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revealed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"level" "area_level" NOT NULL,
	"country_code" char(2) DEFAULT 'AE' NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"description_ar" text,
	"description_en" text,
	"center" geography(Point,4326) NOT NULL,
	"boundary" geography(MultiPolygon,4326),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_check" CHECK ((level = 'community') = (parent_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"logo_path" text,
	"description_ar" text,
	"description_en" text,
	"website" varchar(255),
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_id" uuid,
	"type" "media_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"source_note" text NOT NULL,
	"license_note" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plan_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"label_en" varchar(150) NOT NULL,
	"label_ar" varchar(150),
	"percentage" numeric(5, 2) NOT NULL,
	"timing" "milestone_timing" NOT NULL,
	"due_date" date,
	"construction_pct" smallint,
	"months_after_handover" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_plan_milestones_plan_id_seq_key" UNIQUE("plan_id","seq"),
	CONSTRAINT "payment_plan_milestones_percentage_check" CHECK (percentage > 0 AND percentage <= 100)
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_amenities" (
	"project_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	CONSTRAINT "project_amenities_pkey" PRIMARY KEY("project_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "project_sales_contacts" (
	"project_id" uuid NOT NULL,
	"sales_contact_id" uuid NOT NULL,
	CONSTRAINT "project_sales_contacts_pkey" PRIMARY KEY("project_id","sales_contact_id")
);
--> statement-breakpoint
CREATE TABLE "project_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"verified_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"description_ar" text,
	"description_en" text,
	"location" geography(Point,4326) NOT NULL,
	"stage" "project_stage" NOT NULL,
	"expected_launch_date" date,
	"handover_quarter" smallint,
	"handover_year" smallint,
	"actual_handover_date" date,
	"ownership_type" "ownership_type" NOT NULL,
	"lease_term_years" smallint,
	"service_charge_aed_sqm" numeric(10, 2),
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"last_verification_source" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_handover_quarter_check" CHECK (handover_quarter BETWEEN 1 AND 4),
	CONSTRAINT "projects_check" CHECK (ownership_type = 'freehold' OR lease_term_years IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "sales_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"title" varchar(100),
	"phone" varchar(20) NOT NULL,
	"whatsapp" varchar(20),
	"email" "citext",
	"languages" text[] DEFAULT '{}' NOT NULL,
	"verified_at" date,
	"verification_source" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"field" "history_field" NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_tag_links" (
	"unit_id" uuid NOT NULL,
	"unit_tag_id" uuid NOT NULL,
	CONSTRAINT "unit_tag_links_pkey" PRIMARY KEY("unit_id","unit_tag_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_number" varchar(30) NOT NULL,
	"property_type_id" uuid NOT NULL,
	"layout_id" uuid NOT NULL,
	"unit_level_id" uuid,
	"furnishing_type_id" uuid,
	"bathrooms" smallint,
	"internal_area_sqm" numeric(10, 2) NOT NULL,
	"total_area_sqm" numeric(10, 2),
	"floor_label" varchar(10),
	"floor_sort_key" smallint,
	"view" varchar(100),
	"price_aed" numeric(14, 2),
	"status" "unit_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_project_id_unit_number_key" UNIQUE("project_id","unit_number"),
	CONSTRAINT "units_price_aed_check" CHECK (price_aed IS NULL OR price_aed > 0),
	CONSTRAINT "units_internal_area_sqm_check" CHECK (internal_area_sqm > 0),
	CONSTRAINT "units_check" CHECK (status = 'on_request' OR price_aed IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" "favorite_target" NOT NULL,
	"project_id" uuid,
	"unit_id" uuid,
	"developer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_check" CHECK (num_nonnulls(project_id, unit_id, developer_id) = 1),
	CONSTRAINT "favorites_check1" CHECK ((target_type = 'project') = (project_id IS NOT NULL) AND (target_type = 'unit') = (unit_id IS NOT NULL) AND (target_type = 'developer') = (developer_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agency_id" uuid,
	"email" "citext" NOT NULL,
	"role" "user_role" NOT NULL,
	"token_hash" char(64) NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"last_activity_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"full_name" varchar(150),
	"mobile" varchar(20),
	"whatsapp" varchar(20),
	"job_title" varchar(100),
	"photo_path" text,
	"brn" varchar(30),
	"pref_language" "lang_code" DEFAULT 'en' NOT NULL,
	"pref_currency" char(3) DEFAULT 'AED' NOT NULL,
	"pref_area_unit" "area_unit" DEFAULT 'sqm' NOT NULL,
	"terms_version" varchar(20),
	"terms_accepted_at" timestamp with time zone,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_check" CHECK ((role IN ('broker','agency_admin')) = (agency_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."amenity_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_entered_by_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_status_changed_by_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_branding" ADD CONSTRAINT "agency_branding_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_payment_plan_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_versions" ADD CONSTRAINT "catalog_versions_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_versions" ADD CONSTRAINT "catalog_versions_exchange_rate_id_fk" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_versions" ADD CONSTRAINT "catalog_versions_requested_by_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_theme_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."catalog_themes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_currency_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_sales_contact_id_fk" FOREIGN KEY ("sales_contact_id") REFERENCES "public"."sales_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveals" ADD CONSTRAINT "contact_reveals_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_milestones" ADD CONSTRAINT "payment_plan_milestones_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_amenity_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sales_contacts" ADD CONSTRAINT "project_sales_contacts_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sales_contacts" ADD CONSTRAINT "project_sales_contacts_sales_contact_id_fk" FOREIGN KEY ("sales_contact_id") REFERENCES "public"."sales_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_verifications" ADD CONSTRAINT "project_verifications_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_verifications" ADD CONSTRAINT "project_verifications_verified_by_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_developer_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_history" ADD CONSTRAINT "unit_history_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_history" ADD CONSTRAINT "unit_history_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_tag_links" ADD CONSTRAINT "unit_tag_links_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_tag_links" ADD CONSTRAINT "unit_tag_links_unit_tag_id_fk" FOREIGN KEY ("unit_tag_id") REFERENCES "public"."unit_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_type_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_layout_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_unit_level_id_fk" FOREIGN KEY ("unit_level_id") REFERENCES "public"."unit_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_furnishing_type_id_fk" FOREIGN KEY ("furnishing_type_id") REFERENCES "public"."furnishing_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_developer_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pref_currency_fk" FOREIGN KEY ("pref_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_latest_idx" ON "exchange_rates" USING btree ("currency_id","effective_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "catalogs_owner_idx" ON "catalogs" USING btree ("owner_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "contact_reveals_user_day_idx" ON "contact_reveals" USING btree ("user_id","revealed_at");--> statement-breakpoint
CREATE INDEX "areas_name_trgm" ON "areas" USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "areas_boundary_gix" ON "areas" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "developers_name_trgm" ON "developers" USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "payment_plans_one_default" ON "payment_plans" USING btree ("project_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "projects_location_gix" ON "projects" USING gist ("location");--> statement-breakpoint
CREATE INDEX "projects_published_idx" ON "projects" USING btree ("status","stage") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "projects_name_trgm" ON "projects" USING gin ((name_en || ' ' || name_ar) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "unit_history_unit_idx" ON "unit_history" USING btree ("unit_id","changed_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "units_filter_idx" ON "units" USING btree ("project_id","status","price_aed","layout_id","property_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_unique" ON "favorites" USING btree ("user_id","target_type",coalesce(project_id, unit_id, developer_id));--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at" DESC NULLS FIRST);