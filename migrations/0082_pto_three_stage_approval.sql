-- Migration: Three-stage PTO approval chain (Supervisor → HR → VP)
-- Idempotent: all changes use IF NOT EXISTS / DO NOTHING guards

-- 1. Add supervisor_employee_id to public.employees (nullable, no NOT NULL constraint)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS supervisor_employee_id INTEGER REFERENCES employees(id);

-- 2. Extend timekeeping.time_off_requests with new columns
ALTER TABLE timekeeping.time_off_requests
  ADD COLUMN IF NOT EXISTS request_unit TEXT NOT NULL DEFAULT 'full_day',
  ADD COLUMN IF NOT EXISTS requested_hours DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS partial_day_date TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_on_behalf BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supervisor_id INTEGER,
  ADD COLUMN IF NOT EXISTS supervisor_decision TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_note TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supervisor_reviewed_by INTEGER,
  ADD COLUMN IF NOT EXISTS hr_decision TEXT,
  ADD COLUMN IF NOT EXISTS hr_note TEXT,
  ADD COLUMN IF NOT EXISTS hr_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_reviewed_by INTEGER,
  ADD COLUMN IF NOT EXISTS vp_decision TEXT,
  ADD COLUMN IF NOT EXISTS vp_note TEXT,
  ADD COLUMN IF NOT EXISTS vp_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vp_reviewed_by INTEGER;

-- 3. Migrate existing 'pending' rows → 'pending_supervisor'
UPDATE timekeeping.time_off_requests
  SET status = 'pending_supervisor'
  WHERE status = 'pending';

-- 4. Update default status for new rows
ALTER TABLE timekeeping.time_off_requests
  ALTER COLUMN status SET DEFAULT 'pending_supervisor';
