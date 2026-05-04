-- Payroll Export Revision & Adjustment Model
-- Creates immutable, versioned snapshots of every payroll export with full
-- audit trail for DCAA compliance.

-- 1. payroll_export_batches — one row per export action
CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_batches (
  id SERIAL PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  export_format TEXT NOT NULL DEFAULT 'gusto_csv',
  csv_content TEXT NOT NULL,
  csv_checksum TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  employee_count INTEGER NOT NULL,
  total_regular_hours DOUBLE PRECISION NOT NULL,
  total_overtime_hours DOUBLE PRECISION NOT NULL,
  total_sick_hours DOUBLE PRECISION NOT NULL,
  total_vacation_hours DOUBLE PRECISION NOT NULL,
  includes_adjustments BOOLEAN NOT NULL DEFAULT false,
  adjustment_ids JSONB,
  supersedes_batch_id INTEGER REFERENCES timekeeping.payroll_export_batches(id),
  superseded_reason TEXT,
  voided_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by INTEGER,
  processed_at TIMESTAMPTZ,
  processed_by INTEGER,
  processed_confirmation_note TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_batches_period_revision
  ON timekeeping.payroll_export_batches (period_start, period_end, revision_number);

CREATE INDEX IF NOT EXISTS idx_export_batches_period_status
  ON timekeeping.payroll_export_batches (period_start, period_end, status);

CREATE INDEX IF NOT EXISTS idx_export_batches_created_at
  ON timekeeping.payroll_export_batches (created_at);

-- 2. payroll_export_rows — per-employee row-level data for each batch
CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_rows (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES timekeeping.payroll_export_batches(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL,
  epoch_employee_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  regular_hours DOUBLE PRECISION NOT NULL,
  overtime_hours DOUBLE PRECISION NOT NULL,
  double_overtime_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  sick_hours DOUBLE PRECISION NOT NULL,
  vacation_hours DOUBLE PRECISION NOT NULL,
  source_timesheet_ids JSONB NOT NULL,
  source_leave_entry_ids JSONB,
  adjustment_ids JSONB
);

CREATE INDEX IF NOT EXISTS idx_export_rows_batch
  ON timekeeping.payroll_export_rows (batch_id);

CREATE INDEX IF NOT EXISTS idx_export_rows_employee
  ON timekeeping.payroll_export_rows (employee_id);

-- 3. payroll_adjustments — delta records for post-processed corrections
CREATE TABLE IF NOT EXISTS timekeeping.payroll_adjustments (
  id SERIAL PRIMARY KEY,
  original_batch_id INTEGER NOT NULL REFERENCES timekeeping.payroll_export_batches(id),
  employee_id INTEGER NOT NULL,
  correction_id INTEGER REFERENCES timekeeping.timesheet_corrections(id),
  adjustment_type TEXT NOT NULL,
  original_value DOUBLE PRECISION NOT NULL,
  corrected_value DOUBLE PRECISION NOT NULL,
  delta DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  included_in_batch_id INTEGER REFERENCES timekeeping.payroll_export_batches(id),
  delivery_preference TEXT NOT NULL DEFAULT 'next_regular',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_batch
  ON timekeeping.payroll_adjustments (original_batch_id);

CREATE INDEX IF NOT EXISTS idx_adjustments_employee
  ON timekeeping.payroll_adjustments (employee_id);

CREATE INDEX IF NOT EXISTS idx_adjustments_status
  ON timekeeping.payroll_adjustments (status);

-- 4. payroll_export_events — dedicated audit trail
CREATE TABLE IF NOT EXISTS timekeeping.payroll_export_events (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES timekeeping.payroll_export_batches(id),
  adjustment_id INTEGER REFERENCES timekeeping.payroll_adjustments(id),
  event_type TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  actor_email TEXT,
  actor_role TEXT,
  reason TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_events_batch
  ON timekeeping.payroll_export_events (batch_id);

CREATE INDEX IF NOT EXISTS idx_export_events_adjustment
  ON timekeeping.payroll_export_events (adjustment_id);

CREATE INDEX IF NOT EXISTS idx_export_events_type
  ON timekeeping.payroll_export_events (event_type);
