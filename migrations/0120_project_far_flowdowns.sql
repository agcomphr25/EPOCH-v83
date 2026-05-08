-- Project-level FAR/DFARS flowdown continuity from purchase review checklist.
-- Idempotent: safe on environments where the table or indexes already exist.

CREATE TABLE IF NOT EXISTS project_far_flowdowns (
  id serial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_review_checklist_id integer REFERENCES purchase_review_checklists(id) ON DELETE SET NULL,
  clause_id integer NOT NULL REFERENCES far_flowdown_clauses(id),
  applicable boolean NOT NULL DEFAULT true,
  reasoning text NOT NULL,
  source text NOT NULL DEFAULT 'purchase_review_checklist',
  status text NOT NULL DEFAULT 'open',
  recorded_by_user_id integer,
  recorded_by_display_name text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, clause_id)
);

CREATE INDEX IF NOT EXISTS idx_project_far_flowdowns_project_id
  ON project_far_flowdowns(project_id);

CREATE INDEX IF NOT EXISTS idx_project_far_flowdowns_checklist_id
  ON project_far_flowdowns(purchase_review_checklist_id);
