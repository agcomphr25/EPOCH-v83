CREATE TABLE IF NOT EXISTS timekeeping.punch_correction_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  punch_ledger_id INTEGER,
  request_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'employee_portal',
  status TEXT NOT NULL DEFAULT 'pending_supervisor',
  reason TEXT NOT NULL,
  original_snapshot JSONB,
  proposed_changes JSONB NOT NULL,
  supervisor_id INTEGER,
  supervisor_decision TEXT,
  supervisor_note TEXT,
  supervisor_reviewed_at TIMESTAMPTZ,
  supervisor_reviewed_by INTEGER,
  hr_decision TEXT,
  hr_note TEXT,
  hr_reviewed_at TIMESTAMPTZ,
  hr_reviewed_by INTEGER,
  applied_at TIMESTAMPTZ,
  applied_by INTEGER,
  after_snapshot JSONB,
  submitted_by_user_id INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_punch_correction_request_type
    CHECK (request_type IN ('edit_session', 'add_session', 'delete_session')),
  CONSTRAINT chk_punch_correction_status
    CHECK (status IN ('pending_supervisor', 'pending_hr', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT chk_punch_correction_supervisor_decision
    CHECK (supervisor_decision IS NULL OR supervisor_decision IN ('approved', 'denied')),
  CONSTRAINT chk_punch_correction_hr_decision
    CHECK (hr_decision IS NULL OR hr_decision IN ('approved', 'denied'))
);

CREATE INDEX IF NOT EXISTS idx_punch_correction_requests_employee_id
  ON timekeeping.punch_correction_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_punch_correction_requests_punch_ledger_id
  ON timekeeping.punch_correction_requests(punch_ledger_id);

CREATE INDEX IF NOT EXISTS idx_punch_correction_requests_status
  ON timekeeping.punch_correction_requests(status);

CREATE INDEX IF NOT EXISTS idx_punch_correction_requests_supervisor_id
  ON timekeeping.punch_correction_requests(supervisor_id);
