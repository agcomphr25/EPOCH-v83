-- Migration: Procurement Compliance Effective Date + Legacy PO Segmentation
-- Adds the compliance effective date table and legacy exception flag columns

-- Table to store the procurement compliance effective date history
CREATE TABLE IF NOT EXISTS procurement_compliance_effective_dates (
  id SERIAL PRIMARY KEY,
  effective_date DATE NOT NULL,
  configured_by_user_id INTEGER,
  configured_by_display_name TEXT NOT NULL,
  configured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL
);

-- Seed the default value: June 1, 2026
INSERT INTO procurement_compliance_effective_dates
  (effective_date, configured_by_display_name, reason)
VALUES
  ('2026-06-01', 'System', 'Initial default — all POs issued before this date are classified as legacy pre-policy transactions and excluded from mandatory enforcement scoring.')
ON CONFLICT DO NOTHING;

-- Add legacy exception flag columns to vendor_po_compliance_reviews
ALTER TABLE vendor_po_compliance_reviews
  ADD COLUMN IF NOT EXISTS legacy_exception_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legacy_exception_reason TEXT;

-- Audit log entries for legacy exception flag changes will use the existing audit_events table
