CREATE TABLE IF NOT EXISTS wad_charge_code_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wad_id UUID REFERENCES production_work_orders(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  operation TEXT NOT NULL,
  labor_category TEXT,
  classification TEXT NOT NULL DEFAULT 'DIRECT',
  budgeted_hours NUMERIC,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_by_display_name TEXT NOT NULL DEFAULT 'Unknown',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'PENDING',
  assigned_charge_code_id INTEGER REFERENCES charge_codes(id) ON DELETE SET NULL,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wad_charge_code_requests_status_idx
  ON wad_charge_code_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS wad_charge_code_requests_wad_idx
  ON wad_charge_code_requests(wad_id);

CREATE UNIQUE INDEX IF NOT EXISTS wad_charge_code_requests_open_operation_idx
  ON wad_charge_code_requests(wad_id, department, operation)
  WHERE status = 'PENDING';
