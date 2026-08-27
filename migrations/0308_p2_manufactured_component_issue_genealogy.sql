-- Phase 11: prospective manufactured-component issue and parent genealogy.
-- Additive only. No historical custody, output, demand, or ledger row is changed.

CREATE TABLE IF NOT EXISTS p2_manufactured_component_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_id UUID NOT NULL REFERENCES p2_manufactured_output_custodies(id) ON DELETE RESTRICT,
  child_output_authority_id UUID NOT NULL REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  parent_work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  parent_material_requirement_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_material_requirements(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  child_assembly_path_identity TEXT NOT NULL,
  parent_assembly_path_identity TEXT NOT NULL,
  output_identity TEXT NOT NULL,
  traceability_mode TEXT NOT NULL,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  unit_of_measure TEXT NOT NULL,
  issue_ledger_entry_id UUID NOT NULL UNIQUE REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','REVERSED')),
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  CHECK (traceability_mode <> 'SERIAL' OR quantity = 1)
);
CREATE INDEX IF NOT EXISTS p2_component_issue_parent_idx
  ON p2_manufactured_component_issues(parent_work_order_authority_id,status);

CREATE TABLE IF NOT EXISTS p2_manufactured_component_genealogy_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_component_issues(id) ON DELETE RESTRICT,
  child_output_authority_id UUID NOT NULL REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  parent_work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  parent_material_requirement_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_material_requirements(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  unit_of_measure TEXT NOT NULL,
  child_assembly_path_identity TEXT NOT NULL,
  parent_assembly_path_identity TEXT NOT NULL,
  edge_snapshot JSONB NOT NULL,
  edge_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p2_component_genealogy_child_idx
  ON p2_manufactured_component_genealogy_edges(child_output_authority_id);
CREATE INDEX IF NOT EXISTS p2_component_genealogy_parent_idx
  ON p2_manufactured_component_genealogy_edges(parent_work_order_authority_id);

CREATE TABLE IF NOT EXISTS p2_manufactured_component_issue_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_component_issues(id) ON DELETE RESTRICT,
  reversal_ledger_entry_id UUID NOT NULL UNIQUE REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  reason_code TEXT NOT NULL CHECK (length(btrim(reason_code)) > 0),
  reason_text TEXT NOT NULL CHECK (length(btrim(reason_text)) >= 10),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  reversal_snapshot JSONB NOT NULL,
  reversal_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION p2_component_issue_evidence_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manufactured-component issue evidence is immutable'; END IF;
  IF OLD.status='REVERSED' OR NEW.custody_id IS DISTINCT FROM OLD.custody_id
    OR NEW.child_output_authority_id IS DISTINCT FROM OLD.child_output_authority_id
    OR NEW.parent_work_order_authority_id IS DISTINCT FROM OLD.parent_work_order_authority_id
    OR NEW.parent_material_requirement_id IS DISTINCT FROM OLD.parent_material_requirement_id
    OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit_of_measure IS DISTINCT FROM OLD.unit_of_measure
    OR NEW.issue_ledger_entry_id IS DISTINCT FROM OLD.issue_ledger_entry_id
    OR NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.authority_snapshot IS DISTINCT FROM OLD.authority_snapshot
    OR NEW.authority_checksum IS DISTINCT FROM OLD.authority_checksum
  THEN RAISE EXCEPTION 'Manufactured-component issue authority is immutable'; END IF;
  IF OLD.status='ISSUED' AND NEW.status NOT IN ('ISSUED','REVERSED') THEN
    RAISE EXCEPTION 'Invalid manufactured-component issue transition';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_component_issue_immutable ON p2_manufactured_component_issues;
CREATE TRIGGER p2_component_issue_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_component_issues
  FOR EACH ROW EXECUTE FUNCTION p2_component_issue_evidence_immutable();

CREATE OR REPLACE FUNCTION p2_component_genealogy_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Manufactured-component genealogy is immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_component_genealogy_immutable ON p2_manufactured_component_genealogy_edges;
CREATE TRIGGER p2_component_genealogy_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_component_genealogy_edges
  FOR EACH ROW EXECUTE FUNCTION p2_component_genealogy_immutable();
DROP TRIGGER IF EXISTS p2_component_issue_reversal_immutable ON p2_manufactured_component_issue_reversals;
CREATE TRIGGER p2_component_issue_reversal_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_component_issue_reversals
  FOR EACH ROW EXECUTE FUNCTION p2_component_genealogy_immutable();

CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_p2_component_issue_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedComponentIssueKey'));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_p2_component_issue_reversal_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedComponentIssueReversalKey'));

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.manufactured_component.issue','Issue controlled manufactured output to an authorized parent work order','inventory'),
 ('p2.manufactured_component.issue_reverse','Reverse a manufactured-component issue with compensating evidence','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.manufactured_component.issue','p2.manufactured_component.issue_reverse')
ON CONFLICT DO NOTHING;
