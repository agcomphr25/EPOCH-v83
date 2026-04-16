-- Project Closing + Lessons Learned module
-- Adds three tables for capturing formal project closing records, associated risks,
-- and follow-up actions.

CREATE TABLE IF NOT EXISTS project_closings (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  summary TEXT,
  what_went_wrong TEXT,
  strengths TEXT,
  opportunities TEXT,
  similarities_to_prior_projects TEXT,
  next_project_recommendations TEXT,
  closed_by INTEGER REFERENCES employees(id),
  closed_by_display_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_closings_project_id_idx ON project_closings(project_id);

CREATE TABLE IF NOT EXISTS project_closing_risks (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  closing_id INTEGER NOT NULL REFERENCES project_closings(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  department TEXT,
  owner TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_closing_risks_project_id_idx ON project_closing_risks(project_id);
CREATE INDEX IF NOT EXISTS project_closing_risks_closing_id_idx ON project_closing_risks(closing_id);

CREATE TABLE IF NOT EXISTS project_closing_actions (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  closing_id INTEGER NOT NULL REFERENCES project_closings(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  owner TEXT,
  department TEXT,
  due_date DATE,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_closing_actions_project_id_idx ON project_closing_actions(project_id);
CREATE INDEX IF NOT EXISTS project_closing_actions_closing_id_idx ON project_closing_actions(closing_id);
