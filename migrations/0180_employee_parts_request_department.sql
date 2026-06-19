ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS parts_request_department_id integer REFERENCES inventory_departments(id) ON DELETE SET NULL;
