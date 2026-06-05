ALTER TABLE charge_codes
  ADD COLUMN IF NOT EXISTS production_line TEXT,
  ADD COLUMN IF NOT EXISTS activity_category TEXT,
  ADD COLUMN IF NOT EXISTS cost_objective_policy TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS inventory_wip_policy TEXT,
  ADD COLUMN IF NOT EXISTS allow_project BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_project BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_clin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_clin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE charge_code_employee_assignments
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS charge_code_employee_assignments_one_default_per_employee_idx
  ON charge_code_employee_assignments(employee_id)
  WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS project_clins (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  clin_number TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, clin_number)
);

CREATE INDEX IF NOT EXISTS project_clins_project_id_idx ON project_clins(project_id);
CREATE INDEX IF NOT EXISTS project_clins_active_idx ON project_clins(active);

ALTER TABLE punch_ledger
  ADD COLUMN IF NOT EXISTS clin_id INTEGER REFERENCES project_clins(id) ON DELETE SET NULL;

ALTER TABLE labor_allocations
  ADD COLUMN IF NOT EXISTS clin_id INTEGER REFERENCES project_clins(id) ON DELETE SET NULL;

ALTER TABLE labor_cost_records
  ADD COLUMN IF NOT EXISTS clin_id INTEGER REFERENCES project_clins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_objective_policy TEXT,
  ADD COLUMN IF NOT EXISTS cost_objective_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS production_line TEXT,
  ADD COLUMN IF NOT EXISTS activity_category TEXT;

CREATE INDEX IF NOT EXISTS punch_ledger_clin_id_idx ON punch_ledger(clin_id);
CREATE INDEX IF NOT EXISTS labor_allocations_clin_id_idx ON labor_allocations(clin_id);
CREATE INDEX IF NOT EXISTS labor_cost_records_clin_id_idx ON labor_cost_records(clin_id);
