-- Migration: Receiving Control Center (Phase 1)
-- Creates 5 new tables for aerospace-grade receiving traceability

DO $$ BEGIN

-- receipts: shipment-level header
CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_date TIMESTAMP NOT NULL DEFAULT NOW(),
  vendor_id INTEGER,
  vendor_name TEXT,
  vendor_po_id INTEGER,
  vendor_po_number TEXT,
  carrier TEXT,
  tracking_number TEXT,
  packing_slip_number TEXT,
  condition_on_arrival TEXT DEFAULT 'good',
  status TEXT NOT NULL DEFAULT 'in_progress',
  notes TEXT,
  receiver_user_id INTEGER,
  receiver_display_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- receipt_lines: one row per PO line received
CREATE TABLE IF NOT EXISTS receipt_lines (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  vendor_po_item_id INTEGER,
  ag_part_number TEXT,
  description TEXT,
  ordered_qty NUMERIC,
  received_qty NUMERIC NOT NULL DEFAULT 0,
  uom TEXT DEFAULT 'EA',
  is_partial BOOLEAN DEFAULT FALSE,
  is_over BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- received_units: individual traceable units split from a line
CREATE TABLE IF NOT EXISTS received_units (
  id SERIAL PRIMARY KEY,
  receipt_line_id INTEGER NOT NULL REFERENCES receipt_lines(id) ON DELETE CASCADE,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  unit_sequence INTEGER NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  unit_type TEXT DEFAULT 'other',
  quantity NUMERIC NOT NULL,
  uom TEXT DEFAULT 'EA',
  lot_number TEXT,
  batch_number TEXT,
  serial_number TEXT,
  internal_control_number TEXT,
  roll_number TEXT,
  heat_lot TEXT,
  manufacture_date DATE,
  expiration_date DATE,
  shelf_life_days INTEGER,
  cert_reference TEXT,
  disposition TEXT NOT NULL DEFAULT 'pending_inspection',
  disposition_notes TEXT,
  disposition_by_user_id INTEGER,
  disposition_by_display_name TEXT,
  disposition_at TIMESTAMP,
  location TEXT,
  freezer_number INTEGER,
  allocated_to_type TEXT,
  allocated_to_id INTEGER,
  material_lot_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS received_units_receipt_line_idx ON received_units(receipt_line_id);
CREATE INDEX IF NOT EXISTS received_units_receipt_idx ON received_units(receipt_id);
CREATE UNIQUE INDEX IF NOT EXISTS received_units_barcode_idx ON received_units(barcode);

-- receipt_documents: docs per receipt or per unit
CREATE TABLE IF NOT EXISTS receipt_documents (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  received_unit_id INTEGER REFERENCES received_units(id) ON DELETE SET NULL,
  media_id UUID REFERENCES media_library(id) ON DELETE CASCADE,
  doc_type TEXT DEFAULT 'other',
  filename TEXT,
  storage_path TEXT,
  mime_type TEXT,
  notes TEXT,
  uploaded_by_user_id INTEGER,
  uploaded_by_display_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- receipt_audit_log: full traceability chain
CREATE TABLE IF NOT EXISTS receipt_audit_log (
  id SERIAL PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_display_name TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS receipt_audit_log_receipt_idx ON receipt_audit_log(receipt_id);

END $$;
