-- Phase 9: controlled P2 material scan, consumption, and reversal evidence.
-- Additive and prospective only. No historical inventory, traveler, or work-order row is changed.

CREATE TABLE IF NOT EXISTS p2_material_consumption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('CONSUMED','REVERSED')),
  original_event_id UUID REFERENCES p2_material_consumption_events(id) ON DELETE RESTRICT,
  work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  traveler_provisioning_authority_id UUID NOT NULL REFERENCES p2_traveler_provisioning_authorities(id) ON DELETE RESTRICT,
  traveler_id VARCHAR(255) NOT NULL REFERENCES travelers(id) ON DELETE RESTRICT,
  traveler_step_id VARCHAR(255) NOT NULL REFERENCES traveler_steps(id) ON DELETE RESTRICT,
  work_order_operation_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_operations(id) ON DELETE RESTRICT,
  material_requirement_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_material_requirements(id) ON DELETE RESTRICT,
  frozen_demand_node_id UUID NOT NULL REFERENCES p2_frozen_production_demand_nodes(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  assembly_path_identity TEXT NOT NULL,
  material_lot_id UUID NOT NULL REFERENCES material_lots(id) ON DELETE RESTRICT,
  received_unit_id INTEGER REFERENCES received_units(id) ON DELETE RESTRICT,
  receiving_barcode_identity_id UUID REFERENCES p2_receiving_barcode_identities(id) ON DELETE RESTRICT,
  traceability_policy_id UUID NOT NULL REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  inventory_ledger_entry_id UUID NOT NULL REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  unit_of_measure TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  reason_code TEXT,
  reason_text TEXT,
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((event_type='CONSUMED' AND original_event_id IS NULL)
      OR (event_type='REVERSED' AND original_event_id IS NOT NULL)),
  CHECK (event_type <> 'REVERSED' OR (length(btrim(COALESCE(reason_code,''))) > 0 AND length(btrim(COALESCE(reason_text,''))) > 0)),
  UNIQUE(request_key),
  UNIQUE(inventory_ledger_entry_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS p2_material_consumption_single_reversal_uidx
  ON p2_material_consumption_events(original_event_id) WHERE event_type='REVERSED';
CREATE INDEX IF NOT EXISTS p2_material_consumption_traveler_idx
  ON p2_material_consumption_events(traveler_id, traveler_step_id, created_at);
CREATE INDEX IF NOT EXISTS p2_material_consumption_requirement_idx
  ON p2_material_consumption_events(material_requirement_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_p2_material_consumption_request_uidx
  ON inventory_transaction_ledger ((metadata->>'p2MaterialConsumptionRequestKey'))
  WHERE metadata->>'p2MaterialConsumptionRequestKey' IS NOT NULL;

CREATE OR REPLACE FUNCTION p2_material_consumption_event_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 material consumption evidence is immutable'; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION p2_material_consumption_reversal_valid() RETURNS trigger AS $$
DECLARE original p2_material_consumption_events%ROWTYPE;
BEGIN
  IF NEW.event_type <> 'REVERSED' THEN RETURN NEW; END IF;
  SELECT * INTO original FROM p2_material_consumption_events WHERE id=NEW.original_event_id AND event_type='CONSUMED';
  IF NOT FOUND THEN RAISE EXCEPTION 'P2 material reversal requires an original consumed event'; END IF;
  IF NEW.work_order_authority_id IS DISTINCT FROM original.work_order_authority_id
    OR NEW.traveler_provisioning_authority_id IS DISTINCT FROM original.traveler_provisioning_authority_id
    OR NEW.traveler_id IS DISTINCT FROM original.traveler_id
    OR NEW.traveler_step_id IS DISTINCT FROM original.traveler_step_id
    OR NEW.work_order_operation_id IS DISTINCT FROM original.work_order_operation_id
    OR NEW.material_requirement_id IS DISTINCT FROM original.material_requirement_id
    OR NEW.frozen_demand_node_id IS DISTINCT FROM original.frozen_demand_node_id
    OR NEW.inventory_item_id IS DISTINCT FROM original.inventory_item_id
    OR NEW.assembly_path_identity IS DISTINCT FROM original.assembly_path_identity
    OR NEW.material_lot_id IS DISTINCT FROM original.material_lot_id
    OR NEW.received_unit_id IS DISTINCT FROM original.received_unit_id
    OR NEW.receiving_barcode_identity_id IS DISTINCT FROM original.receiving_barcode_identity_id
    OR NEW.traceability_policy_id IS DISTINCT FROM original.traceability_policy_id
    OR NEW.quantity IS DISTINCT FROM original.quantity
    OR NEW.unit_of_measure IS DISTINCT FROM original.unit_of_measure
  THEN RAISE EXCEPTION 'P2 material reversal authority must match the original consumption'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_material_consumption_reversal_valid ON p2_material_consumption_events;
CREATE TRIGGER p2_material_consumption_reversal_valid BEFORE INSERT ON p2_material_consumption_events
  FOR EACH ROW EXECUTE FUNCTION p2_material_consumption_reversal_valid();
DROP TRIGGER IF EXISTS p2_material_consumption_event_immutable ON p2_material_consumption_events;
CREATE TRIGGER p2_material_consumption_event_immutable BEFORE UPDATE OR DELETE ON p2_material_consumption_events
  FOR EACH ROW EXECUTE FUNCTION p2_material_consumption_event_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.material_consumption.record','Record controlled P2 material scans and consumption','inventory'),
 ('p2.material_consumption.reverse','Reverse controlled P2 material consumption with audit evidence','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.material_consumption.record','p2.material_consumption.reverse')) OR
 (r.name IN ('SUPERVISOR','FLOOR_OPERATOR') AND c.key='p2.material_consumption.record')
ON CONFLICT DO NOTHING;
