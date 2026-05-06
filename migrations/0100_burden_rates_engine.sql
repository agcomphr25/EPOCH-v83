-- Migration 0100: burden rates engine (fringe / overhead / G&A)
--
-- Adds DCAA-compliant indirect cost pool / allocation base / effective-dated
-- rate / applied-burden modeling.  Pre-GL "apply burden" step writes immutable
-- per-record breakdown rows that are reproducible from the rate version used.
--
-- All statements are idempotent.

BEGIN;

-- ── 1. Allocation bases ─────────────────────────────────────────────────────
-- Reference table.  Each row is a base (e.g., direct-labor dollars) that a
-- pool's indirect rate is applied to.  Bases describe HOW we compute the
-- base amount for a given source cost record.
CREATE TABLE IF NOT EXISTS allocation_bases (
  id            SERIAL PRIMARY KEY,
  code          TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  description   TEXT,
  -- Resolver hint understood by the burden engine.
  -- DIRECT_LABOR_DOLLARS | DIRECT_LABOR_HOURS | TOTAL_COST_INPUT
  resolver_kind TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO allocation_bases (code, name, description, resolver_kind)
SELECT 'DIRECT_LABOR_DOLLARS',
       'Direct Labor Dollars',
       'Sum of dollar_cost on labor cost records classified DIRECT.',
       'DIRECT_LABOR_DOLLARS'
WHERE NOT EXISTS (SELECT 1 FROM allocation_bases WHERE code = 'DIRECT_LABOR_DOLLARS');

INSERT INTO allocation_bases (code, name, description, resolver_kind)
SELECT 'DIRECT_LABOR_HOURS',
       'Direct Labor Hours',
       'Sum of hours_worked on labor cost records classified DIRECT.',
       'DIRECT_LABOR_HOURS'
WHERE NOT EXISTS (SELECT 1 FROM allocation_bases WHERE code = 'DIRECT_LABOR_HOURS');

INSERT INTO allocation_bases (code, name, description, resolver_kind)
SELECT 'TOTAL_COST_INPUT',
       'Total Cost Input',
       'Direct labor + already-applied fringe + overhead burden (G&A base).',
       'TOTAL_COST_INPUT'
WHERE NOT EXISTS (SELECT 1 FROM allocation_bases WHERE code = 'TOTAL_COST_INPUT');

-- ── 2. Indirect cost pools ──────────────────────────────────────────────────
-- One row per indirect pool (Fringe, Overhead, G&A, plus any custom pools).
-- pool_type drives apply order: FRINGE → OVERHEAD → G_AND_A → CUSTOM.
CREATE TABLE IF NOT EXISTS indirect_cost_pools (
  id                 SERIAL PRIMARY KEY,
  code               TEXT        NOT NULL UNIQUE,
  name               TEXT        NOT NULL,
  pool_type          TEXT        NOT NULL,           -- FRINGE | OVERHEAD | G_AND_A | CUSTOM
  allocation_base_id INTEGER     NOT NULL REFERENCES allocation_bases(id),
  description        TEXT,
  apply_order        INTEGER     NOT NULL DEFAULT 100,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT indirect_cost_pools_pool_type_chk
    CHECK (pool_type IN ('FRINGE', 'OVERHEAD', 'G_AND_A', 'CUSTOM'))
);

CREATE INDEX IF NOT EXISTS idx_indirect_cost_pools_active
  ON indirect_cost_pools (is_active, apply_order);

-- ── 3. Indirect rates (effective-dated, insert-only) ────────────────────────
-- Editing a rate inserts a new row; prior rows are NEVER mutated.  Rate at
-- date D for (pool, rate_type) = the row with greatest effective_from <= D.
CREATE TABLE IF NOT EXISTS indirect_rates (
  id              SERIAL PRIMARY KEY,
  pool_id         INTEGER     NOT NULL REFERENCES indirect_cost_pools(id) ON DELETE CASCADE,
  rate_type       TEXT        NOT NULL,                -- PROVISIONAL | BILLING | FINAL
  rate            NUMERIC(10,6) NOT NULL,              -- multiplier, e.g. 0.350000 = 35%
  effective_from  DATE        NOT NULL,
  notes           TEXT,
  created_by      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT indirect_rates_rate_type_chk
    CHECK (rate_type IN ('PROVISIONAL', 'BILLING', 'FINAL')),
  CONSTRAINT indirect_rates_rate_nonneg_chk
    CHECK (rate >= 0),
  CONSTRAINT indirect_rates_unique
    UNIQUE (pool_id, rate_type, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_indirect_rates_lookup
  ON indirect_rates (pool_id, rate_type, effective_from DESC);

-- ── 4. Burden application runs ──────────────────────────────────────────────
-- One row per "apply burden" invocation for a period.  Re-running for the
-- same (period, run_type) is idempotent: existing applied_burden_amounts
-- under the same run are deleted and rewritten before the run is re-marked
-- COMPLETED, but TRUE_UP runs supersede prior runs and produce addendum data.
CREATE TABLE IF NOT EXISTS burden_application_runs (
  id                 SERIAL PRIMARY KEY,
  period_year        INTEGER     NOT NULL,
  period_month       INTEGER     NOT NULL,
  run_type           TEXT        NOT NULL DEFAULT 'INITIAL',  -- INITIAL | TRUE_UP
  rate_type          TEXT        NOT NULL,                    -- PROVISIONAL | BILLING | FINAL
  status             TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING | COMPLETED | FAILED
  supersedes_run_id  INTEGER     REFERENCES burden_application_runs(id),
  applied_by         TEXT        NOT NULL,
  record_count       INTEGER     NOT NULL DEFAULT 0,
  total_burden       NUMERIC(14,2) NOT NULL DEFAULT 0,
  error_message      TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  CONSTRAINT burden_application_runs_run_type_chk
    CHECK (run_type IN ('INITIAL', 'TRUE_UP')),
  CONSTRAINT burden_application_runs_rate_type_chk
    CHECK (rate_type IN ('PROVISIONAL', 'BILLING', 'FINAL')),
  CONSTRAINT burden_application_runs_status_chk
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_burden_application_runs_period
  ON burden_application_runs (period_year, period_month, run_type);

-- ── 5. Applied burden amounts (immutable per source-record × pool) ──────────
-- Per source cost record, one row per pool the burden was applied for.
-- Stores the rate version (rate_id) used so the calculation is reproducible.
CREATE TABLE IF NOT EXISTS applied_burden_amounts (
  id                 SERIAL PRIMARY KEY,
  application_run_id INTEGER     NOT NULL REFERENCES burden_application_runs(id) ON DELETE CASCADE,
  source_table       TEXT        NOT NULL,        -- 'labor_cost_records' (only labor for now)
  source_record_id   INTEGER     NOT NULL,
  pool_id            INTEGER     NOT NULL REFERENCES indirect_cost_pools(id),
  rate_id            INTEGER     NOT NULL REFERENCES indirect_rates(id),
  base_amount        NUMERIC(14,4) NOT NULL,
  rate_used          NUMERIC(10,6) NOT NULL,
  burden_amount      NUMERIC(14,4) NOT NULL,
  is_true_up         BOOLEAN     NOT NULL DEFAULT FALSE,
  prior_amount       NUMERIC(14,4),               -- the amount being trued-up against, if any
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT applied_burden_amounts_source_chk
    CHECK (source_table = 'labor_cost_records')
);

CREATE INDEX IF NOT EXISTS idx_applied_burden_amounts_source
  ON applied_burden_amounts (source_table, source_record_id);

CREATE INDEX IF NOT EXISTS idx_applied_burden_amounts_pool_run
  ON applied_burden_amounts (application_run_id, pool_id);

-- Idempotency guard: one row per (run, source record, pool).
CREATE UNIQUE INDEX IF NOT EXISTS uq_applied_burden_amounts_run_record_pool
  ON applied_burden_amounts (application_run_id, source_record_id, pool_id);

-- ── 6. Seed default pools (idempotent) ──────────────────────────────────────
-- Pools start as inactive placeholders.  Admin must enable + add real rates
-- before posting will pass the GL pre-post gate.
INSERT INTO indirect_cost_pools (code, name, pool_type, allocation_base_id, description, apply_order, is_active)
SELECT 'FRINGE',
       'Fringe Benefits Pool',
       'FRINGE',
       (SELECT id FROM allocation_bases WHERE code = 'DIRECT_LABOR_DOLLARS'),
       'PRELIMINARY — DCAA-required fringe pool. Activate after entering negotiated rate.',
       10,
       FALSE
WHERE NOT EXISTS (SELECT 1 FROM indirect_cost_pools WHERE code = 'FRINGE');

INSERT INTO indirect_cost_pools (code, name, pool_type, allocation_base_id, description, apply_order, is_active)
SELECT 'OVERHEAD',
       'Manufacturing Overhead Pool',
       'OVERHEAD',
       (SELECT id FROM allocation_bases WHERE code = 'DIRECT_LABOR_DOLLARS'),
       'PRELIMINARY — Manufacturing overhead applied on direct labor dollars.',
       20,
       FALSE
WHERE NOT EXISTS (SELECT 1 FROM indirect_cost_pools WHERE code = 'OVERHEAD');

INSERT INTO indirect_cost_pools (code, name, pool_type, allocation_base_id, description, apply_order, is_active)
SELECT 'G_AND_A',
       'General & Administrative Pool',
       'G_AND_A',
       (SELECT id FROM allocation_bases WHERE code = 'TOTAL_COST_INPUT'),
       'PRELIMINARY — G&A applied on total cost input (labor + fringe + overhead).',
       30,
       FALSE
WHERE NOT EXISTS (SELECT 1 FROM indirect_cost_pools WHERE code = 'G_AND_A');

COMMIT;
