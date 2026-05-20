ALTER TABLE vendor_po_items
  ADD COLUMN IF NOT EXISTS purchase_qty REAL,
  ADD COLUMN IF NOT EXISTS purchase_unit_price REAL,
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
  ADD COLUMN IF NOT EXISTS vendor_unit TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor REAL,
  ADD COLUMN IF NOT EXISTS customer_po_id INTEGER,
  ADD COLUMN IF NOT EXISTS other_identifier TEXT,
  ADD COLUMN IF NOT EXISTS historical_avg_price REAL,
  ADD COLUMN IF NOT EXISTS price_variance_percent REAL,
  ADD COLUMN IF NOT EXISTS variance_flag BOOLEAN DEFAULT FALSE;
