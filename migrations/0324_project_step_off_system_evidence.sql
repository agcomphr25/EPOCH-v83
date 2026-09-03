-- Controlled off-system file evidence for legacy P2 project workflow steps.
-- Existing rows retain SYSTEM_RECORD as their completion method.
ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS completion_method TEXT NOT NULL DEFAULT 'SYSTEM_RECORD',
  ADD COLUMN IF NOT EXISTS off_system_file_url TEXT,
  ADD COLUMN IF NOT EXISTS off_system_file_title TEXT,
  ADD COLUMN IF NOT EXISTS off_system_completion_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'project_steps_completion_method_check'
       AND conrelid = 'public.project_steps'::regclass
  ) THEN
    ALTER TABLE public.project_steps
      ADD CONSTRAINT project_steps_completion_method_check
      CHECK (
        completion_method = 'SYSTEM_RECORD'
        OR (
          completion_method = 'OFF_SYSTEM_FILE'
          AND off_system_file_url LIKE 'https://%'
          AND length(trim(off_system_file_title)) > 0
          AND length(trim(off_system_completion_reason)) > 0
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS project_steps_off_system_completion_idx
  ON public.project_steps(project_id, completed_at)
  WHERE completion_method = 'OFF_SYSTEM_FILE';
