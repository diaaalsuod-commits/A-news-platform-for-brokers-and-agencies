-- Hand-written. Copied from docs/design/schema.sql; test/schema.integration.test.ts compares the two.

-- BR-02: a payment plan's milestones total exactly 100% (checked at commit time)
CREATE OR REPLACE FUNCTION check_plan_total() RETURNS trigger AS $$
DECLARE pid uuid := coalesce(NEW.plan_id, OLD.plan_id); total numeric;
BEGIN
  SELECT coalesce(sum(percentage), 0) INTO total FROM payment_plan_milestones WHERE plan_id = pid;
  IF EXISTS (SELECT 1 FROM payment_plans WHERE id = pid) AND total <> 100 THEN
    RAISE EXCEPTION 'BR-02: payment plan % totals % percent, expected 100', pid, total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER plan_total_100 AFTER INSERT OR UPDATE OR DELETE ON payment_plan_milestones
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_plan_total();--> statement-breakpoint

-- BR-16 / FR-DAT-09: unit price and status history is append-only
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'BR-16: % is append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER unit_history_append_only BEFORE UPDATE OR DELETE ON unit_history
  FOR EACH ROW EXECUTE FUNCTION forbid_change();--> statement-breakpoint

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
END $$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER units_history AFTER UPDATE ON units FOR EACH ROW EXECUTE FUNCTION log_unit_change();--> statement-breakpoint

-- Seed: base currency and the single settings row
INSERT INTO currencies (code, symbol, name_ar, name_en, is_enabled) VALUES ('AED', 'د.إ', 'درهم إماراتي', 'UAE Dirham', true);--> statement-breakpoint
INSERT INTO settings DEFAULT VALUES;
