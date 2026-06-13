ALTER TABLE p2_packing_slips
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

CREATE TABLE IF NOT EXISTS p2_invoice_number_configs (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p2_invoice_number_sequences (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, year)
);

CREATE INDEX IF NOT EXISTS p2_invoice_number_sequences_prefix_year_idx
  ON p2_invoice_number_sequences(prefix, year);

CREATE TABLE IF NOT EXISTS p2_invoice_number_audit (
  id SERIAL PRIMARY KEY,
  packing_slip_id UUID,
  invoice_id UUID,
  customer_id TEXT,
  old_packing_slip_number TEXT,
  new_packing_slip_number TEXT,
  old_invoice_number TEXT,
  new_invoice_number TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS p2_invoice_number_audit_packing_slip_idx
  ON p2_invoice_number_audit(packing_slip_id);

CREATE INDEX IF NOT EXISTS p2_invoice_number_audit_customer_idx
  ON p2_invoice_number_audit(customer_id);
