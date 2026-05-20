-- Section 2 quoting contracts: immutable sent-quote snapshots and PO reconciliation.

CREATE TABLE IF NOT EXISTS quote_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  quote_number TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  revision_label TEXT NOT NULL,
  status_at_snapshot TEXT NOT NULL DEFAULT 'SENT',
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customers_integer_id INTEGER,
  description TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  valid_until TIMESTAMP,
  quoted_by TEXT,
  notes TEXT,
  bom_assumptions JSONB,
  labor_assumptions JSONB,
  lead_times JSONB,
  exclusions JSONB,
  cert_requirements JSONB,
  source_data JSONB,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_snapshots_quote_revision_unique UNIQUE (quote_id, revision_number)
);

CREATE INDEX IF NOT EXISTS quote_snapshots_quote_id_idx
  ON quote_snapshots (quote_id);

CREATE TABLE IF NOT EXISTS quote_line_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_snapshot_id UUID NOT NULL REFERENCES quote_snapshots(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  quote_line_item_id UUID REFERENCES quote_line_items(id) ON DELETE SET NULL,
  line_number INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  inventory_item_id INTEGER,
  ag_part_number TEXT,
  line_revision TEXT,
  labor_hours REAL,
  department TEXT,
  bom_assumptions JSONB,
  labor_assumptions JSONB,
  lead_time_days INTEGER,
  cert_requirements JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_line_snapshots_snapshot_id_idx
  ON quote_line_snapshots (quote_snapshot_id);

CREATE INDEX IF NOT EXISTS quote_line_snapshots_quote_id_idx
  ON quote_line_snapshots (quote_id);

CREATE TABLE IF NOT EXISTS quote_po_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  quote_snapshot_id UUID REFERENCES quote_snapshots(id) ON DELETE RESTRICT,
  p2_purchase_order_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'MATCH',
  revision_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  pricing_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  clause_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  quantity_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  mismatch_summary JSONB,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_po_reconciliations_po_id_idx
  ON quote_po_reconciliations (p2_purchase_order_id);

CREATE INDEX IF NOT EXISTS quote_po_reconciliations_quote_id_idx
  ON quote_po_reconciliations (quote_id);
