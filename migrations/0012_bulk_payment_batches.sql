-- Add bulk_payment_batches table and batchId column on payments
-- This enables grouping bulk payment submissions for reconciliation and audit.

CREATE TABLE IF NOT EXISTS bulk_payment_batches (
  id serial PRIMARY KEY,
  created_at timestamp DEFAULT now(),
  created_by text NOT NULL,
  customer_id text NOT NULL,
  total_amount real NOT NULL,
  payment_method text NOT NULL,
  notes text
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS batch_id integer REFERENCES bulk_payment_batches(id);
