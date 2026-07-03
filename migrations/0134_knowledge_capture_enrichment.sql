-- Knowledge Capture Phase 1 enrichment.
-- Adds private-by-default structured outputs on top of existing voice note transcripts.

ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS extracted_tasks JSONB,
  ADD COLUMN IF NOT EXISTS suggested_links JSONB,
  ADD COLUMN IF NOT EXISTS follow_up_questions JSONB,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS voice_notes_visibility_idx
  ON voice_notes(visibility);

CREATE INDEX IF NOT EXISTS voice_notes_recorded_by_visibility_idx
  ON voice_notes(recorded_by_username, visibility);
