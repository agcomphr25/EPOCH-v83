CREATE TABLE IF NOT EXISTS project_rom_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  summary text,
  assumptions text,
  risk_notes text,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamp,
  locked_reason text,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name text,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_display_name text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT project_rom_drafts_project_unique UNIQUE (project_id),
  CONSTRAINT project_rom_drafts_status_check CHECK (status IN ('draft', 'locked'))
);

CREATE INDEX IF NOT EXISTS project_rom_drafts_project_idx ON project_rom_drafts(project_id);
CREATE INDEX IF NOT EXISTS project_rom_drafts_status_idx ON project_rom_drafts(status);
