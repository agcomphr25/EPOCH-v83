CREATE TABLE IF NOT EXISTS timekeeping.time_off_requests (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date text NOT NULL,
  end_date text NOT NULL,
  leave_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  employee_note text,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
