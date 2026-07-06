ALTER TABLE draft_bom_drafts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allow_public_edit boolean NOT NULL DEFAULT false;

UPDATE draft_bom_drafts
SET visibility = COALESCE(NULLIF(visibility, ''), 'public'),
    allow_public_edit = COALESCE(allow_public_edit, false);

CREATE INDEX IF NOT EXISTS draft_bom_drafts_visibility_idx
  ON draft_bom_drafts(visibility, created_by_user_id);
