-- Add authorization_request_id to labor_work_sessions to record which extra-hours
-- approval record was used to unblock this session (nullable; null for sessions
-- opened without a budget override).
--
-- The table was created in migration 0038_labor_schema_phase1.sql under the
-- public schema (no schema qualifier).  The original draft of this migration
-- incorrectly used the "timekeeping." schema prefix; corrected to "public.".
--
-- Guard: skip gracefully if either public.labor_work_sessions or
-- public.labor_authorization_requests is absent (schema-only baseline that
-- predates the labor schema migrations).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'labor_work_sessions'
  ) THEN
    RAISE NOTICE '0072: table public.labor_work_sessions does not exist yet — skipping ALTER (no-op)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'labor_authorization_requests'
  ) THEN
    RAISE NOTICE '0072: table public.labor_authorization_requests does not exist yet — skipping ALTER (no-op)';
    RETURN;
  END IF;

  ALTER TABLE public.labor_work_sessions
    ADD COLUMN IF NOT EXISTS authorization_request_id integer
      REFERENCES public.labor_authorization_requests(id);
END $$;
