-- Migration 0085: Labor Capture AI Suggestion table
-- Creates timekeeping.labor_capture_suggestions for the Phase B AI suggestion engine.
-- "AI Suggests, Human Approves, System Audits" — this table stores suggestions only;
-- nothing is written to salaried_timesheet_lines until a human explicitly accepts.

CREATE TABLE IF NOT EXISTS timekeeping.labor_capture_suggestions (
  id                    SERIAL PRIMARY KEY,
  employee_id           INTEGER NOT NULL,
  timesheet_id          INTEGER NOT NULL
                          REFERENCES timekeeping.salaried_timesheets(id)
                          ON DELETE CASCADE,
  original_narrative    TEXT NOT NULL,
  parsed_json           JSONB,
  suggested_lines       JSONB,
  overall_confidence    NUMERIC(5, 4),
  low_confidence_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'DRAFT',
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  rejected_at           TIMESTAMP WITH TIME ZONE,
  expires_at            TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT labor_capture_suggestions_status_check
    CHECK (status IN ('DRAFT', 'REJECTED', 'EXPIRED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'))
);

-- Enforce immutability of original_narrative after insert via a trigger.
-- No UPDATE to original_narrative is permitted once the row is written.
CREATE OR REPLACE FUNCTION timekeeping.prevent_narrative_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.original_narrative IS DISTINCT FROM OLD.original_narrative THEN
    RAISE EXCEPTION
      'original_narrative is immutable after insert on timekeeping.labor_capture_suggestions (id=%). '
      'This field is an audit record of exactly what the employee submitted.',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_lcs_narrative_immutable'
      AND tgrelid = 'timekeeping.labor_capture_suggestions'::regclass
  ) THEN
    CREATE TRIGGER trg_lcs_narrative_immutable
      BEFORE UPDATE ON timekeeping.labor_capture_suggestions
      FOR EACH ROW EXECUTE FUNCTION timekeeping.prevent_narrative_update();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'timekeeping'
      AND tablename  = 'labor_capture_suggestions'
      AND indexname  = 'lcs_employee_id_idx'
  ) THEN
    CREATE INDEX lcs_employee_id_idx
      ON timekeeping.labor_capture_suggestions (employee_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'timekeeping'
      AND tablename  = 'labor_capture_suggestions'
      AND indexname  = 'lcs_timesheet_id_idx'
  ) THEN
    CREATE INDEX lcs_timesheet_id_idx
      ON timekeeping.labor_capture_suggestions (timesheet_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'timekeeping'
      AND tablename  = 'labor_capture_suggestions'
      AND indexname  = 'lcs_status_expires_idx'
  ) THEN
    CREATE INDEX lcs_status_expires_idx
      ON timekeeping.labor_capture_suggestions (status, expires_at)
      WHERE status = 'DRAFT';
  END IF;
END $$;
