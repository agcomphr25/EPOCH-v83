-- Remediation: add rd_project_id to design_control_* tables that may have
-- been created by a prior partial run of 0189 without this column.
-- ALTER TABLE IF EXISTS is a no-op when the table does not yet exist (fresh DB),
-- and ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
-- This must run BEFORE 0189 so the CREATE INDEX statements there can find the column.

ALTER TABLE IF EXISTS design_control_records
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_steps
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_requirements
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_risks
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_reviews
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_verification
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_validation
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_changes
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_release_gate
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS design_control_requirement_applicability
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL;
