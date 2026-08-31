-- Allow completed or superseded teardown sessions to be hidden without
-- deleting their observations, photos, inventory matches, or BOM evidence.

ALTER TABLE product_teardowns
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS product_teardowns_active_updated_idx
  ON product_teardowns(is_active, updated_at DESC);
