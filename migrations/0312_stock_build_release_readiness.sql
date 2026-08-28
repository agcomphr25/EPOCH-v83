-- Signed stock-build release-readiness authority.
-- This phase records a release decision only. It creates no work orders, queue rows, travelers, or inventory movements.

CREATE TABLE IF NOT EXISTS stock_build_release_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_build_request_id UUID NOT NULL REFERENCES stock_build_requests(id) ON DELETE RESTRICT,
  request_concurrency_version INTEGER NOT NULL CHECK (request_concurrency_version > 0),
  requested_quantity NUMERIC(18,6) NOT NULL CHECK (requested_quantity > 0),
  available_inventory_quantity NUMERIC(18,6) NOT NULL,
  authoritative_open_supply_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  net_build_quantity NUMERIC(18,6) NOT NULL CHECK (net_build_quantity >= 0),
  evaluation_snapshot JSONB NOT NULL,
  evaluation_checksum TEXT NOT NULL,
  signature_meaning TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stock_build_request_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS stock_build_release_decisions_request_idx
  ON stock_build_release_decisions(stock_build_request_id,created_at);

CREATE OR REPLACE FUNCTION stock_build_release_decision_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Stock-build release decisions are append-only'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_build_release_decision_immutable ON stock_build_release_decisions;
CREATE TRIGGER stock_build_release_decision_immutable
  BEFORE UPDATE OR DELETE ON stock_build_release_decisions FOR EACH ROW
  EXECUTE FUNCTION stock_build_release_decision_immutable();
