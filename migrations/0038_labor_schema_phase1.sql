-- Phase 1 Labor Schema: new tables and column additions
-- Task #399: Phase 1 Labor Schema & Core Logic

-- Labor charge codes (separate from existing cost_codes)
CREATE TABLE IF NOT EXISTS labor_charge_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'direct',
  department TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_hours_per_day DOUBLE PRECISION,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  wad_charge_code TEXT,
  wad_department TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Labor authorizations (budget envelopes per project/work order/traveler)
CREATE TABLE IF NOT EXISTS labor_authorizations (
  id SERIAL PRIMARY KEY,
  charge_code_id INTEGER NOT NULL REFERENCES labor_charge_codes(id),
  project_id TEXT,
  work_order_id TEXT,
  traveler_id TEXT,
  description TEXT,
  authorized_hours DOUBLE PRECISION NOT NULL,
  approved_extra_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumed_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extra-hours approval requests
CREATE TABLE IF NOT EXISTS labor_authorization_requests (
  id SERIAL PRIMARY KEY,
  labor_authorization_id INTEGER NOT NULL REFERENCES labor_authorizations(id),
  requested_by INTEGER NOT NULL REFERENCES employees(id),
  requested_hours DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Labor work sessions (true labor records)
CREATE TABLE IF NOT EXISTS labor_work_sessions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  charge_code_id INTEGER NOT NULL REFERENCES labor_charge_codes(id),
  labor_authorization_id INTEGER REFERENCES labor_authorizations(id),
  project_id TEXT,
  work_order_id TEXT,
  traveler_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_hours DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Labor time clock punches (individual punch events within sessions)
CREATE TABLE IF NOT EXISTS labor_time_clock_punches (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  session_id INTEGER REFERENCES labor_work_sessions(id),
  type TEXT NOT NULL,
  punched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  source TEXT NOT NULL DEFAULT 'web',
  note TEXT,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  edit_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily timesheets with certification workflow
CREATE TABLE IF NOT EXISTS daily_timesheets (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  certified_at TIMESTAMPTZ,
  certified_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Labor-specific audit log
CREATE TABLE IF NOT EXISTS labor_entry_audit (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  actor_id INTEGER,
  actor_email TEXT,
  actor_role TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add default_charge_code_id to projects, production_work_orders, and travelers
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_charge_code_id INTEGER;
ALTER TABLE production_work_orders ADD COLUMN IF NOT EXISTS default_charge_code_id INTEGER;
ALTER TABLE travelers ADD COLUMN IF NOT EXISTS default_charge_code_id INTEGER;

-- Add project_id to travelers (direct link to projects, separate from via work order)
ALTER TABLE travelers ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- FK constraints for default_charge_code_id columns (idempotent via exception handler)
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT fk_projects_default_charge_code
    FOREIGN KEY (default_charge_code_id) REFERENCES labor_charge_codes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE production_work_orders ADD CONSTRAINT fk_pwo_default_charge_code
    FOREIGN KEY (default_charge_code_id) REFERENCES labor_charge_codes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE travelers ADD CONSTRAINT fk_travelers_default_charge_code
    FOREIGN KEY (default_charge_code_id) REFERENCES labor_charge_codes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
