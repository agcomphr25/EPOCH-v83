-- Existing NULL values are intentionally preserved and resolve to legacy_v1 in application code.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workflow_version TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_workflow_version_check'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_workflow_version_check
      CHECK (workflow_version IS NULL OR workflow_version IN ('legacy_v1', 'p2_v2'));
  END IF;
END $$;
