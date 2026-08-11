CREATE TABLE IF NOT EXISTS p1_customer_po_document_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  document_type text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size >= 0),
  file_sha256 text NOT NULL,
  storage_object_path text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  parsed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_summary jsonb,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  CONSTRAINT p1_customer_po_document_imports_document_type_check
    CHECK (document_type IN ('NEW_PO_PDF', 'CANCELLATION_CSV')),
  CONSTRAINT p1_customer_po_document_imports_status_check
    CHECK (status IN ('RECEIVED', 'APPLIED', 'PARTIALLY_APPLIED', 'NO_CHANGES', 'FAILED')),
  CONSTRAINT p1_customer_po_document_imports_file_sha256_unique UNIQUE (file_sha256)
);

CREATE INDEX IF NOT EXISTS p1_customer_po_document_imports_created_at_idx
  ON p1_customer_po_document_imports (created_at DESC);

CREATE INDEX IF NOT EXISTS p1_customer_po_document_imports_type_status_idx
  ON p1_customer_po_document_imports (document_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS p1_customer_po_document_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES p1_customer_po_document_imports(id) ON DELETE RESTRICT,
  row_number integer NOT NULL CHECK (row_number > 0),
  po_number text NOT NULL,
  supplier_product_number text NOT NULL,
  customer_product_number text,
  original_order_quantity integer NOT NULL CHECK (original_order_quantity >= 0),
  customer_received_quantity integer CHECK (customer_received_quantity >= 0),
  customer_remaining_quantity integer CHECK (customer_remaining_quantity >= 0),
  target_canceled_quantity integer CHECK (target_canceled_quantity >= 0),
  purchase_order_id integer REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  purchase_order_item_id integer REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  prior_canceled_quantity integer,
  applied_cancellation_quantity integer NOT NULL DEFAULT 0 CHECK (applied_cancellation_quantity >= 0),
  validation_status text NOT NULL,
  validation_message text,
  adjustment_id uuid REFERENCES purchase_order_item_quantity_adjustments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p1_customer_po_document_import_rows_import_row_unique UNIQUE (import_id, row_number)
);

CREATE INDEX IF NOT EXISTS p1_customer_po_document_import_rows_po_idx
  ON p1_customer_po_document_import_rows (po_number, supplier_product_number);

CREATE INDEX IF NOT EXISTS p1_customer_po_document_import_rows_item_idx
  ON p1_customer_po_document_import_rows (purchase_order_item_id);

ALTER TABLE p1_customer_po_document_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE p1_customer_po_document_import_rows ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE p1_customer_po_document_imports IS
  'Immutable source and audit ledger for customer P1 PO PDFs and cumulative cancellation CSV exports.';
COMMENT ON TABLE p1_customer_po_document_import_rows IS
  'Per-line validation and application evidence for a P1 customer PO document import.';
