-- Phase 2 foundation for controlled recursive P2 production demand.
-- Additive only: no legacy backfill, no execution records, and no stage changes.

CREATE UNIQUE INDEX IF NOT EXISTS project_production_plan_items_identity_key
  ON project_production_plan_items(id,production_plan_id,project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='project_production_plan_items'::regclass
      AND conname='project_production_plan_items_identity_key'
  ) THEN
    ALTER TABLE project_production_plan_items
      ADD CONSTRAINT project_production_plan_items_identity_key
      UNIQUE USING INDEX project_production_plan_items_identity_key;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_production_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  production_release_id UUID NOT NULL REFERENCES project_production_releases(id) ON DELETE RESTRICT,
  production_launch_id UUID NOT NULL,
  production_plan_id UUID NOT NULL REFERENCES project_production_plans(id) ON DELETE RESTRICT,
  production_plan_item_id UUID NOT NULL REFERENCES project_production_plan_items(id) ON DELETE RESTRICT,
  po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  po_item_id INTEGER NOT NULL REFERENCES p2_purchase_order_items(id) ON DELETE RESTRICT,
  demand_line_identity UUID NOT NULL,
  demand_key TEXT NOT NULL,
  parent_demand_id UUID REFERENCES project_production_demands(id) ON DELETE RESTRICT,
  supersedes_demand_id UUID REFERENCES project_production_demands(id) ON DELETE RESTRICT,
  replacement_for_demand_id UUID REFERENCES project_production_demands(id) ON DELETE RESTRICT,
  assembly_path TEXT NOT NULL,
  path_depth INTEGER NOT NULL CHECK (path_depth >= 0),
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  part_number TEXT NOT NULL,
  part_revision TEXT,
  description TEXT,
  classification TEXT NOT NULL CHECK (classification IN (
    'PACKET','KIT','MACHINED_PART','CORE','SUB_ASSEMBLY','ASSEMBLY',
    'FINAL_ASSEMBLY','COMPOSITE','COMPONENT','MANUFACTURED_COMPONENT',
    'PURCHASED_COMPONENT','RAW_MATERIAL','OUTSIDE_PROCESS','PHANTOM',
    'STOCK_SATISFIED','BLOCKED_UNRESOLVED'
  )),
  disposition TEXT NOT NULL CHECK (disposition IN ('MAKE','BUY','OUTSIDE_PROCESS','PHANTOM','STOCK_SATISFIED','UNRESOLVED')),
  quantity_per_parent NUMERIC(18,6) NOT NULL CHECK (quantity_per_parent > 0),
  gross_required_quantity NUMERIC(18,6) NOT NULL CHECK (gross_required_quantity > 0),
  available_quantity_snapshot NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (available_quantity_snapshot >= 0),
  allocated_quantity_snapshot NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (allocated_quantity_snapshot >= 0),
  shortage_quantity NUMERIC(18,6) NOT NULL CHECK (shortage_quantity >= 0),
  original_customer_quantity NUMERIC(18,6) NOT NULL CHECK (original_customer_quantity >= 0),
  effective_customer_quantity NUMERIC(18,6) NOT NULL CHECK (effective_customer_quantity >= 0),
  customer_demand_event_digest TEXT NOT NULL CHECK (customer_demand_event_digest ~ '^[0-9a-f]{64}$'),
  customer_demand_snapshot JSONB NOT NULL,
  unit_of_measure TEXT,
  required_by_date DATE,
  bom_id UUID REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  bom_revision_snapshot TEXT,
  routing_id UUID REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_revision_snapshot TEXT,
  first_department_snapshot TEXT,
  wad_authorization_id UUID REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT,
  demand_status TEXT NOT NULL DEFAULT 'PLANNED'
    CHECK (demand_status IN ('PLANNED','STOCK_SATISFIED','BLOCKED','AUTHORIZED','IN_PROCESS','COMPLETE','CANCELLED','SUPERSEDED')),
  blocker_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  authority_snapshot JSONB NOT NULL,
  status_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_production_demands_launch_project_fk
    FOREIGN KEY (production_launch_id,project_id)
    REFERENCES project_production_launches(id,project_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT project_production_demands_plan_project_fk
    FOREIGN KEY (production_plan_item_id,production_plan_id,project_id)
    REFERENCES project_production_plan_items(id,production_plan_id,project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_demands_po_line_identity_fk
    FOREIGN KEY (po_item_id,demand_line_identity)
    REFERENCES p2_purchase_order_items(id,demand_line_identity)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_demands_release_project_fk
    FOREIGN KEY (production_release_id,project_id)
    REFERENCES project_production_releases(id,project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_demands_parent_project_fk
    FOREIGN KEY (parent_demand_id,project_id)
    REFERENCES project_production_demands(id,project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_demands_supersedes_project_fk
    FOREIGN KEY (supersedes_demand_id,project_id)
    REFERENCES project_production_demands(id,project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_demands_replacement_project_fk
    FOREIGN KEY (replacement_for_demand_id,project_id)
    REFERENCES project_production_demands(id,project_id)
    ON DELETE RESTRICT,
  CHECK (shortage_quantity <= gross_required_quantity),
  CHECK (parent_demand_id IS NULL OR parent_demand_id <> id),
  CHECK (supersedes_demand_id IS NULL OR supersedes_demand_id <> id),
  CHECK (replacement_for_demand_id IS NULL OR replacement_for_demand_id <> id),
  CONSTRAINT project_production_demands_id_project_unique UNIQUE (id,project_id),
  CONSTRAINT project_production_demands_launch_key_unique
    UNIQUE (production_launch_id,demand_key),
  CONSTRAINT project_production_demands_plan_identity_unique
    UNIQUE (production_launch_id,production_plan_item_id,po_item_id,assembly_path)
);

CREATE INDEX IF NOT EXISTS project_production_demands_project_status_idx
  ON project_production_demands(project_id,demand_status,assembly_path);
CREATE INDEX IF NOT EXISTS project_production_demands_parent_idx
  ON project_production_demands(parent_demand_id) WHERE parent_demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_production_demands_inventory_idx
  ON project_production_demands(inventory_item_id) WHERE inventory_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_production_demand_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  predecessor_demand_id UUID NOT NULL,
  successor_demand_id UUID NOT NULL,
  dependency_type TEXT NOT NULL
    CHECK (dependency_type IN ('COMPLETE','ACCEPT','ISSUE_OR_SCAN')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','SATISFIED','WAIVED','CANCELLED')),
  satisfied_at TIMESTAMP,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (predecessor_demand_id,project_id)
    REFERENCES project_production_demands(id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY (successor_demand_id,project_id)
    REFERENCES project_production_demands(id,project_id) ON DELETE RESTRICT,
  CHECK (predecessor_demand_id <> successor_demand_id),
  UNIQUE (predecessor_demand_id,successor_demand_id,dependency_type)
);

CREATE INDEX IF NOT EXISTS project_production_demand_dependencies_successor_idx
  ON project_production_demand_dependencies(successor_demand_id,status);

CREATE TABLE IF NOT EXISTS project_production_demand_execution_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  demand_id UUID NOT NULL,
  p2_production_order_id INTEGER REFERENCES p2_production_orders(id) ON DELETE RESTRICT,
  production_work_order_id UUID REFERENCES production_work_orders(id) ON DELETE RESTRICT,
  traveler_id VARCHAR(255) REFERENCES travelers(id) ON DELETE RESTRICT,
  cnc_job_id INTEGER REFERENCES cnc_jobs(id) ON DELETE RESTRICT,
  manufacturing_queue_id INTEGER REFERENCES manufacturing_queue(id) ON DELETE RESTRICT,
  cutting_demand_id UUID REFERENCES cutting_packet_schedule(id) ON DELETE RESTRICT,
  link_type TEXT NOT NULL
    CHECK (link_type IN ('P2_PRODUCTION_ORDER','WAD','TRAVELER','CNC_JOB','MANUFACTURING_QUEUE','CUTTING_DEMAND')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (demand_id,project_id)
    REFERENCES project_production_demands(id,project_id) ON DELETE RESTRICT,
  CHECK (num_nonnulls(p2_production_order_id,production_work_order_id,traveler_id,cnc_job_id,manufacturing_queue_id,cutting_demand_id) = 1),
  UNIQUE NULLS NOT DISTINCT
    (demand_id,link_type,p2_production_order_id,production_work_order_id,traveler_id,cnc_job_id,manufacturing_queue_id,cutting_demand_id)
);

CREATE INDEX IF NOT EXISTS project_production_demand_execution_links_demand_idx
  ON project_production_demand_execution_links(demand_id,link_type);

CREATE TABLE IF NOT EXISTS project_production_demand_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  demand_id UUID NOT NULL,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  material_lot_id UUID REFERENCES material_lots(id) ON DELETE RESTRICT,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('NETTING_SNAPSHOT','RESERVATION','ISSUE','REPLACEMENT')),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','CONSUMED','RELEASED','CANCELLED')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (demand_id,project_id)
    REFERENCES project_production_demands(id,project_id) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT
    (demand_id,allocation_type,inventory_item_id,material_lot_id)
);

CREATE INDEX IF NOT EXISTS project_production_demand_allocations_demand_idx
  ON project_production_demand_allocations(demand_id,status);

CREATE OR REPLACE FUNCTION protect_project_production_demand_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.production_release_id IS DISTINCT FROM OLD.production_release_id
     OR NEW.production_launch_id IS DISTINCT FROM OLD.production_launch_id
     OR NEW.production_plan_id IS DISTINCT FROM OLD.production_plan_id
     OR NEW.production_plan_item_id IS DISTINCT FROM OLD.production_plan_item_id
     OR NEW.po_id IS DISTINCT FROM OLD.po_id
     OR NEW.po_item_id IS DISTINCT FROM OLD.po_item_id
     OR NEW.demand_line_identity IS DISTINCT FROM OLD.demand_line_identity
     OR NEW.demand_key IS DISTINCT FROM OLD.demand_key
     OR NEW.parent_demand_id IS DISTINCT FROM OLD.parent_demand_id
     OR NEW.assembly_path IS DISTINCT FROM OLD.assembly_path
     OR NEW.part_number IS DISTINCT FROM OLD.part_number
     OR NEW.disposition IS DISTINCT FROM OLD.disposition
     OR NEW.gross_required_quantity IS DISTINCT FROM OLD.gross_required_quantity
     OR NEW.original_customer_quantity IS DISTINCT FROM OLD.original_customer_quantity
     OR NEW.effective_customer_quantity IS DISTINCT FROM OLD.effective_customer_quantity
     OR NEW.customer_demand_event_digest IS DISTINCT FROM OLD.customer_demand_event_digest
     OR NEW.customer_demand_snapshot IS DISTINCT FROM OLD.customer_demand_snapshot
     OR NEW.bom_revision_id IS DISTINCT FROM OLD.bom_revision_id
     OR NEW.routing_id IS DISTINCT FROM OLD.routing_id
     OR NEW.routing_revision_snapshot IS DISTINCT FROM OLD.routing_revision_snapshot
     OR NEW.authority_snapshot IS DISTINCT FROM OLD.authority_snapshot
  THEN
    RAISE EXCEPTION 'Production demand authority snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_project_production_demand_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.demand_status IS NOT DISTINCT FROM OLD.demand_status THEN RETURN NEW; END IF;
  IF OLD.demand_status IN ('COMPLETE','CANCELLED','SUPERSEDED')
     OR (OLD.demand_status='BLOCKED' AND NEW.demand_status NOT IN ('CANCELLED','SUPERSEDED'))
     OR (OLD.demand_status='PLANNED' AND NEW.demand_status NOT IN ('AUTHORIZED','CANCELLED','SUPERSEDED'))
     OR (OLD.demand_status='STOCK_SATISFIED' AND NEW.demand_status NOT IN ('COMPLETE','CANCELLED','SUPERSEDED'))
     OR (OLD.demand_status='AUTHORIZED' AND NEW.demand_status NOT IN ('IN_PROCESS','CANCELLED','SUPERSEDED'))
     OR (OLD.demand_status='IN_PROCESS' AND NEW.demand_status NOT IN ('COMPLETE','CANCELLED'))
  THEN RAISE EXCEPTION 'Invalid production demand status transition: % to %',OLD.demand_status,NEW.demand_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_project_production_demand_authority_trigger
  ON project_production_demands;
CREATE TRIGGER protect_project_production_demand_authority_trigger
BEFORE UPDATE ON project_production_demands
FOR EACH ROW EXECUTE FUNCTION protect_project_production_demand_authority();

DROP TRIGGER IF EXISTS enforce_project_production_demand_status_transition_trigger
  ON project_production_demands;
CREATE TRIGGER enforce_project_production_demand_status_transition_trigger
BEFORE UPDATE OF demand_status ON project_production_demands
FOR EACH ROW EXECUTE FUNCTION enforce_project_production_demand_status_transition();
