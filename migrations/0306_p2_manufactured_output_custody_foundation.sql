-- Phase 10 correction: prospective manufactured-output receipt and custody.
-- No historical output is backfilled or reinterpreted.

CREATE TABLE IF NOT EXISTS p2_manufactured_output_custodies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_authority_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  output_identity TEXT NOT NULL UNIQUE,
  traceability_mode TEXT NOT NULL CHECK (traceability_mode IN ('SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED')),
  unit_of_measure TEXT NOT NULL,
  location_id TEXT NOT NULL,
  custody_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (custody_status IN ('AVAILABLE','PARTIALLY_ISSUED','ISSUED','REVERSED')),
  received_quantity NUMERIC(18,6) NOT NULL CHECK (received_quantity > 0),
  issued_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  reversed_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (reversed_quantity >= 0),
  available_quantity NUMERIC(18,6) GENERATED ALWAYS AS (received_quantity-issued_quantity-reversed_quantity) STORED,
  receipt_ledger_entry_id UUID NOT NULL UNIQUE REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  receipt_request_key TEXT NOT NULL UNIQUE,
  receipt_request_hash TEXT NOT NULL,
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_by_employee_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  CHECK (issued_quantity + reversed_quantity <= received_quantity),
  CHECK (traceability_mode <> 'SERIAL' OR received_quantity = 1)
);
CREATE INDEX IF NOT EXISTS p2_output_custody_item_available_idx
  ON p2_manufactured_output_custodies(inventory_item_id,custody_status,available_quantity);

CREATE TABLE IF NOT EXISTS p2_manufactured_output_custody_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_id UUID NOT NULL REFERENCES p2_manufactured_output_custodies(id) ON DELETE RESTRICT,
  receipt_ledger_entry_id UUID NOT NULL REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  reversal_ledger_entry_id UUID NOT NULL UNIQUE REFERENCES inventory_transaction_ledger(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  reason_code TEXT NOT NULL CHECK (length(btrim(reason_code)) > 0),
  reason_text TEXT NOT NULL CHECK (length(btrim(reason_text)) >= 10),
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION p2_output_custody_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.output_authority_id IS DISTINCT FROM OLD.output_authority_id
    OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
    OR NEW.output_identity IS DISTINCT FROM OLD.output_identity
    OR NEW.traceability_mode IS DISTINCT FROM OLD.traceability_mode
    OR NEW.unit_of_measure IS DISTINCT FROM OLD.unit_of_measure
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
    OR NEW.receipt_ledger_entry_id IS DISTINCT FROM OLD.receipt_ledger_entry_id
    OR NEW.receipt_request_key IS DISTINCT FROM OLD.receipt_request_key
    OR NEW.receipt_request_hash IS DISTINCT FROM OLD.receipt_request_hash
    OR NEW.authority_snapshot IS DISTINCT FROM OLD.authority_snapshot
    OR NEW.authority_checksum IS DISTINCT FROM OLD.authority_checksum
  THEN RAISE EXCEPTION 'Manufactured-output custody identity and receipt evidence are immutable'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_output_custody_identity_immutable ON p2_manufactured_output_custodies;
CREATE TRIGGER p2_output_custody_identity_immutable BEFORE UPDATE ON p2_manufactured_output_custodies
  FOR EACH ROW EXECUTE FUNCTION p2_output_custody_identity_immutable();

CREATE OR REPLACE FUNCTION p2_output_custody_evidence_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Manufactured-output custody reversal evidence is immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_output_custody_reversal_immutable ON p2_manufactured_output_custody_reversals;
CREATE TRIGGER p2_output_custody_reversal_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_output_custody_reversals
  FOR EACH ROW EXECUTE FUNCTION p2_output_custody_evidence_immutable();

CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_p2_output_receipt_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedOutputReceiptKey'))
  WHERE metadata->>'p2ManufacturedOutputReceiptKey' IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ledger_p2_output_reversal_uidx
  ON inventory_transaction_ledger ((metadata->>'p2ManufacturedOutputReversalKey'))
  WHERE metadata->>'p2ManufacturedOutputReversalKey' IS NOT NULL;

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.manufactured_output.custody_receive','Post controlled manufactured-output receipt custody','inventory'),
 ('p2.manufactured_output.custody_reverse','Reverse available manufactured-output custody with compensating evidence','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.manufactured_output.custody_receive','p2.manufactured_output.custody_reverse')
ON CONFLICT DO NOTHING;
