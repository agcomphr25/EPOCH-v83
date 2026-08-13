-- Repair the composite FK from p2_demand_plans and project_production_demands back
-- to p2_purchase_order_items(id, demand_line_identity).
--
-- These FKs depend on the unique constraint p2_po_items_id_demand_identity_unique
-- which is created by migration 0262.  Drizzle's schema-diff generator places
-- unique-constraint additions AFTER FK additions in its output ordering, so the
-- deployment provisioning phase cannot add them in the right order.  We therefore
-- drop the FKs from the dev DB to keep them out of the schema diff, and re-apply
-- them here (idempotently, after migration 0262 has guaranteed the constraint
-- exists) so production always ends up with the correct relational structure.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'p2_demand_plan_source_line_fk'
      AND conrelid = 'p2_demand_plans'::regclass
  ) THEN
    ALTER TABLE p2_demand_plans
      ADD CONSTRAINT p2_demand_plan_source_line_fk
      FOREIGN KEY (po_item_id, demand_line_identity)
      REFERENCES p2_purchase_order_items(id, demand_line_identity)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_production_demands_po_line_identity_fk'
      AND conrelid = 'project_production_demands'::regclass
  ) THEN
    ALTER TABLE project_production_demands
      ADD CONSTRAINT project_production_demands_po_line_identity_fk
      FOREIGN KEY (po_item_id, demand_line_identity)
      REFERENCES p2_purchase_order_items(id, demand_line_identity)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- project_production_demands_plan_project_fk references project_production_plan_items_identity_key,
-- a composite unique constraint created by migration 0264.  Drizzle places the FK before the
-- constraint in its diff ordering, so we drop it from dev and restore it here idempotently
-- after 0264 has guaranteed the unique constraint exists.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_production_demands_plan_project_fk'
      AND conrelid = 'project_production_demands'::regclass
  ) THEN
    ALTER TABLE project_production_demands
      ADD CONSTRAINT project_production_demands_plan_project_fk
      FOREIGN KEY (production_plan_item_id, production_plan_id, project_id)
      REFERENCES project_production_plan_items(id, production_plan_id, project_id)
      ON DELETE RESTRICT;
  END IF;
END $$;
