-- Extend product teardown items from part-only records into rapid, structured
-- observations. Existing rows remain BOM candidates and are classified later.
-- This migration is schema-only and is safe to replay on an empty baseline.

ALTER TABLE product_teardown_items
  ADD COLUMN IF NOT EXISTS observation_kind TEXT NOT NULL DEFAULT 'part',
  ADD COLUMN IF NOT EXISTS characteristic_name TEXT,
  ADD COLUMN IF NOT EXISTS characteristic_value TEXT,
  ADD COLUMN IF NOT EXISTS characteristic_unit TEXT,
  ADD COLUMN IF NOT EXISTS quantity_basis TEXT,
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS include_in_bom_comparison BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_teardown_items_observation_kind_check'
  ) THEN
    ALTER TABLE product_teardown_items
      ADD CONSTRAINT product_teardown_items_observation_kind_check
      CHECK (observation_kind IN ('part', 'characteristic'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_teardown_items_classification_check'
  ) THEN
    ALTER TABLE product_teardown_items
      ADD CONSTRAINT product_teardown_items_classification_check
      CHECK (classification IN ('unclassified', 'manufactured', 'purchased', 'feature'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_teardown_items_sorting_idx
  ON product_teardown_items(teardown_id, physical_location, classification);
