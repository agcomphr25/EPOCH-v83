CREATE TABLE IF NOT EXISTS timekeeping.pto_balance_events (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL,
  time_off_request_id INTEGER REFERENCES timekeeping.time_off_requests(id) ON DELETE SET NULL,
  note TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pto_balance_events_employee_idx
  ON timekeeping.pto_balance_events (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pto_balance_events_request_idx
  ON timekeeping.pto_balance_events (time_off_request_id);

CREATE TABLE IF NOT EXISTS timekeeping.employee_pto_schedules (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_start TEXT NOT NULL,
  effective_end TEXT,
  weekly_hours JSONB NOT NULL,
  note TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_pto_schedules_employee_effective_idx
  ON timekeeping.employee_pto_schedules (employee_id, effective_start DESC);

CREATE UNIQUE INDEX IF NOT EXISTS employee_pto_schedules_one_active_idx
  ON timekeeping.employee_pto_schedules (employee_id)
  WHERE effective_end IS NULL;
