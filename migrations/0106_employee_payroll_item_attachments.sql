-- Employee payroll control item attachments
-- Supports payroll receipts, signed acknowledgements, PDFs, and camera images.

CREATE TABLE IF NOT EXISTS timekeeping.employee_payroll_item_attachments (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES timekeeping.employee_payroll_items(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_attachments_item
  ON timekeeping.employee_payroll_item_attachments(item_id, uploaded_at DESC);
