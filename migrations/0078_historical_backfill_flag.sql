-- Migration: 0078_historical_backfill_flag.sql
-- Adds historical_backfill boolean column to vendor_po_compliance_reviews.
-- This flag distinguishes post-issuance compliance reviews done via the backfill
-- queue from standard pre-issue reviews.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendor_po_compliance_reviews'
      AND column_name = 'historical_backfill'
  ) THEN
    ALTER TABLE vendor_po_compliance_reviews
      ADD COLUMN historical_backfill BOOLEAN NOT NULL DEFAULT false;
  END IF;
END;
$$;
