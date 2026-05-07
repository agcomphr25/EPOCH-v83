ALTER TABLE parts_requests
  ADD COLUMN IF NOT EXISTS production_line TEXT,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS parts_requests_project_id_idx
  ON parts_requests(project_id);

CREATE INDEX IF NOT EXISTS parts_requests_production_line_idx
  ON parts_requests(production_line);
