-- Migration: 0076_vendor_po_compliance_reviews.sql
-- Creates the vendor_po_compliance_reviews table for the pre-issue compliance gate.
-- One row per vendor PO (upsert pattern, enforced by UNIQUE constraint on vendor_po_id).

CREATE TABLE IF NOT EXISTS vendor_po_compliance_reviews (
  id SERIAL PRIMARY KEY,
  vendor_po_id INTEGER NOT NULL REFERENCES vendor_pos(id) ON DELETE CASCADE UNIQUE,
  government_contract BOOLEAN NOT NULL DEFAULT false,
  far_required BOOLEAN NOT NULL DEFAULT false,
  dpas_required BOOLEAN NOT NULL DEFAULT false,
  coc_required BOOLEAN NOT NULL DEFAULT false,
  mtr_required BOOLEAN NOT NULL DEFAULT false,
  source_inspection_required BOOLEAN NOT NULL DEFAULT false,
  second_party_complete BOOLEAN NOT NULL DEFAULT false,
  vendor_approved BOOLEAN NOT NULL DEFAULT false,
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id INTEGER,
  reviewed_by_display_name TEXT,
  reviewed_at TIMESTAMP,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_po_compliance_reviews_vendor_po_id_idx
  ON vendor_po_compliance_reviews (vendor_po_id);

CREATE INDEX IF NOT EXISTS vendor_po_compliance_reviews_review_status_idx
  ON vendor_po_compliance_reviews (review_status);

-- Enforce review_status values at DB level (idempotent ADD CONSTRAINT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vendor_po_compliance_reviews'::regclass
      AND conname = 'vendor_po_compliance_reviews_review_status_check'
  ) THEN
    ALTER TABLE vendor_po_compliance_reviews
      ADD CONSTRAINT vendor_po_compliance_reviews_review_status_check
      CHECK (review_status IN ('pending', 'reviewed', 'blocked'));
  END IF;
END;
$$;
