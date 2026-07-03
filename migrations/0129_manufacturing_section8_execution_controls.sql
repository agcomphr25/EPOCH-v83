-- Section 8: Manufacturing Execution controls
-- Adds operation scan/signoff evidence and canonical labor context to P2 shop-floor tasks.

ALTER TABLE p2_work_tasks
  ADD COLUMN IF NOT EXISTS traveler_id varchar(255) REFERENCES travelers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS traveler_step_id varchar(255) REFERENCES traveler_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charge_code_id integer REFERENCES charge_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operation_name text,
  ADD COLUMN IF NOT EXISTS operation_scan_value text,
  ADD COLUMN IF NOT EXISTS operation_scanned_at timestamp,
  ADD COLUMN IF NOT EXISTS operation_scanned_by integer REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS electronic_signoff_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS electronic_signoff_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS electronic_signoff_at timestamp,
  ADD COLUMN IF NOT EXISTS electronic_signoff_by integer REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS p2_work_tasks_traveler_id_idx ON p2_work_tasks(traveler_id);
CREATE INDEX IF NOT EXISTS p2_work_tasks_traveler_step_id_idx ON p2_work_tasks(traveler_step_id);
CREATE INDEX IF NOT EXISTS p2_work_tasks_wad_id_idx ON p2_work_tasks(production_work_order_id);
CREATE INDEX IF NOT EXISTS p2_work_tasks_project_id_idx ON p2_work_tasks(project_id);
