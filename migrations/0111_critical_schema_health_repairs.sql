-- Idempotent repair migration for critical flows that must survive Replit DB
-- swaps and partially-applied migration histories.

DO $$
BEGIN
  CREATE TYPE inventory_ledger_transaction_type AS ENUM (
    'RECEIVE',
    'ISSUE',
    'RETURN',
    'TRANSFER',
    'MOVE',
    'RESERVE',
    'UNRESERVE',
    'CONSUME',
    'ADJUST',
    'SCRAP',
    'SPLIT',
    'MERGE',
    'COUNT_ADJUSTMENT',
    'STATUS_CHANGE',
    'QUARANTINE',
    'RELEASE',
    'EXPIRE',
    'REVERSAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS inventory_transaction_ledger_number_seq;

CREATE TABLE IF NOT EXISTS inventory_transaction_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text NOT NULL UNIQUE DEFAULT (
    'ITL-' ||
    to_char(now(), 'YYYYMMDD') ||
    '-' ||
    lpad(nextval('inventory_transaction_ledger_number_seq')::text, 8, '0')
  ),
  transaction_type inventory_ledger_transaction_type NOT NULL,
  inventory_item_id integer NOT NULL REFERENCES inventory_items(id),
  ag_part_number text NOT NULL REFERENCES inventory_items(ag_part_number),
  lot_id uuid REFERENCES material_lots(id),
  location_id text,
  quantity_delta numeric(14,4) NOT NULL,
  quantity_before numeric(14,4) NOT NULL,
  quantity_after numeric(14,4) NOT NULL,
  unit_of_measure text NOT NULL DEFAULT 'EA',
  status_before text,
  status_after text,
  performed_by_user_id integer REFERENCES users(id),
  performed_by_display_name text NOT NULL,
  approved_by_user_id integer REFERENCES users(id),
  approved_by_display_name text,
  approval_id uuid,
  project_id uuid REFERENCES projects(id),
  production_work_order_id uuid REFERENCES production_work_orders(id),
  traveler_id varchar(255) REFERENCES travelers(id),
  traveler_step_id varchar(255) REFERENCES traveler_steps(id),
  charge_code_id integer REFERENCES charge_codes(id),
  reason_code text,
  notes text,
  digital_signature_id uuid,
  source_module text NOT NULL,
  source_record_id text,
  event_hash text NOT NULL,
  reversed_transaction_id uuid REFERENCES inventory_transaction_ledger(id),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transaction_ledger_quantity_math_ck
    CHECK (quantity_after = quantity_before + quantity_delta),
  CONSTRAINT inventory_transaction_ledger_reversal_link_ck
    CHECK (
      (transaction_type = 'REVERSAL' AND reversed_transaction_id IS NOT NULL)
      OR
      (transaction_type <> 'REVERSAL')
    )
);

CREATE INDEX IF NOT EXISTS itl_transaction_type_idx ON inventory_transaction_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS itl_inventory_item_idx ON inventory_transaction_ledger(inventory_item_id);
CREATE INDEX IF NOT EXISTS itl_ag_part_number_idx ON inventory_transaction_ledger(ag_part_number);
CREATE INDEX IF NOT EXISTS itl_lot_idx ON inventory_transaction_ledger(lot_id);
CREATE INDEX IF NOT EXISTS itl_location_idx ON inventory_transaction_ledger(location_id);
CREATE INDEX IF NOT EXISTS itl_project_idx ON inventory_transaction_ledger(project_id);
CREATE INDEX IF NOT EXISTS itl_work_order_idx ON inventory_transaction_ledger(production_work_order_id);
CREATE INDEX IF NOT EXISTS itl_traveler_idx ON inventory_transaction_ledger(traveler_id);
CREATE INDEX IF NOT EXISTS itl_charge_code_idx ON inventory_transaction_ledger(charge_code_id);
CREATE INDEX IF NOT EXISTS itl_source_idx ON inventory_transaction_ledger(source_module, source_record_id);
CREATE INDEX IF NOT EXISTS itl_reversed_transaction_idx ON inventory_transaction_ledger(reversed_transaction_id);
CREATE INDEX IF NOT EXISTS itl_created_at_idx ON inventory_transaction_ledger(created_at);

CREATE OR REPLACE FUNCTION prevent_inventory_ledger_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory transaction ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_transaction_ledger_no_update'
  ) THEN
    CREATE TRIGGER inventory_transaction_ledger_no_update
    BEFORE UPDATE ON inventory_transaction_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_inventory_ledger_modification();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_transaction_ledger_no_delete'
  ) THEN
    CREATE TRIGGER inventory_transaction_ledger_no_delete
    BEFORE DELETE ON inventory_transaction_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_inventory_ledger_modification();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS far_flowdown_clauses (
  id serial PRIMARY KEY,
  clause_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  applicability_rule jsonb,
  default_applicable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_po_far_flowdowns (
  id serial PRIMARY KEY,
  vendor_po_id integer NOT NULL REFERENCES vendor_pos(id) ON DELETE CASCADE,
  clause_id integer NOT NULL REFERENCES far_flowdown_clauses(id),
  applicable boolean NOT NULL,
  reasoning text NOT NULL,
  recorded_by_user_id integer,
  recorded_by_display_name text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_po_id, clause_id)
);

CREATE TABLE IF NOT EXISTS vendor_debarment_checks (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id),
  context text NOT NULL,
  context_ref_id integer,
  source text NOT NULL,
  result text NOT NULL,
  checked_at timestamp NOT NULL DEFAULT NOW(),
  checked_by_user_id integer,
  checked_by_display_name text,
  evidence_url text,
  attestation_text text,
  notes text
);

CREATE TABLE IF NOT EXISTS procurement_settings (
  id serial PRIMARY KEY,
  debarment_check_freshness_days integer NOT NULL DEFAULT 30,
  allow_direct_po boolean NOT NULL DEFAULT false,
  direct_po_exception_capability text NOT NULL DEFAULT 'purchasing.direct_po_exception',
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_po_far_flowdowns_po_id ON vendor_po_far_flowdowns(vendor_po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_debarment_checks_vendor_id ON vendor_debarment_checks(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_debarment_checks_context ON vendor_debarment_checks(context, context_ref_id);
