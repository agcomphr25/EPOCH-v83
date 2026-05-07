-- Accounting control expense attachments
-- Stores receipts, PDFs, and camera images for employee and owner expense documentation.

CREATE TABLE IF NOT EXISTS accounting_expense_transaction_attachments (
  id SERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES accounting_expense_transactions(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acct_expense_attachments_transaction_idx
  ON accounting_expense_transaction_attachments(transaction_id, uploaded_at DESC);
