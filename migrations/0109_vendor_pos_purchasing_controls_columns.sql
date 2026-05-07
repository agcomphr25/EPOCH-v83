-- Adds Task #83 Purchasing Controls columns to vendor_pos.
-- The Drizzle schema has declared these columns for some time, but the
-- production/dev DB never received the corresponding migration, causing
-- INSERTs into vendor_pos to fail with:
--   column "requisition_id" of relation "vendor_pos" does not exist
-- Idempotent: uses IF NOT EXISTS so it's safe to re-run.

ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS requisition_id integer,
  ADD COLUMN IF NOT EXISTS competition_method text,
  ADD COLUMN IF NOT EXISTS sole_source_justification text,
  ADD COLUMN IF NOT EXISTS direct_po_exception_approved_by_id integer,
  ADD COLUMN IF NOT EXISTS direct_po_exception_approved_by_name text,
  ADD COLUMN IF NOT EXISTS direct_po_exception_reason text,
  ADD COLUMN IF NOT EXISTS direct_po_exception_approved_at timestamp;
