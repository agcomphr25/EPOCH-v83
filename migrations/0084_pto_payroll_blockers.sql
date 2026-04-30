-- Migration 0083: PTO payroll production blockers
-- Adds sourceRequestId (FK to time_off_requests) and soft-void columns to leave_entries.
-- All columns are additive and idempotent (IF NOT EXISTS guards).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name = 'leave_entries'
      AND column_name = 'source_request_id'
  ) THEN
    ALTER TABLE timekeeping.leave_entries
      ADD COLUMN source_request_id INTEGER
        REFERENCES timekeeping.time_off_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name = 'leave_entries'
      AND column_name = 'voided_at'
  ) THEN
    ALTER TABLE timekeeping.leave_entries
      ADD COLUMN voided_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name = 'leave_entries'
      AND column_name = 'voided_by'
  ) THEN
    ALTER TABLE timekeeping.leave_entries
      ADD COLUMN voided_by INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name = 'leave_entries'
      AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE timekeeping.leave_entries
      ADD COLUMN void_reason TEXT;
  END IF;
END $$;

-- Index to speed up reversal lookups
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'timekeeping'
      AND tablename = 'leave_entries'
      AND indexname = 'leave_entries_source_request_id_idx'
  ) THEN
    CREATE INDEX leave_entries_source_request_id_idx
      ON timekeeping.leave_entries (source_request_id)
      WHERE source_request_id IS NOT NULL;
  END IF;
END $$;
