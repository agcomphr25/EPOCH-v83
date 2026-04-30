CREATE TABLE IF NOT EXISTS timekeeping.timesheet_corrections (
  id                        SERIAL PRIMARY KEY,
  timesheet_id              INTEGER NOT NULL REFERENCES timekeeping.timesheets(id) ON DELETE CASCADE,
  requested_by_employee_id  INTEGER NOT NULL,
  requested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason                    TEXT NOT NULL,
  original_snapshot         JSONB NOT NULL DEFAULT '{}',
  proposed_changes          JSONB NOT NULL DEFAULT '{}',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at               TIMESTAMPTZ,
  reviewer_note             TEXT,
  after_snapshot            JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_corrections_timesheet_id
  ON timekeeping.timesheet_corrections (timesheet_id);

CREATE INDEX IF NOT EXISTS idx_timesheet_corrections_status
  ON timekeeping.timesheet_corrections (status);
