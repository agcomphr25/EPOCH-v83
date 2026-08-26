-- Phase 6: P2 manufacturing work-order queue foundation.
-- Additive and prospective only. No historical work order, traveler, or demand row is changed.

CREATE TABLE IF NOT EXISTS p2_manufacturing_work_order_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  frozen_demand_baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  frozen_demand_node_id UUID NOT NULL REFERENCES p2_frozen_production_demand_nodes(id) ON DELETE RESTRICT,
  production_work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE RESTRICT,
  parent_authority_id UUID REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  assembly_path_identity TEXT NOT NULL,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  part_number_snapshot TEXT NOT NULL,
  description_snapshot TEXT NOT NULL,
  part_revision_snapshot TEXT,
  required_quantity NUMERIC(18,6) NOT NULL CHECK (required_quantity > 0),
  completed_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0),
  accepted_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','READY','IN_PROGRESS','BLOCKED','HOLD','COMPLETE','CANCELLED')),
  current_operation_sequence INTEGER NOT NULL DEFAULT 1 CHECK (current_operation_sequence > 0),
  current_department_id INTEGER REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  current_department_name_snapshot TEXT NOT NULL,
  traveler_requirement TEXT NOT NULL CHECK (traveler_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  traveler_id VARCHAR(255) REFERENCES travelers(id) ON DELETE RESTRICT,
  routing_snapshot JSONB NOT NULL,
  wad_decision_snapshot JSONB NOT NULL,
  traceability_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  materialized_by_user_id INTEGER NOT NULL,
  materialized_by_employee_id INTEGER NOT NULL,
  materialized_by_display_name TEXT NOT NULL,
  materialized_by_role TEXT NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(frozen_demand_node_id),
  UNIQUE(production_work_order_id),
  UNIQUE(frozen_demand_baseline_id,assembly_path_identity),
  CHECK (completed_quantity <= required_quantity),
  CHECK (accepted_quantity <= completed_quantity)
);
CREATE INDEX IF NOT EXISTS p2_mwo_authority_queue_idx
  ON p2_manufacturing_work_order_authorities(current_department_id,status);
CREATE INDEX IF NOT EXISTS p2_mwo_authority_project_idx
  ON p2_manufacturing_work_order_authorities(project_id,frozen_demand_baseline_id);

CREATE TABLE IF NOT EXISTS p2_manufacturing_work_order_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  operation_sequence INTEGER NOT NULL CHECK (operation_sequence > 0),
  routing_operation_id INTEGER NOT NULL REFERENCES routing_operations(id) ON DELETE RESTRICT,
  department_id INTEGER NOT NULL REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  department_code_snapshot TEXT,
  department_name_snapshot TEXT NOT NULL,
  operation_name_snapshot TEXT NOT NULL,
  operation_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','READY','IN_PROGRESS','COMPLETE','BLOCKED','SKIPPED_APPROVED')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(authority_id,operation_sequence),
  UNIQUE(authority_id,routing_operation_id)
);

CREATE TABLE IF NOT EXISTS p2_manufacturing_work_order_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  predecessor_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  successor_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  dependency_type TEXT NOT NULL CHECK (dependency_type IN ('COMPLETE','ACCEPT')),
  required_quantity NUMERIC(18,6) NOT NULL CHECK (required_quantity > 0),
  satisfied_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (satisfied_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SATISFIED','CANCELLED')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  satisfied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (predecessor_authority_id <> successor_authority_id),
  CHECK (satisfied_quantity <= required_quantity),
  UNIQUE(predecessor_authority_id,successor_authority_id,dependency_type)
);
CREATE INDEX IF NOT EXISTS p2_mwo_dependency_successor_idx
  ON p2_manufacturing_work_order_dependencies(successor_authority_id,status);

CREATE TABLE IF NOT EXISTS p2_manufacturing_work_order_material_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  successor_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  frozen_demand_node_id UUID NOT NULL REFERENCES p2_frozen_production_demand_nodes(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  assembly_path_identity TEXT NOT NULL,
  part_number_snapshot TEXT NOT NULL,
  required_quantity NUMERIC(18,6) NOT NULL CHECK (required_quantity > 0),
  accepted_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  issued_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SATISFIED','CANCELLED')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (accepted_quantity <= required_quantity),
  CHECK (issued_quantity <= required_quantity),
  UNIQUE(successor_authority_id,frozen_demand_node_id)
);

CREATE TABLE IF NOT EXISTS p2_manufacturing_work_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  frozen_demand_baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  request_key TEXT,
  request_hash TEXT,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS p2_mwo_materialization_request_uidx
  ON p2_manufacturing_work_order_events(frozen_demand_baseline_id,event_type,request_key)
  WHERE event_type='WORK_ORDERS_MATERIALIZED' AND request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION p2_mwo_authority_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.frozen_demand_baseline_id IS DISTINCT FROM OLD.frozen_demand_baseline_id
    OR NEW.frozen_demand_node_id IS DISTINCT FROM OLD.frozen_demand_node_id
    OR NEW.production_work_order_id IS DISTINCT FROM OLD.production_work_order_id
    OR NEW.parent_authority_id IS DISTINCT FROM OLD.parent_authority_id
    OR NEW.assembly_path_identity IS DISTINCT FROM OLD.assembly_path_identity
    OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
    OR NEW.part_number_snapshot IS DISTINCT FROM OLD.part_number_snapshot
    OR NEW.description_snapshot IS DISTINCT FROM OLD.description_snapshot
    OR NEW.part_revision_snapshot IS DISTINCT FROM OLD.part_revision_snapshot
    OR NEW.required_quantity IS DISTINCT FROM OLD.required_quantity
    OR NEW.routing_snapshot IS DISTINCT FROM OLD.routing_snapshot
    OR NEW.wad_decision_snapshot IS DISTINCT FROM OLD.wad_decision_snapshot
    OR NEW.traceability_snapshot IS DISTINCT FROM OLD.traceability_snapshot
    OR NEW.authority_checksum IS DISTINCT FROM OLD.authority_checksum
  THEN RAISE EXCEPTION 'P2 manufacturing work-order authority snapshots are immutable'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_mwo_authority_identity_immutable ON p2_manufacturing_work_order_authorities;
CREATE TRIGGER p2_mwo_authority_identity_immutable BEFORE UPDATE ON p2_manufacturing_work_order_authorities
  FOR EACH ROW EXECUTE FUNCTION p2_mwo_authority_identity_immutable();

CREATE OR REPLACE FUNCTION p2_mwo_snapshot_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 manufacturing work-order authority snapshots are immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_mwo_operation_snapshot_immutable ON p2_manufacturing_work_order_operations;
CREATE TRIGGER p2_mwo_operation_snapshot_immutable BEFORE DELETE OR UPDATE OF authority_id,operation_sequence,routing_operation_id,department_id,department_code_snapshot,department_name_snapshot,operation_name_snapshot,operation_snapshot
  ON p2_manufacturing_work_order_operations FOR EACH ROW EXECUTE FUNCTION p2_mwo_snapshot_immutable();
DROP TRIGGER IF EXISTS p2_mwo_event_immutable ON p2_manufacturing_work_order_events;
CREATE TRIGGER p2_mwo_event_immutable BEFORE UPDATE OR DELETE ON p2_manufacturing_work_order_events
  FOR EACH ROW EXECUTE FUNCTION p2_mwo_snapshot_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.work_orders.view','View P2 manufacturing work-order queues','projects'),
 ('p2.work_orders.materialize','Materialize P2 work orders from released frozen demand','projects'),
 ('p2.work_orders.execute','Start P2 manufacturing work and travelers','projects'),
 ('p2.work_orders.complete_operation','Complete P2 routing operations','projects'),
 ('p2.work_orders.accept','Record controlled Quality acceptance of P2 manufactured output','projects')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.work_orders.view','p2.work_orders.materialize','p2.work_orders.execute','p2.work_orders.complete_operation','p2.work_orders.accept')) OR
 (r.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER','MANAGER','SUPERVISOR','FLOOR_OPERATOR') AND c.key='p2.work_orders.view') OR
 (r.name IN ('SUPERVISOR','FLOOR_OPERATOR') AND c.key IN ('p2.work_orders.execute','p2.work_orders.complete_operation'))
ON CONFLICT DO NOTHING;
