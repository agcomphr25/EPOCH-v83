ALTER TABLE vendor_po_compliance_reviews ADD COLUMN IF NOT EXISTS legacy_exception_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vendor_po_compliance_reviews ADD COLUMN IF NOT EXISTS legacy_exception_reason TEXT;
