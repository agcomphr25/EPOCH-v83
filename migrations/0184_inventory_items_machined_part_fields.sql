-- Migration 0184: Add machined-part fields to inventory_items
-- Adds machine_type (text) and machining_time_minutes (integer) — both nullable.
-- Uses IF NOT EXISTS so re-runs are safe.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS machine_type TEXT,
  ADD COLUMN IF NOT EXISTS machining_time_minutes INTEGER;
