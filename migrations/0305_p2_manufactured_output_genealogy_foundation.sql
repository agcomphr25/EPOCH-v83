-- Phase 10: controlled manufactured-output identity and immutable Genealogy.
-- Additive and prospective only. No historical output, traveler, inventory, or ledger row is changed.

CREATE TABLE IF NOT EXISTS p2_manufactured_output_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  frozen_demand_baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  frozen_demand_node_id UUID NOT NULL REFERENCES p2_frozen_production_demand_nodes(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  assembly_path_identity TEXT NOT NULL,
  part_number_snapshot TEXT NOT NULL,
  traceability_snapshot JSONB NOT NULL,
  output_identity TEXT NOT NULL,
  output_quantity NUMERIC(18,6) NOT NULL CHECK (output_quantity > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','RELEASED','VOID')),
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  created_by_user_id INTEGER NOT NULL,
  created_by_employee_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  released_by_user_id INTEGER,
  released_by_employee_id INTEGER,
  released_by_display_name TEXT,
  released_by_role TEXT,
  released_at TIMESTAMPTZ,
  UNIQUE(work_order_authority_id,output_identity),
  UNIQUE(request_key)
);

CREATE TABLE IF NOT EXISTS p2_material_genealogy_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_authority_id UUID NOT NULL REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  consumption_event_id UUID NOT NULL REFERENCES p2_material_consumption_events(id) ON DELETE RESTRICT,
  material_requirement_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_material_requirements(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  received_unit_id INTEGER NOT NULL REFERENCES received_units(id) ON DELETE RESTRICT,
  material_lot_id UUID NOT NULL REFERENCES material_lots(id) ON DELETE RESTRICT,
  consumed_quantity NUMERIC(18,6) NOT NULL CHECK (consumed_quantity > 0),
  assembly_path_identity TEXT NOT NULL,
  edge_snapshot JSONB NOT NULL,
  edge_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(output_authority_id,consumption_event_id)
);
CREATE INDEX IF NOT EXISTS p2_material_genealogy_output_idx ON p2_material_genealogy_edges(output_authority_id);

CREATE OR REPLACE FUNCTION p2_output_released_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status='RELEASED' THEN
    RAISE EXCEPTION 'Released P2 manufactured-output authority is immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_output_released_immutable ON p2_manufactured_output_authorities;
CREATE TRIGGER p2_output_released_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_output_authorities
  FOR EACH ROW EXECUTE FUNCTION p2_output_released_immutable();

CREATE OR REPLACE FUNCTION p2_genealogy_edge_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 material Genealogy edges are immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_genealogy_edge_immutable ON p2_material_genealogy_edges;
CREATE TRIGGER p2_genealogy_edge_immutable BEFORE UPDATE OR DELETE ON p2_material_genealogy_edges
  FOR EACH ROW EXECUTE FUNCTION p2_genealogy_edge_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.manufactured_output.record','Record controlled P2 manufactured output','projects'),
 ('p2.manufactured_output.release','Independently release P2 manufactured output and Genealogy','projects')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.manufactured_output.record','p2.manufactured_output.release')) OR
 (r.name IN ('SUPERVISOR','FLOOR_OPERATOR') AND c.key='p2.manufactured_output.record')
ON CONFLICT DO NOTHING;
