-- 0161_employee_termination_access_controls.sql
-- Separate employment lifecycle status from EPOCH login access.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS termination_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS eligible_for_rehire BOOLEAN,
  ADD COLUMN IF NOT EXISTS final_paycheck_date DATE,
  ADD COLUMN IF NOT EXISTS termination_notes TEXT,
  ADD COLUMN IF NOT EXISTS terminated_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS terminated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMP;

UPDATE employees
SET employment_status = CASE WHEN COALESCE(is_active, true) THEN 'ACTIVE' ELSE 'TERMINATED' END
WHERE employment_status IS NULL OR employment_status = '';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS access_exception_reason TEXT,
  ADD COLUMN IF NOT EXISTS access_exception_approved_by_user_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS access_exception_approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS access_exception_approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS access_exception_expires_at TIMESTAMP;

UPDATE users
SET access_status = CASE WHEN COALESCE(is_active, true) THEN 'ACTIVE' ELSE 'DISABLED' END
WHERE access_status IS NULL OR access_status = '';

CREATE INDEX IF NOT EXISTS employees_employment_status_idx
  ON employees(employment_status);

CREATE INDEX IF NOT EXISTS users_access_exception_expires_at_idx
  ON users(access_exception_expires_at)
  WHERE access_exception_expires_at IS NOT NULL;
