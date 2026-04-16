-- Labor → GL Posting Engine schema additions

-- Add pay rate columns to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_type TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);

-- labor_posting_runs: one record per (year, month) run
CREATE TABLE IF NOT EXISTS labor_posting_runs (
  id SERIAL PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CALCULATED',
  posted_by TEXT,
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- labor_cost_records: individual cost lines per interval
CREATE TABLE IF NOT EXISTS labor_cost_records (
  id SERIAL PRIMARY KEY,
  posting_run_id INTEGER REFERENCES labor_posting_runs(id),
  epoch_employee_id INTEGER REFERENCES employees(id),
  canonical_id TEXT,
  job_code TEXT,
  department_code TEXT,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  source_punch_canonical_id TEXT,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP NOT NULL,
  hours_worked NUMERIC(10,4) NOT NULL,
  rate_used NUMERIC(12,2) NOT NULL,
  dollar_cost NUMERIC(12,2) NOT NULL,
  cost_type TEXT NOT NULL,
  rate_source TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- labor_account_config: singleton mapping cost types to chart_of_accounts
CREATE TABLE IF NOT EXISTS labor_account_config (
  id SERIAL PRIMARY KEY,
  direct_labor_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  overhead_labor_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  ga_labor_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  accrued_payroll_account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
