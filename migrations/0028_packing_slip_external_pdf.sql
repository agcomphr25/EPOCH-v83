-- Task #220: Per-packing-slip external PDF attachment
-- Add external_pdf_url column to p2_packing_slips table

ALTER TABLE p2_packing_slips
  ADD COLUMN IF NOT EXISTS external_pdf_url text;
