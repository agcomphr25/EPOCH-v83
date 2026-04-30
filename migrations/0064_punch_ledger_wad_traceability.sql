-- Task #1235: Enforce WAD-based labor charging at traveler step start
-- Adds WAD/project traceability fields and certification/overrun state to punch_ledger

ALTER TABLE public.punch_ledger
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS traveler_step_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS certification_status TEXT,
  ADD COLUMN IF NOT EXISTS is_overrun BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS overrun_reason TEXT;

COMMENT ON COLUMN public.punch_ledger.project_id IS 'Derived server-side from WAD.projectId — never trusted from client input';
COMMENT ON COLUMN public.punch_ledger.traveler_step_id IS 'Populated at traveler step start — links labor session to the specific step being worked';
COMMENT ON COLUMN public.punch_ledger.certification_status IS 'VALID | EXPIRED | MISSING — certification state recorded at session/step start; phase 1 WARN policy';
COMMENT ON COLUMN public.punch_ledger.is_overrun IS 'True when charge code budget was exhausted at session start; phase 1 WARN policy';
COMMENT ON COLUMN public.punch_ledger.overrun_reason IS 'Human-readable reason for overrun flag';
