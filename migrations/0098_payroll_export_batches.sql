-- 0098_payroll_export_batches.sql
-- Phase 1: Payroll export batches, rows, and events.
-- Adds three new tables in the `timekeeping` schema for storing immutable,
-- versioned snapshots of every Gusto CSV export. See docs/payroll-export-design.md.
--
-- Phase 1 scope:
--   * payroll_export_batches  — one row per export action (full-period only)
--   * payroll_export_rows     — per-employee snapshot rows (with snapshot identity fields)
--   * payroll_export_events   — audit trail (created / superseded / downloaded / processed)
--
-- payroll_adjustments is intentionally NOT created in Phase 1 (Phase 3).  Forward-compat
-- nullable columns (`includes_adjustments`, `adjustment_ids`, `payroll_export_events.adjustment_id`)
-- exist so Phase 3 can populate them without a follow-up migration.  The FK from
-- payroll_export_events.adjustment_id → payroll_adjustments.id is intentionally NOT added
-- here — it will be added in the migration that creates payroll_adjustments.

-- Tables -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_batches (
  id                            SERIAL PRIMARY KEY,
  period_start                  TEXT NOT NULL,
  period_end                    TEXT NOT NULL,
  export_type                   TEXT NOT NULL DEFAULT 'regular_full_period',
  revision_number               INTEGER NOT NULL DEFAULT 1,
  status                        TEXT NOT NULL DEFAULT 'active',
  export_format                 TEXT NOT NULL DEFAULT 'gusto_csv',
  csv_content                   TEXT NOT NULL,
  csv_checksum                  TEXT NOT NULL,
  row_count                     INTEGER NOT NULL,
  employee_count                INTEGER NOT NULL,
  total_regular_hours           DOUBLE PRECISION NOT NULL,
  total_overtime_hours          DOUBLE PRECISION NOT NULL,
  total_sick_hours              DOUBLE PRECISION NOT NULL,
  total_vacation_hours          DOUBLE PRECISION NOT NULL,
  includes_adjustments          BOOLEAN NOT NULL DEFAULT FALSE,
  adjustment_ids                JSONB,
  source_timesheet_ids          JSONB NOT NULL,
  source_leave_entry_ids        JSONB,
  supersedes_batch_id           INTEGER REFERENCES timekeeping.payroll_export_batches(id),
  superseded_reason             TEXT,
  voided_reason                 TEXT,
  voided_at                     TIMESTAMPTZ,
  voided_by                     INTEGER,
  processed_at                  TIMESTAMPTZ,
  processed_by                  INTEGER,
  processed_confirmation_note   TEXT,
  created_by                    INTEGER NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Date format CHECK constraints (regex enforces YYYY-MM-DD).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_export_batches_period_start_format') THEN
    ALTER TABLE timekeeping.payroll_export_batches
      ADD CONSTRAINT chk_export_batches_period_start_format
      CHECK (period_start ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_export_batches_period_end_format') THEN
    ALTER TABLE timekeeping.payroll_export_batches
      ADD CONSTRAINT chk_export_batches_period_end_format
      CHECK (period_end ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
END $$;

-- export_type value enforcement — Phase 1 only writes 'regular_full_period'.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_export_batches_export_type') THEN
    ALTER TABLE timekeeping.payroll_export_batches
      ADD CONSTRAINT chk_export_batches_export_type
      CHECK (export_type IN ('regular_full_period', 'off_cycle_adjustment'));
  END IF;
END $$;

-- status value enforcement.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_export_batches_status') THEN
    ALTER TABLE timekeeping.payroll_export_batches
      ADD CONSTRAINT chk_export_batches_status
      CHECK (status IN ('active', 'superseded', 'voided', 'processed'));
  END IF;
END $$;

-- Indexes ----------------------------------------------------------------

-- Revision uniqueness scoped per (period, export_type).
CREATE UNIQUE INDEX IF NOT EXISTS idx_export_batches_period_type_revision
  ON timekeeping.payroll_export_batches (period_start, period_end, export_type, revision_number);

-- Database-enforced active-batch uniqueness (the partial unique index that
-- prevents two active batches for the same period + type from coexisting).
CREATE UNIQUE INDEX IF NOT EXISTS idx_export_batches_active_unique
  ON timekeeping.payroll_export_batches (period_start, period_end, export_type)
  WHERE status = 'active';

-- Period + status lookup.
CREATE INDEX IF NOT EXISTS idx_export_batches_period_status
  ON timekeeping.payroll_export_batches (period_start, period_end, status);

-- Chronological listing.
CREATE INDEX IF NOT EXISTS idx_export_batches_created_at
  ON timekeeping.payroll_export_batches (created_at);

-- payroll_export_rows ----------------------------------------------------

CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_rows (
  id                              SERIAL PRIMARY KEY,
  batch_id                        INTEGER NOT NULL REFERENCES timekeeping.payroll_export_batches(id) ON DELETE CASCADE,
  employee_id                     INTEGER NOT NULL,
  epoch_employee_id               INTEGER,
  employee_first_name_snapshot    TEXT NOT NULL,
  employee_last_name_snapshot     TEXT NOT NULL,
  employee_number_snapshot        TEXT,
  employee_email_snapshot         TEXT,
  regular_hours                   DOUBLE PRECISION NOT NULL,
  overtime_hours                  DOUBLE PRECISION NOT NULL,
  double_overtime_hours           DOUBLE PRECISION NOT NULL DEFAULT 0,
  sick_hours                      DOUBLE PRECISION NOT NULL,
  vacation_hours                  DOUBLE PRECISION NOT NULL,
  source_timesheet_ids            JSONB NOT NULL,
  source_leave_entry_ids          JSONB,
  adjustment_ids                  JSONB
);

CREATE INDEX IF NOT EXISTS idx_export_rows_batch
  ON timekeeping.payroll_export_rows (batch_id);

CREATE INDEX IF NOT EXISTS idx_export_rows_employee
  ON timekeeping.payroll_export_rows (employee_id);

-- payroll_export_events --------------------------------------------------
-- Audit trail for every batch lifecycle transition.  adjustment_id is a
-- nullable forward-compat column for Phase 3 — its FK to payroll_adjustments
-- is intentionally added LATER (not in this migration) because the target
-- table does not yet exist.

CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_events (
  id              SERIAL PRIMARY KEY,
  batch_id        INTEGER REFERENCES timekeeping.payroll_export_batches(id) ON DELETE SET NULL,
  adjustment_id   INTEGER,
  event_type      TEXT NOT NULL,
  actor_id        INTEGER NOT NULL,
  actor_email     TEXT,
  actor_role      TEXT,
  reason          TEXT,
  metadata        JSONB,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_events_batch
  ON timekeeping.payroll_export_events (batch_id);

CREATE INDEX IF NOT EXISTS idx_export_events_adjustment
  ON timekeeping.payroll_export_events (adjustment_id);

CREATE INDEX IF NOT EXISTS idx_export_events_type
  ON timekeeping.payroll_export_events (event_type);
