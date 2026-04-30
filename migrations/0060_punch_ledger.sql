-- Unified Punch Ledger (Task #1186)
-- Single source of truth for ALL labor events: Kiosk, Traveler, Portal
-- Replaces the dual-system: public.time_clock_entries + timekeeping.punches

CREATE TABLE IF NOT EXISTS punch_ledger (
  id                       SERIAL PRIMARY KEY,

  -- Employee identity (FK to public.employees — no free-text IDs)
  employee_id              INTEGER NOT NULL REFERENCES employees(id),

  -- Session boundaries
  clock_in                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out                TIMESTAMPTZ,

  -- Capture source
  source                   TEXT NOT NULL DEFAULT 'KIOSK', -- KIOSK | TRAVELER | PORTAL

  -- Labor attribution (nullable FKs — no free-text charge codes)
  traveler_id              TEXT REFERENCES travelers(id),
  production_work_order_id UUID,
  charge_code_id           INTEGER REFERENCES charge_codes(id),
  charge_code              TEXT,    -- snapshot of code at time of punch (denormalized for read speed)
  department               TEXT,
  operation                TEXT,
  labor_class              TEXT DEFAULT 'REGULAR', -- REGULAR | BREAK

  -- Budget / approval linkage
  override_reason          TEXT,
  approval_status          TEXT NOT NULL DEFAULT 'AUTO', -- AUTO | APPROVED_OVERRUN
  labor_approval_id        INTEGER REFERENCES labor_approvals(id),
  labor_budget_override_id INTEGER REFERENCES labor_budget_overrides(id),

  -- DCAA audit trail fields
  created_by               INTEGER REFERENCES employees(id),
  created_by_display_name  TEXT,
  updated_by               INTEGER REFERENCES employees(id),
  updated_by_display_name  TEXT,
  is_edited                BOOLEAN NOT NULL DEFAULT FALSE,
  edit_note                TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_punch_ledger_employee_id
  ON punch_ledger(employee_id);

CREATE INDEX IF NOT EXISTS idx_punch_ledger_clock_in
  ON punch_ledger(clock_in DESC);

CREATE INDEX IF NOT EXISTS idx_punch_ledger_open_sessions
  ON punch_ledger(employee_id)
  WHERE clock_out IS NULL;

CREATE INDEX IF NOT EXISTS idx_punch_ledger_traveler_id
  ON punch_ledger(traveler_id)
  WHERE traveler_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_punch_ledger_work_order
  ON punch_ledger(production_work_order_id)
  WHERE production_work_order_id IS NOT NULL;
