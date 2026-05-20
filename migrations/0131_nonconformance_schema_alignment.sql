-- Align legacy nonconformance_records tables with the current NCR/RMA workflow.
-- Kept idempotent so older environments with existing rows can be upgraded safely.

ALTER TABLE nonconformance_records
  ADD COLUMN IF NOT EXISTS rma_number text,
  ADD COLUMN IF NOT EXISTS additional_order_ids text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS additional_serial_numbers text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS date_received date,
  ADD COLUMN IF NOT EXISTS p1_or_p2 text NOT NULL DEFAULT 'P1',
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS customer_id integer,
  ADD COLUMN IF NOT EXISTS disposition_action text,
  ADD COLUMN IF NOT EXISTS resolution_type text,
  ADD COLUMN IF NOT EXISTS new_order_id text,
  ADD COLUMN IF NOT EXISTS use_order_address boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS repair_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_status text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipped_date date,
  ADD COLUMN IF NOT EXISTS customer_notified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_by jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS last_confirmed_by_user_id integer,
  ADD COLUMN IF NOT EXISTS confirmation_note text,
  ADD COLUMN IF NOT EXISTS attention_risk text;
