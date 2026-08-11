ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS processing_method text,
  ADD COLUMN IF NOT EXISTS payment_source text,
  ADD COLUMN IF NOT EXISTS external_processor text,
  ADD COLUMN IF NOT EXISTS external_refund_reference text,
  ADD COLUMN IF NOT EXISTS external_refund_date timestamp,
  ADD COLUMN IF NOT EXISTS refund_payment_id integer REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS credit_memo_id integer REFERENCES credit_memos(id);

CREATE INDEX IF NOT EXISTS refund_requests_refund_payment_id_idx
  ON refund_requests(refund_payment_id);

CREATE INDEX IF NOT EXISTS refund_requests_credit_memo_id_idx
  ON refund_requests(credit_memo_id);
