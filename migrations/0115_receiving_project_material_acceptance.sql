-- Link received material to P2 projects and require PM acceptance before it
-- becomes accepted project material cost.

ALTER TABLE received_units
  ADD COLUMN IF NOT EXISTS target_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE production_work_orders
  ADD COLUMN IF NOT EXISTS material_budget_amount NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS received_units_target_project_idx
  ON received_units(target_project_id);

CREATE TABLE IF NOT EXISTS project_received_materials (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  received_unit_id INTEGER NOT NULL REFERENCES received_units(id) ON DELETE CASCADE,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  material_lot_id UUID REFERENCES material_lots(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  extended_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_pm_acceptance',
  accepted_by_user_id INTEGER,
  accepted_by_display_name TEXT,
  accepted_at TIMESTAMP,
  rejected_by_user_id INTEGER,
  rejected_by_display_name TEXT,
  rejected_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT project_received_materials_received_unit_unique UNIQUE(received_unit_id),
  CONSTRAINT project_received_materials_status_check
    CHECK (status IN ('pending_pm_acceptance', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS project_received_materials_project_idx
  ON project_received_materials(project_id);

CREATE INDEX IF NOT EXISTS project_received_materials_receipt_idx
  ON project_received_materials(receipt_id);

CREATE INDEX IF NOT EXISTS project_received_materials_status_idx
  ON project_received_materials(status);
