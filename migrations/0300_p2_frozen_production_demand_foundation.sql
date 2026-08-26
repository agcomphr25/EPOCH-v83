-- Phase 5: immutable Frozen Production Demand foundation.
-- Additive and prospective only. No historical project or production row is modified.

CREATE TABLE IF NOT EXISTS p2_frozen_production_demand_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  project_configuration_id UUID NOT NULL REFERENCES p2_project_controlled_configurations(id) ON DELETE RESTRICT,
  wad_authorization_id UUID NOT NULL REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','RELEASED','SUPERSEDED','CANCELLED')),
  root_inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  project_quantity NUMERIC(18,6) NOT NULL CHECK (project_quantity > 0),
  project_snapshot JSONB NOT NULL,
  customer_snapshot JSONB NOT NULL,
  purchase_order_snapshot JSONB NOT NULL,
  configuration_checksum TEXT NOT NULL,
  wad_checksum TEXT NOT NULL,
  preview_checksum TEXT NOT NULL,
  baseline_checksum TEXT,
  blockers_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  created_by INTEGER NOT NULL,
  created_by_employee_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  validated_by INTEGER,
  validated_by_employee_id INTEGER,
  validated_by_display_name TEXT,
  validated_at TIMESTAMPTZ,
  released_by INTEGER,
  released_by_employee_id INTEGER,
  released_by_display_name TEXT,
  release_signature_meaning TEXT,
  released_at TIMESTAMPTZ,
  supersedes_baseline_id UUID REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  superseded_by_baseline_id UUID REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  supersession_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id,revision_number),
  CHECK (status <> 'RELEASED' OR (baseline_checksum IS NOT NULL AND released_by_employee_id IS NOT NULL AND released_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS p2_frozen_demand_project_idx ON p2_frozen_production_demand_baselines(project_id,revision_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS p2_frozen_demand_released_uidx ON p2_frozen_production_demand_baselines(project_id) WHERE status='RELEASED';

CREATE TABLE IF NOT EXISTS p2_frozen_production_demand_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  node_identity TEXT NOT NULL,
  parent_node_identity TEXT,
  assembly_path_identity TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  inventory_item_snapshot JSONB NOT NULL,
  item_classification TEXT NOT NULL,
  make_buy_disposition TEXT NOT NULL CHECK (make_buy_disposition IN ('MAKE','BUY')),
  required_gross_quantity NUMERIC(18,6) NOT NULL CHECK (required_gross_quantity > 0),
  unit_of_measure TEXT NOT NULL,
  quantity_per_parent NUMERIC(18,6) NOT NULL CHECK (quantity_per_parent > 0),
  scrap_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (scrap_percent >= 0 AND scrap_percent < 100),
  bom_id UUID REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  bom_line_id UUID REFERENCES bom_lines(id) ON DELETE RESTRICT,
  bom_snapshot JSONB NOT NULL,
  routing_id UUID REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_snapshot JSONB NOT NULL,
  traceability_policy_id UUID NOT NULL REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  traceability_policy_revision INTEGER NOT NULL,
  traceability_snapshot JSONB NOT NULL,
  wad_decision_id UUID REFERENCES p2_wad_traveler_decisions(id) ON DELETE RESTRICT,
  wad_decision_snapshot JSONB NOT NULL,
  inspection_requirements_snapshot JSONB NOT NULL,
  exception_evidence_snapshot JSONB NOT NULL,
  effectivity_snapshot JSONB NOT NULL,
  customer_configuration_snapshot JSONB NOT NULL,
  node_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(baseline_id,node_identity),
  UNIQUE(baseline_id,assembly_path_identity)
);
CREATE INDEX IF NOT EXISTS p2_frozen_demand_nodes_tree_idx ON p2_frozen_production_demand_nodes(baseline_id,depth,assembly_path_identity);

CREATE TABLE IF NOT EXISTS p2_frozen_production_demand_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION p2_frozen_demand_baseline_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Validated or closed frozen production demand is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='RELEASED' AND NOT (
    NEW.status='SUPERSEDED' AND length(btrim(COALESCE(NEW.supersession_reason,'')))>0 AND
    (to_jsonb(NEW)-ARRAY['status','superseded_by_baseline_id','supersession_reason','updated_at']) =
    (to_jsonb(OLD)-ARRAY['status','superseded_by_baseline_id','supersession_reason','updated_at'])
  ) THEN RAISE EXCEPTION 'Released frozen production demand is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='VALIDATED' AND NOT (
    NEW.status IN ('RELEASED','CANCELLED') AND
    (to_jsonb(NEW)-ARRAY['status','baseline_checksum','concurrency_version','released_by','released_by_employee_id','released_by_display_name','release_signature_meaning','released_at','updated_at']) =
    (to_jsonb(OLD)-ARRAY['status','baseline_checksum','concurrency_version','released_by','released_by_employee_id','released_by_display_name','release_signature_meaning','released_at','updated_at'])
  ) THEN RAISE EXCEPTION 'Validated frozen production demand content is immutable'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('SUPERSEDED','CANCELLED') THEN RAISE EXCEPTION 'Closed frozen production demand is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_frozen_demand_baseline_immutable ON p2_frozen_production_demand_baselines;
CREATE TRIGGER p2_frozen_demand_baseline_immutable BEFORE UPDATE OR DELETE ON p2_frozen_production_demand_baselines FOR EACH ROW EXECUTE FUNCTION p2_frozen_demand_baseline_immutable();

CREATE OR REPLACE FUNCTION p2_frozen_demand_node_immutable() RETURNS trigger AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM p2_frozen_production_demand_baselines WHERE id=COALESCE(NEW.baseline_id,OLD.baseline_id);
  IF parent_status IN ('VALIDATED','RELEASED','SUPERSEDED','CANCELLED') THEN RAISE EXCEPTION 'Validated or closed frozen production demand nodes are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_frozen_demand_node_immutable ON p2_frozen_production_demand_nodes;
CREATE TRIGGER p2_frozen_demand_node_immutable BEFORE INSERT OR UPDATE OR DELETE ON p2_frozen_production_demand_nodes FOR EACH ROW EXECUTE FUNCTION p2_frozen_demand_node_immutable();

CREATE OR REPLACE FUNCTION p2_frozen_demand_event_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Frozen demand audit events are immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_frozen_demand_event_immutable ON p2_frozen_production_demand_events;
CREATE TRIGGER p2_frozen_demand_event_immutable BEFORE UPDATE OR DELETE ON p2_frozen_production_demand_events FOR EACH ROW EXECUTE FUNCTION p2_frozen_demand_event_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('projects.frozen_production_demand.view','View frozen gross production demand','projects'),
 ('projects.frozen_production_demand.manage','Create and validate frozen gross production demand drafts','projects'),
 ('projects.frozen_production_demand.release','Independently release or supersede frozen gross production demand','projects')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN ('projects.frozen_production_demand.view','projects.frozen_production_demand.manage','projects.frozen_production_demand.release')) OR
 (r.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND c.key IN ('projects.frozen_production_demand.view','projects.frozen_production_demand.manage'))
ON CONFLICT DO NOTHING;
