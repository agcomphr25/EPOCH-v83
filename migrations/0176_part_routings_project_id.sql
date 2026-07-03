-- Link part routings to the project they apply to.
-- Existing routings intentionally remain NULL so users can assign the project later.

ALTER TABLE part_routings
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS part_routings_project_idx
  ON part_routings(project_id);
