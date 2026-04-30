ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMP;
