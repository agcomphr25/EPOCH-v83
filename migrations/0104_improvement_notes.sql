-- 0104_improvement_notes.sql
-- Promote the improvement notes prototype from localStorage to a backed table.
-- Captures workflow improvement suggestions surfaced from any page in EPOCH.

CREATE TABLE IF NOT EXISTS improvement_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Other',
  workflow TEXT NOT NULL DEFAULT 'Other',
  type TEXT NOT NULL DEFAULT 'idea',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  page_path TEXT NOT NULL DEFAULT '',
  page_title TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'context-capture',
  created_by_user_id INTEGER,
  created_by_display_name TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT improvement_notes_type_chk
    CHECK (type IN ('pain-point', 'missing-info', 'repeated-task', 'bug', 'idea')),
  CONSTRAINT improvement_notes_priority_chk
    CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT improvement_notes_status_chk
    CHECK (status IN ('new', 'reviewed', 'planned', 'built')),
  CONSTRAINT improvement_notes_source_chk
    CHECK (source IN ('context-capture', 'dashboard'))
);

CREATE INDEX IF NOT EXISTS improvement_notes_status_idx ON improvement_notes(status);
CREATE INDEX IF NOT EXISTS improvement_notes_priority_idx ON improvement_notes(priority);
CREATE INDEX IF NOT EXISTS improvement_notes_workflow_idx ON improvement_notes(workflow);
CREATE INDEX IF NOT EXISTS improvement_notes_role_idx ON improvement_notes(role);
CREATE INDEX IF NOT EXISTS improvement_notes_created_at_idx ON improvement_notes(created_at DESC);
