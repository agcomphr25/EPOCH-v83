-- Safe repair for production databases where inventory_items predates the
-- lot/shelf-life/out-time control fields now selected by PO item queries.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS lot_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS serial_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shelf_life_controlled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER,
  ADD COLUMN IF NOT EXISTS default_max_out_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS out_time_enforcement_required BOOLEAN NOT NULL DEFAULT FALSE;
