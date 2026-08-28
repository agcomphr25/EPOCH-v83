-- Universal P1/P2 stock-build request authority.
-- Additive and prospective only: no existing inventory, queue, work-order, or balance rows are changed.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS stock_build_production_system TEXT;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_stock_build_production_system_check;
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_stock_build_production_system_check
  CHECK (stock_build_production_system IS NULL OR stock_build_production_system IN ('P1','P2'));

CREATE TABLE IF NOT EXISTS stock_build_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  production_system TEXT NOT NULL CHECK (production_system IN ('P1','P2')),
  demand_source TEXT NOT NULL DEFAULT 'STOCK' CHECK (demand_source='STOCK'),
  requested_quantity NUMERIC(18,6) NOT NULL CHECK (requested_quantity > 0),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  due_date DATE,
  target_stock_location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','BLOCKED','READY_FOR_RELEASE','RELEASED','IN_PROGRESS','COMPLETE','CANCELLED'
  )),
  part_number_snapshot TEXT NOT NULL,
  part_name_snapshot TEXT NOT NULL,
  part_revision_snapshot TEXT,
  department_id_snapshot INTEGER NOT NULL REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  department_name_snapshot TEXT NOT NULL,
  readiness_snapshot JSONB NOT NULL,
  readiness_checksum TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(created_by_user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS stock_build_requests_status_idx
  ON stock_build_requests(status,priority,due_date);
CREATE INDEX IF NOT EXISTS stock_build_requests_inventory_item_idx
  ON stock_build_requests(inventory_item_id,status);

CREATE TABLE IF NOT EXISTS stock_build_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_build_request_id UUID NOT NULL REFERENCES stock_build_requests(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_build_request_events_request_idx
  ON stock_build_request_events(stock_build_request_id,created_at);

CREATE OR REPLACE FUNCTION stock_build_request_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
    OR NEW.production_system IS DISTINCT FROM OLD.production_system
    OR NEW.demand_source IS DISTINCT FROM OLD.demand_source
    OR NEW.requested_quantity IS DISTINCT FROM OLD.requested_quantity
    OR NEW.part_number_snapshot IS DISTINCT FROM OLD.part_number_snapshot
    OR NEW.part_name_snapshot IS DISTINCT FROM OLD.part_name_snapshot
    OR NEW.part_revision_snapshot IS DISTINCT FROM OLD.part_revision_snapshot
    OR NEW.department_id_snapshot IS DISTINCT FROM OLD.department_id_snapshot
    OR NEW.department_name_snapshot IS DISTINCT FROM OLD.department_name_snapshot
    OR NEW.readiness_snapshot IS DISTINCT FROM OLD.readiness_snapshot
    OR NEW.readiness_checksum IS DISTINCT FROM OLD.readiness_checksum
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
  THEN RAISE EXCEPTION 'Stock-build request authority snapshots are immutable'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_build_request_identity_immutable ON stock_build_requests;
CREATE TRIGGER stock_build_request_identity_immutable
  BEFORE UPDATE ON stock_build_requests FOR EACH ROW
  EXECUTE FUNCTION stock_build_request_identity_immutable();

CREATE OR REPLACE FUNCTION stock_build_request_event_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Stock-build request events are append-only'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_build_request_event_immutable ON stock_build_request_events;
CREATE TRIGGER stock_build_request_event_immutable
  BEFORE UPDATE OR DELETE ON stock_build_request_events FOR EACH ROW
  EXECUTE FUNCTION stock_build_request_event_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('manufacturing.stock_build.view','View P1/P2 stock-build requests and readiness','inventory'),
 ('manufacturing.stock_build.create','Create controlled P1/P2 stock-build drafts','inventory'),
 ('manufacturing.stock_build.release','Release controlled P1/P2 stock-build requests','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER') AND c.key IN (
  'manufacturing.stock_build.view','manufacturing.stock_build.create','manufacturing.stock_build.release'
)
ON CONFLICT DO NOTHING;
