-- Phase 8: controlled Receiving barcode identities and print evidence.
-- Additive and prospective only. No historical receipt, unit, lot, balance, or transaction is changed.

CREATE TABLE IF NOT EXISTS p2_receiving_barcode_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_unit_id INTEGER NOT NULL UNIQUE REFERENCES received_units(id) ON DELETE RESTRICT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE RESTRICT,
  receipt_line_id INTEGER NOT NULL REFERENCES receipt_lines(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  traceability_policy_id UUID NOT NULL REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  traceability_policy_type TEXT NOT NULL CHECK (traceability_policy_type IN ('SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED')),
  internal_identity TEXT NOT NULL UNIQUE,
  barcode_value TEXT NOT NULL UNIQUE,
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_by_employee_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p2_receiving_barcode_print_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES p2_receiving_barcode_identities(id) ON DELETE RESTRICT,
  received_unit_id INTEGER NOT NULL REFERENCES received_units(id) ON DELETE RESTRICT,
  barcode_value TEXT NOT NULL,
  label_format TEXT NOT NULL CHECK (label_format IN ('avery-5160','avery-5163','receiving-4x6')),
  printer_name TEXT NOT NULL,
  copies INTEGER NOT NULL CHECK (copies > 0 AND copies <= 100),
  reprint_reason TEXT,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identity_id,request_key),
  CHECK (reprint_reason IS NULL OR length(btrim(reprint_reason)) > 0)
);

CREATE OR REPLACE FUNCTION p2_receiving_barcode_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 Receiving barcode identity and print evidence are immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_receiving_barcode_identity_immutable ON p2_receiving_barcode_identities;
CREATE TRIGGER p2_receiving_barcode_identity_immutable BEFORE UPDATE OR DELETE ON p2_receiving_barcode_identities
  FOR EACH ROW EXECUTE FUNCTION p2_receiving_barcode_immutable();
DROP TRIGGER IF EXISTS p2_receiving_barcode_print_immutable ON p2_receiving_barcode_print_events;
CREATE TRIGGER p2_receiving_barcode_print_immutable BEFORE UPDATE OR DELETE ON p2_receiving_barcode_print_events
  FOR EACH ROW EXECUTE FUNCTION p2_receiving_barcode_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.receiving_barcodes.print','Provision and print controlled P2 Receiving barcode identities','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','INVENTORY_MANAGER') AND c.key='p2.receiving_barcodes.print'
ON CONFLICT DO NOTHING;
