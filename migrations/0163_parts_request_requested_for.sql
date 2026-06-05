ALTER TABLE parts_requests
  ADD COLUMN IF NOT EXISTS requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_for_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_for_display_name TEXT;

CREATE INDEX IF NOT EXISTS parts_requests_requested_by_user_id_idx
  ON parts_requests(requested_by_user_id);

CREATE INDEX IF NOT EXISTS parts_requests_requested_for_employee_id_idx
  ON parts_requests(requested_for_employee_id);
