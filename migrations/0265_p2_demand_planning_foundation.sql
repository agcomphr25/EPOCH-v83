-- P2 Demand Planning Foundation Phase 1.
-- Prospective-only controlled classifications and deterministic demand plans.

CREATE TABLE IF NOT EXISTS p2_part_planning_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  classification TEXT NOT NULL CHECK (classification IN (
    'MANUFACTURED','PURCHASED','RAW_MATERIAL','CUSTOMER_SUPPLIED'
  )),
  part_configuration_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RELEASED','SUPERSEDED')),
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  ownership_source TEXT NOT NULL,
  source_record_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  content_checksum TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_display_name TEXT,
  released_by_role TEXT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2_part_planning_classification_revision_unique
    UNIQUE (inventory_item_id,revision_number),
  CONSTRAINT p2_part_planning_classification_effectivity_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CONSTRAINT p2_part_planning_classification_release_evidence_check
    CHECK (status <> 'RELEASED' OR
      (released_by_display_name IS NOT NULL AND released_by_role IS NOT NULL AND released_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS p2_part_planning_classification_lookup_idx
  ON p2_part_planning_classifications(inventory_item_id,status,effective_from,effective_to);

CREATE UNIQUE INDEX IF NOT EXISTS p2_part_planning_classification_current_unique
  ON p2_part_planning_classifications(inventory_item_id)
  WHERE status='RELEASED' AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS p2_demand_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  po_item_id INTEGER NOT NULL REFERENCES p2_purchase_order_items(id) ON DELETE RESTRICT,
  demand_line_identity UUID NOT NULL,
  top_level_inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  top_level_part_number TEXT NOT NULL,
  input_quantity NUMERIC(18,6) NOT NULL CHECK (input_quantity > 0),
  unit_of_measure TEXT NOT NULL,
  required_by_date DATE,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN (
    'PLANNED','APPROVED','RELEASED','PARTIALLY_SUPPLIED','FULLY_SUPPLIED',
    'ON_HOLD','SUPERSEDED','CUSTOMER_DEMAND_CANCELED','CLOSED'
  )),
  explosion_version TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  result_checksum TEXT NOT NULL,
  source_evidence JSONB NOT NULL,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  planner_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  supersedes_plan_id UUID REFERENCES p2_demand_plans(id) ON DELETE RESTRICT,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  idempotency_key TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2_demand_plan_source_line_fk FOREIGN KEY (po_item_id,demand_line_identity)
    REFERENCES p2_purchase_order_items(id,demand_line_identity) ON DELETE RESTRICT,
  CONSTRAINT p2_demand_plan_revision_unique UNIQUE (project_id,demand_line_identity,revision_number),
  CONSTRAINT p2_demand_plan_idempotency_unique UNIQUE (project_id,demand_line_identity,idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS p2_demand_plan_current_unique
  ON p2_demand_plans(project_id,demand_line_identity)
  WHERE status NOT IN ('SUPERSEDED','CUSTOMER_DEMAND_CANCELED','CLOSED');

CREATE TABLE IF NOT EXISTS p2_demand_plan_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_plan_id UUID NOT NULL REFERENCES p2_demand_plans(id) ON DELETE RESTRICT,
  demand_identity TEXT NOT NULL,
  parent_line_id UUID REFERENCES p2_demand_plan_lines(id) ON DELETE RESTRICT,
  parent_demand_identity TEXT,
  bom_path TEXT[] NOT NULL,
  aggregation_provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  part_number TEXT NOT NULL,
  part_revision TEXT,
  classification TEXT NOT NULL CHECK (classification IN (
    'MANUFACTURED','PURCHASED','RAW_MATERIAL','CUSTOMER_SUPPLIED'
  )),
  classification_revision INTEGER NOT NULL,
  gross_requirement NUMERIC(18,6) NOT NULL CHECK (gross_requirement > 0),
  unit_of_measure TEXT NOT NULL,
  bom_id UUID REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  bom_revision TEXT,
  routing_id UUID REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_revision TEXT,
  first_operation_id INTEGER REFERENCES routing_operations(id) ON DELETE RESTRICT,
  first_department TEXT,
  work_center TEXT,
  required_by_date DATE,
  fulfillment_status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (fulfillment_status IN (
    'PLANNED','PARTIALLY_SUPPLIED','FULLY_SUPPLIED','ON_HOLD','CLOSED'
  )),
  source_revision_evidence JSONB NOT NULL,
  eligible_for_release BOOLEAN NOT NULL DEFAULT false,
  blocking_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2_demand_plan_line_identity_unique UNIQUE (demand_plan_id,demand_identity)
);

CREATE INDEX IF NOT EXISTS p2_demand_plan_lines_tree_idx
  ON p2_demand_plan_lines(demand_plan_id,parent_line_id);
CREATE INDEX IF NOT EXISTS p2_demand_plan_lines_part_idx
  ON p2_demand_plan_lines(demand_plan_id,part_number,classification);

CREATE TABLE IF NOT EXISTS p2_demand_fulfillment_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_plan_line_id UUID NOT NULL REFERENCES p2_demand_plan_lines(id) ON DELETE RESTRICT,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN (
    'INVENTORY','PRODUCTION_ORDER','PURCHASE_SUPPLY','CUSTOMER_SUPPLIED_RECEIPT','TRANSFER'
  )),
  fulfillment_record_type TEXT NOT NULL,
  fulfillment_record_id TEXT NOT NULL,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('PROPOSED','ACTIVE','CANCELED','REPLACED','FULFILLED')),
  source_evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2_demand_fulfillment_reference_unique
    UNIQUE (demand_plan_line_id,fulfillment_type,fulfillment_record_type,fulfillment_record_id)
);

CREATE OR REPLACE FUNCTION prevent_released_p2_planning_classification_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status='RELEASED' THEN
      RAISE EXCEPTION 'Released P2 planning classifications are immutable; create a revision';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status='RELEASED' AND NOT (
    NEW.status='SUPERSEDED' AND
    (to_jsonb(NEW)-ARRAY['status','updated_at','concurrency_version']) =
    (to_jsonb(OLD)-ARRAY['status','updated_at','concurrency_version'])
  ) THEN
    RAISE EXCEPTION 'Released P2 planning classifications are immutable; create a revision';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p2_planning_classification_released_immutable') THEN
    CREATE TRIGGER p2_planning_classification_released_immutable
    BEFORE UPDATE OR DELETE ON p2_part_planning_classifications
    FOR EACH ROW EXECUTE FUNCTION prevent_released_p2_planning_classification_mutation();
  END IF;
END $$;

INSERT INTO perm_capabilities (key,description,category) VALUES
 ('projects.p2_demand_planning.view','View controlled P2 demand-planning previews','projects'),
 ('projects.p2_part_classification.manage','Draft controlled P2 part planning classifications','engineering'),
 ('projects.p2_part_classification.release','Release controlled P2 part planning classifications','engineering')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id,capability_id)
SELECT role.id,capability.id FROM perm_roles role CROSS JOIN perm_capabilities capability
WHERE (role.name IN ('ADMIN','OWNER') AND capability.key IN (
        'projects.p2_demand_planning.view','projects.p2_part_classification.manage','projects.p2_part_classification.release'))
   OR (role.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER') AND capability.key IN (
        'projects.p2_demand_planning.view','projects.p2_part_classification.manage','projects.p2_part_classification.release'))
   OR (role.name IN ('PROJECT_MANAGER','MANAGER','OPERATIONS','QUALITY')
       AND capability.key='projects.p2_demand_planning.view')
ON CONFLICT (role_id,capability_id) DO NOTHING;
