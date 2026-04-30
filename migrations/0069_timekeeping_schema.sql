-- Migration: Create timekeeping schema and all its tables.
-- This brings the standalone Timekeeping module schema into EPOCH's DB
-- as part of Phase 1 absorption. All statements are idempotent.

CREATE SCHEMA IF NOT EXISTS timekeeping;

-- Core employee anchor table.
-- epoch_employee_id links to public.employees.id (non-FK, soft reference).
CREATE TABLE IF NOT EXISTS timekeeping.employees (
  id                SERIAL PRIMARY KEY,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT,
  department        TEXT,
  job_title         TEXT,
  employee_number   TEXT,
  pin               TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  hire_date         TEXT,
  hourly_rate       DOUBLE PRECISION,
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  epoch_employee_id INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timekeeping_employees_epoch_employee_id
  ON timekeeping.employees (epoch_employee_id)
  WHERE epoch_employee_id IS NOT NULL;

-- Punch clock records.
CREATE TABLE IF NOT EXISTS timekeeping.punches (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES timekeeping.employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  punched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  note        TEXT,
  source      TEXT NOT NULL DEFAULT 'web',
  is_edited   BOOLEAN NOT NULL DEFAULT FALSE,
  edit_note   TEXT,
  cost_code   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timekeeping_punches_employee_id ON timekeeping.punches (employee_id);
CREATE INDEX IF NOT EXISTS idx_timekeeping_punches_punched_at  ON timekeeping.punches (punched_at);

-- Weekly timesheets.
CREATE TABLE IF NOT EXISTS timekeeping.timesheets (
  id                  SERIAL PRIMARY KEY,
  employee_id         INTEGER NOT NULL REFERENCES timekeeping.employees(id) ON DELETE CASCADE,
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  total_hours         DOUBLE PRECISION NOT NULL DEFAULT 0,
  regular_hours       DOUBLE PRECISION NOT NULL DEFAULT 0,
  overtime_hours      DOUBLE PRECISION NOT NULL DEFAULT 0,
  rejection_note      TEXT,
  employee_attested   BOOLEAN NOT NULL DEFAULT FALSE,
  attested_at         TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  submitted_by        INTEGER,
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         INTEGER,
  reviewer_email      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timekeeping_timesheets_employee_id ON timekeeping.timesheets (employee_id);
CREATE INDEX IF NOT EXISTS idx_timekeeping_timesheets_period      ON timekeeping.timesheets (period_start, period_end);

-- Company-wide settings (single row).
CREATE TABLE IF NOT EXISTS timekeeping.settings (
  id                        SERIAL PRIMARY KEY,
  company_name              TEXT NOT NULL DEFAULT 'My Company',
  timezone                  TEXT NOT NULL DEFAULT 'America/New_York',
  overtime_threshold_daily  DOUBLE PRECISION NOT NULL DEFAULT 8,
  overtime_threshold_weekly DOUBLE PRECISION NOT NULL DEFAULT 40,
  rounding_rule_minutes     INTEGER NOT NULL DEFAULT 0,
  break_duration_minutes    INTEGER NOT NULL DEFAULT 30,
  require_break_after_hours DOUBLE PRECISION NOT NULL DEFAULT 6,
  workweek_start_day        INTEGER NOT NULL DEFAULT 1,
  kiosk_require_pin         BOOLEAN NOT NULL DEFAULT FALSE,
  kiosk_timeout_seconds     INTEGER NOT NULL DEFAULT 60,
  standard_work_week_hours  DOUBLE PRECISION NOT NULL DEFAULT 40,
  kiosk_message             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings row if not already present.
INSERT INTO timekeeping.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Audit log.
CREATE TABLE IF NOT EXISTS timekeeping.audit_log (
  id          SERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  actor_id    INTEGER,
  actor_email TEXT,
  actor_role  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leave entries.
CREATE TABLE IF NOT EXISTS timekeeping.leave_entries (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES timekeeping.employees(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  leave_type  TEXT NOT NULL,
  hours       DOUBLE PRECISION NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cost codes.
CREATE TABLE IF NOT EXISTS timekeeping.cost_codes (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timesheet amendments.
CREATE TABLE IF NOT EXISTS timekeeping.amendments (
  id               SERIAL PRIMARY KEY,
  timesheet_id     INTEGER NOT NULL REFERENCES timekeeping.timesheets(id) ON DELETE CASCADE,
  justification    TEXT NOT NULL,
  field_changed    TEXT NOT NULL,
  old_value        TEXT,
  new_value        TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_by       INTEGER,
  created_by_email TEXT,
  approved_by      INTEGER,
  approved_by_email TEXT,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Employee certifications.
CREATE TABLE IF NOT EXISTS timekeeping.certifications (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES timekeeping.employees(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  issued_by   TEXT,
  issued_date TEXT,
  expires_date TEXT,
  cert_number TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily timesheets (supervisor certification).
CREATE TABLE IF NOT EXISTS timekeeping.daily_timesheets (
  id           SERIAL PRIMARY KEY,
  employee_id  INTEGER NOT NULL REFERENCES timekeeping.employees(id),
  date         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  total_hours  DOUBLE PRECISION NOT NULL DEFAULT 0,
  certified_at TIMESTAMPTZ,
  certified_by INTEGER REFERENCES timekeeping.employees(id),
  approved_at  TIMESTAMPTZ,
  approved_by  INTEGER REFERENCES timekeeping.employees(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (standalone auth — not used after absorption, kept for schema parity).
CREATE TABLE IF NOT EXISTS timekeeping.users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee',
  employee_id   INTEGER REFERENCES timekeeping.employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: for every active EPOCH employee not yet anchored in timekeeping.employees,
-- create a stub row so auto-eligibility is satisfied from day 1.
--
-- Guard: if the identity columns have already been renamed to *_deprecated by
-- 0049_retire_timekeeping_identity_columns.sql (which runs before this migration),
-- or dropped entirely by 0066_drop_timekeeping_deprecated_columns.sql, the INSERT
-- and PIN backfill are skipped — they were either already applied or no longer
-- apply to the current column layout.
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'first_name'
  ) THEN
    RAISE NOTICE '0069: timekeeping.employees.first_name already renamed — skipping backfill (already applied by an earlier run)';
    RETURN;
  END IF;

  INSERT INTO timekeeping.employees (first_name, last_name, email, status, epoch_employee_id)
  SELECT
    SPLIT_PART(e.name, ' ', 1)                                   AS first_name,
    COALESCE(NULLIF(SUBSTRING(e.name FROM POSITION(' ' IN e.name) + 1), ''), 'Unknown') AS last_name,
    COALESCE(e.email, 'employee-' || e.id || '@epoch.internal')   AS email,
    CASE WHEN e.is_active THEN 'active' ELSE 'inactive' END       AS status,
    e.id                                                          AS epoch_employee_id
  FROM employees e
  WHERE NOT EXISTS (
    SELECT 1 FROM timekeeping.employees tk WHERE tk.epoch_employee_id = e.id
  )
  ON CONFLICT (email) DO NOTHING;

  -- Also backfill PIN from public.employees if already set.
  UPDATE timekeeping.employees AS tk
  SET pin = pub.timekeeper_pin
  FROM employees AS pub
  WHERE tk.epoch_employee_id = pub.id
    AND pub.timekeeper_pin IS NOT NULL
    AND (tk.pin IS NULL OR tk.pin = '');

  RAISE NOTICE '0069: employee backfill complete';
END $$;
