ALTER TABLE received_units
  ADD COLUMN IF NOT EXISTS target_rd_project_id TEXT
  REFERENCES rd_projects(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS received_units_target_rd_project_idx
  ON received_units(target_rd_project_id);

ALTER TABLE received_units
  DROP CONSTRAINT IF EXISTS received_units_single_project_target_check;

ALTER TABLE received_units
  ADD CONSTRAINT received_units_single_project_target_check
  CHECK (target_project_id IS NULL OR target_rd_project_id IS NULL);
