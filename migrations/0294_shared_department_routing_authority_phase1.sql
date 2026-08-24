-- Phase 1 shared department and routing identity foundation.
-- Additive only: no existing rows are updated and every new relationship is nullable.
-- Historical inventory, routing, work-order, traveler, serialized-item, schedule,
-- and queue records therefore retain their captured values unchanged.

ALTER TABLE inventory_departments
  ADD COLUMN IF NOT EXISTS department_code TEXT,
  ADD COLUMN IF NOT EXISTS routing_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS production_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduling_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS inventory_departments_department_code_uidx
  ON inventory_departments (lower(department_code))
  WHERE department_code IS NOT NULL;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS default_department_id INTEGER
    REFERENCES inventory_departments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_items_default_department_id_idx
  ON inventory_items(default_department_id);

ALTER TABLE part_routings
  ADD COLUMN IF NOT EXISTS inventory_item_fk INTEGER
    REFERENCES inventory_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS part_revision_snapshot TEXT;

CREATE INDEX IF NOT EXISTS part_routings_inventory_item_fk_idx
  ON part_routings(inventory_item_fk);

ALTER TABLE routing_operations
  ADD COLUMN IF NOT EXISTS department_id INTEGER
    REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS department_name_snapshot TEXT;

CREATE INDEX IF NOT EXISTS routing_operations_department_id_idx
  ON routing_operations(department_id);

CREATE UNIQUE INDEX IF NOT EXISTS routing_operations_routing_step_uidx
  ON routing_operations(part_routing_id, step_number)
  WHERE department_id IS NOT NULL;
