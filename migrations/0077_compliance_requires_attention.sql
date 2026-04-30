-- Migration: 0077_compliance_requires_attention.sql
-- Adds 'requires_attention' as a valid review_status value for vendor_po_compliance_reviews.
-- The existing check constraint only allows 'pending', 'reviewed', 'blocked'.
-- We drop and recreate it to include the new status.

DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vendor_po_compliance_reviews'::regclass
      AND conname = 'vendor_po_compliance_reviews_review_status_check'
  ) THEN
    ALTER TABLE vendor_po_compliance_reviews
      DROP CONSTRAINT vendor_po_compliance_reviews_review_status_check;
  END IF;

  -- Add the updated constraint with 'requires_attention' included
  ALTER TABLE vendor_po_compliance_reviews
    ADD CONSTRAINT vendor_po_compliance_reviews_review_status_check
    CHECK (review_status IN ('pending', 'reviewed', 'blocked', 'requires_attention'));
END;
$$;
