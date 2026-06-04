-- Add completed_at to travelers table so PM Dashboard can compute
-- effective_completed_at without falling back to legacy project totals.

ALTER TABLE travelers
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_travelers_completed_at
  ON travelers(completed_at)
  WHERE completed_at IS NOT NULL;
