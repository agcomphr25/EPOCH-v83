-- Task #165: Shelf-life & out-time enforcement with per-part config
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS shelf_life_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_shelf_life_days integer,
  ADD COLUMN IF NOT EXISTS room_temp_shelf_life_days integer,
  ADD COLUMN IF NOT EXISTS default_max_out_time_minutes integer,
  ADD COLUMN IF NOT EXISTS out_time_enforcement_required boolean NOT NULL DEFAULT false;

ALTER TABLE material_lots
  ADD COLUMN IF NOT EXISTS locked_reason text,
  ADD COLUMN IF NOT EXISTS locked_at timestamp;
