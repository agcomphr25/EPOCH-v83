ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_revision_number INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_revision_label TEXT NOT NULL DEFAULT 'Rev 0';

CREATE TABLE IF NOT EXISTS project_revisions (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  revision_label TEXT NOT NULL,
  revision_type TEXT NOT NULL DEFAULT 'PROJECT_CHANGE',
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_po_id INTEGER REFERENCES p2_purchase_orders(id),
  new_po_id INTEGER REFERENCES p2_purchase_orders(id),
  created_by INTEGER REFERENCES employees(id),
  created_by_display_name TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT project_revisions_project_revision_unique UNIQUE (project_id, revision_number)
);

CREATE INDEX IF NOT EXISTS project_revisions_project_id_idx
  ON project_revisions(project_id);

CREATE INDEX IF NOT EXISTS project_revisions_created_at_idx
  ON project_revisions(created_at);
