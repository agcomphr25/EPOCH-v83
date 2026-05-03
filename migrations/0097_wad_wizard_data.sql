-- Add WAD wizard status and structured wizard data columns to production_work_orders
-- wad_status tracks where the WAD is in the approval workflow (DRAFT, PENDING_APPROVAL, APPROVED)
-- wizard_data stores all 12-step wizard fields as a structured JSONB object

ALTER TABLE production_work_orders
  ADD COLUMN IF NOT EXISTS wad_status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS wizard_data JSONB;
