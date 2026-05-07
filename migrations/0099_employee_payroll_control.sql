-- Employee payroll control ledger
-- Internal tracking only: these records do not feed the Gusto hours export.

CREATE TABLE IF NOT EXISTS timekeeping.employee_payroll_items (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  item_type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  original_amount NUMERIC(12, 2) NOT NULL,
  balance_remaining NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recurrence_type TEXT NOT NULL DEFAULT 'one_time',
  recurring_amount NUMERIC(12, 2),
  max_total_amount NUMERIC(12, 2),
  start_pay_period TEXT,
  next_pay_period TEXT,
  expected_deduction_pay_period TEXT,
  funding_source TEXT,
  given_date TEXT,
  given_by_user_id INTEGER REFERENCES users(id),
  linked_item_id INTEGER REFERENCES timekeeping.employee_payroll_items(id),
  status TEXT NOT NULL DEFAULT 'draft',
  gusto_entered_at TIMESTAMPTZ,
  gusto_entered_by INTEGER REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES users(id),
  voided_at TIMESTAMPTZ,
  voided_by INTEGER REFERENCES users(id),
  void_reason TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_employee_payroll_item_type
    CHECK (item_type IN ('deduction', 'advance', 'owner_reimbursement')),
  CONSTRAINT chk_employee_payroll_recurrence
    CHECK (recurrence_type IN ('one_time', 'recurring')),
  CONSTRAINT chk_employee_payroll_status
    CHECK (status IN ('draft', 'ready_for_gusto', 'entered_in_gusto', 'partially_repaid', 'complete', 'voided')),
  CONSTRAINT chk_employee_payroll_amounts_nonnegative
    CHECK (
      original_amount >= 0
      AND balance_remaining >= 0
      AND (recurring_amount IS NULL OR recurring_amount >= 0)
      AND (max_total_amount IS NULL OR max_total_amount >= 0)
    )
);

CREATE TABLE IF NOT EXISTS timekeeping.employee_payroll_item_events (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES timekeeping.employee_payroll_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount NUMERIC(12, 2),
  pay_period TEXT,
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  metadata JSONB,
  actor_id INTEGER REFERENCES users(id),
  actor_email TEXT,
  actor_role TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_items_employee
  ON timekeeping.employee_payroll_items(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_items_status
  ON timekeeping.employee_payroll_items(status);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_items_type
  ON timekeeping.employee_payroll_items(item_type);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_items_next_period
  ON timekeeping.employee_payroll_items(next_pay_period);

CREATE INDEX IF NOT EXISTS idx_employee_payroll_events_item
  ON timekeeping.employee_payroll_item_events(item_id, created_at DESC);
