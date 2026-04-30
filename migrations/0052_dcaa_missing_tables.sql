-- Migration: Create three tables required by DCAA forensic rules TK-005, TK-008, and TK-009.
-- Without these tables the forensic scanner silently fails on every boot scan.
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS).

-- TK-005: every edited punch must have a matching row here with an edit-class action.
CREATE TABLE IF NOT EXISTS timekeeping.labor_entry_audit (
  id          SERIAL PRIMARY KEY,
  table_name  TEXT        NOT NULL,
  record_id   INTEGER     NOT NULL,
  action      TEXT        NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  actor_id    INTEGER,
  actor_email TEXT,
  actor_role  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table was previously created with record_id TEXT, convert it to INTEGER.
-- This is safe because the table holds no real data yet (it was just created this migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'labor_entry_audit'
      AND column_name  = 'record_id'
      AND data_type    = 'text'
  ) THEN
    DROP INDEX IF EXISTS timekeeping.idx_labor_entry_audit_table_record;
    ALTER TABLE timekeeping.labor_entry_audit
      ALTER COLUMN record_id TYPE INTEGER USING record_id::integer;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_labor_entry_audit_table_record
  ON timekeeping.labor_entry_audit (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_labor_entry_audit_action
  ON timekeeping.labor_entry_audit (action);

-- TK-008 / TK-009: authoritative charge code registry.
-- TK-008 checks that every punch cost_code is active here.
-- TK-009 checks requires_approval to find charges that need an authorization.
CREATE TABLE IF NOT EXISTS timekeeping.labor_charge_codes (
  id               SERIAL PRIMARY KEY,
  code             TEXT        NOT NULL UNIQUE,
  description      TEXT,
  type             TEXT,
  department       TEXT,
  requires_approval BOOLEAN    NOT NULL DEFAULT FALSE,
  max_hours_per_day DOUBLE PRECISION,
  billable         BOOLEAN     NOT NULL DEFAULT TRUE,
  wad_charge_code  TEXT,
  wad_department   TEXT,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_charge_codes_code
  ON timekeeping.labor_charge_codes (code);

CREATE INDEX IF NOT EXISTS idx_labor_charge_codes_active
  ON timekeeping.labor_charge_codes (active);

-- TK-009: each row authorizes a charge code for a project / work order scope.
-- A charge code with requires_approval=true must have at least one active row here.
CREATE TABLE IF NOT EXISTS timekeeping.labor_authorizations (
  id                SERIAL PRIMARY KEY,
  charge_code_id    INTEGER     NOT NULL REFERENCES timekeeping.labor_charge_codes(id) ON DELETE CASCADE,
  project_id        INTEGER,
  work_order_id     INTEGER,
  traveler_id       INTEGER,
  description       TEXT,
  authorized_hours  DOUBLE PRECISION,
  approved_extra_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  consumed_hours    DOUBLE PRECISION NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'active',
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_authorizations_charge_code_id
  ON timekeeping.labor_authorizations (charge_code_id);

CREATE INDEX IF NOT EXISTS idx_labor_authorizations_status
  ON timekeeping.labor_authorizations (status);
