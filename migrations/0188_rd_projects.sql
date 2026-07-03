CREATE TABLE IF NOT EXISTS rd_projects (
  id text PRIMARY KEY,
  project_name text NOT NULL,
  owner text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  signoff_required boolean NOT NULL DEFAULT false,
  signoff_user_id text NOT NULL DEFAULT '',
  draft_tab_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL DEFAULT '',
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name text NOT NULL DEFAULT 'unknown',
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_display_name text NOT NULL DEFAULT 'unknown',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rd_projects_updated_at ON rd_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rd_projects_status ON rd_projects (status);
