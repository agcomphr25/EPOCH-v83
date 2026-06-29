CREATE TABLE IF NOT EXISTS draft_bom_drafts (
  id text PRIMARY KEY,
  name text NOT NULL,
  revision text NOT NULL DEFAULT 'Draft A',
  project text NOT NULL DEFAULT '',
  project_id text,
  project_code text,
  project_name text,
  project_type text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name text NOT NULL DEFAULT 'unknown',
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_display_name text NOT NULL DEFAULT 'unknown',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS draft_bom_drafts_project_idx
  ON draft_bom_drafts(project_type, project_id);

CREATE INDEX IF NOT EXISTS draft_bom_drafts_updated_idx
  ON draft_bom_drafts(updated_at DESC);
