-- Migration 0101: burden rate accumulation support
--
-- Adds a reviewable manual-actuals workflow for provisional/final indirect
-- rate calculations.  This is intentionally source-agnostic for the first
-- release: QuickBooks line items are keyed by the user-entered line-item name,
-- month, and pool, then summarized into rate calculation snapshots.

BEGIN;

CREATE TABLE IF NOT EXISTS burden_rate_accumulations (
  id                  SERIAL PRIMARY KEY,
  calculation_year    INTEGER     NOT NULL,
  lookback_start      DATE        NOT NULL,
  lookback_end        DATE        NOT NULL,
  rate_type           TEXT        NOT NULL DEFAULT 'PROVISIONAL',
  effective_from      DATE        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'DRAFT',
  notes               TEXT,
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at           TIMESTAMPTZ,
  CONSTRAINT burden_rate_accumulations_rate_type_chk
    CHECK (rate_type IN ('PROVISIONAL', 'BILLING', 'FINAL')),
  CONSTRAINT burden_rate_accumulations_status_chk
    CHECK (status IN ('DRAFT', 'POSTED'))
);

CREATE INDEX IF NOT EXISTS idx_burden_rate_accumulations_year
  ON burden_rate_accumulations (calculation_year, rate_type, created_at DESC);

CREATE TABLE IF NOT EXISTS burden_rate_accumulation_expense_lines (
  id                  SERIAL PRIMARY KEY,
  accumulation_id     INTEGER     NOT NULL REFERENCES burden_rate_accumulations(id) ON DELETE CASCADE,
  pool_id             INTEGER     NOT NULL REFERENCES indirect_cost_pools(id),
  line_item           TEXT        NOT NULL,
  monthly_amounts     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_burden_rate_accumulation_expense_lines_accumulation
  ON burden_rate_accumulation_expense_lines (accumulation_id, pool_id);

CREATE TABLE IF NOT EXISTS burden_rate_accumulation_bases (
  id                  SERIAL PRIMARY KEY,
  accumulation_id     INTEGER     NOT NULL REFERENCES burden_rate_accumulations(id) ON DELETE CASCADE,
  pool_id             INTEGER     NOT NULL REFERENCES indirect_cost_pools(id),
  base_amount         NUMERIC(14,4) NOT NULL DEFAULT 0,
  base_source         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT burden_rate_accumulation_bases_unique
    UNIQUE (accumulation_id, pool_id)
);

COMMIT;
