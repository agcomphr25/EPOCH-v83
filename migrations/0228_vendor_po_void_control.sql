ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS voided_by TEXT,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS vendor_pos_voided_at_idx
  ON vendor_pos(voided_at)
  WHERE voided_at IS NOT NULL;
