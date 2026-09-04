-- Materialize the employee qualification authority already declared in
-- server/schema.ts. Safe to replay during deployment.
CREATE TABLE IF NOT EXISTS employee_machine_qualifications (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  machine_class TEXT,
  operation_type TEXT,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  granted_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_machine_qualifications_dimension_check
    CHECK (num_nonnulls(machine_class, operation_type, department) >= 1)
);

CREATE INDEX IF NOT EXISTS emq_employee_id_idx
  ON employee_machine_qualifications(employee_id);
