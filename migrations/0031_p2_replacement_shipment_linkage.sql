-- Migration: P2 Replacement Shipment Linkage (Phase 5C)
-- Adds three nullable columns to p2_packing_slips to support explicit linkage
-- between replacement shipments and the original packing slips they correct.
--
-- Correction chain:
--   original packing slip → RMA / credit memo → replacement packing slip → replacement invoice

ALTER TABLE p2_packing_slips
  ADD COLUMN IF NOT EXISTS replaces_packing_slip_id  uuid REFERENCES p2_packing_slips(id),
  ADD COLUMN IF NOT EXISTS replacement_reason        text,
  ADD COLUMN IF NOT EXISTS is_no_charge_replacement  boolean NOT NULL DEFAULT false;
