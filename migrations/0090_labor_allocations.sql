CREATE TABLE IF NOT EXISTS labor_allocations (
  id                        SERIAL PRIMARY KEY,

  -- Session FK (required)
  punch_ledger_id           INTEGER NOT NULL REFERENCES punch_ledger(id) ON DELETE CASCADE,

  -- Employee identity (denormalized for query performance)
  employee_id               INTEGER NOT NULL REFERENCES employees(id),

  -- Time boundaries for this allocation segment
  allocation_start          TIMESTAMPTZ NOT NULL,
  allocation_end            TIMESTAMPTZ,

  -- Labor attribution FKs (nullable)
  charge_code_id            INTEGER REFERENCES charge_codes(id),
  traveler_id               TEXT REFERENCES travelers(id),
  traveler_step_id          VARCHAR(255),
  production_work_order_id  UUID REFERENCES production_work_orders(id) ON DELETE SET NULL,
  project_id                UUID REFERENCES projects(id) ON DELETE SET NULL,
  department                TEXT,
  operation                 TEXT,

  -- Labor classification
  labor_class               TEXT NOT NULL DEFAULT 'REGULAR',

  -- State: OPEN | CLOSED | AMENDED
  status                    TEXT NOT NULL DEFAULT 'OPEN',

  -- Certification snapshot at allocation start
  certification_status      TEXT,

  -- Budget / overrun flags
  is_overrun                BOOLEAN NOT NULL DEFAULT FALSE,
  overrun_reason            TEXT,

  -- Budget / approval linkage
  labor_approval_id         INTEGER REFERENCES labor_approvals(id),
  labor_budget_override_id  INTEGER REFERENCES labor_budget_overrides(id),

  -- Amendment chain (self-referential)
  amends_allocation_id      INTEGER REFERENCES labor_allocations(id),

  -- Capture source: BACKFILL | LIVE | PORTAL | CORRECTION
  source                    TEXT NOT NULL DEFAULT 'LIVE',

  -- Ordering within a session (1-based)
  sequence_order            INTEGER NOT NULL DEFAULT 1,

  -- DCAA audit fields
  created_by                INTEGER REFERENCES employees(id),
  created_by_display_name   TEXT,
  updated_by                INTEGER REFERENCES employees(id),
  updated_by_display_name   TEXT,
  is_edited                 BOOLEAN NOT NULL DEFAULT FALSE,
  edit_note                 TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_labor_allocations_punch_ledger_id
  ON labor_allocations (punch_ledger_id);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_employee_id
  ON labor_allocations (employee_id);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_allocation_start
  ON labor_allocations (allocation_start);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_charge_code_id
  ON labor_allocations (charge_code_id);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_traveler_id
  ON labor_allocations (traveler_id);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_production_work_order_id
  ON labor_allocations (production_work_order_id);

CREATE INDEX IF NOT EXISTS idx_labor_allocations_status_open
  ON labor_allocations (punch_ledger_id)
  WHERE status = 'OPEN';
