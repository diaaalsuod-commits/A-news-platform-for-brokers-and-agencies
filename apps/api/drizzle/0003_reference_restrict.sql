-- FR-ADM-04 (P3.1): an amenity or a unit tag in use cannot be deleted, only deactivated, so the links
-- from projects and units restrict the delete instead of cascading it. docs/design/schema.sql matches.
ALTER TABLE "project_amenities" DROP CONSTRAINT "project_amenities_amenity_id_fk";
--> statement-breakpoint
ALTER TABLE "unit_tag_links" DROP CONSTRAINT "unit_tag_links_unit_tag_id_fk";
--> statement-breakpoint
ALTER TABLE "project_amenities" ADD CONSTRAINT "project_amenities_amenity_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_tag_links" ADD CONSTRAINT "unit_tag_links_unit_tag_id_fk" FOREIGN KEY ("unit_tag_id") REFERENCES "public"."unit_tags"("id") ON DELETE restrict ON UPDATE no action;