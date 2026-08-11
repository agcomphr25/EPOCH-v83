-- P2 customer-demand identity and quantity-event foundation.
-- Existing rows receive independent opaque identities. Historical revision
-- relationships are intentionally not inferred.
ALTER TABLE p2_purchase_order_items
  ADD COLUMN IF NOT EXISTS demand_line_identity UUID;

UPDATE p2_purchase_order_items
SET demand_line_identity = gen_random_uuid()
WHERE demand_line_identity IS NULL;

ALTER TABLE p2_purchase_order_items
  ALTER COLUMN demand_line_identity SET DEFAULT gen_random_uuid(),
  ALTER COLUMN demand_line_identity SET NOT NULL;

CREATE INDEX IF NOT EXISTS p2_po_items_demand_identity_idx
  ON p2_purchase_order_items(demand_line_identity);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='p2_po_items_id_demand_identity_unique') THEN
    ALTER TABLE p2_purchase_order_items ADD CONSTRAINT p2_po_items_id_demand_identity_unique
      UNIQUE (id,demand_line_identity);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS p2_customer_demand_quantity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  -- Keep these columns in composite-FK order for schema-diff generators.
  po_item_id INTEGER NOT NULL REFERENCES p2_purchase_order_items(id) ON DELETE RESTRICT,
  demand_line_identity UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CUSTOMER_CANCELLATION','CUSTOMER_REINSTATEMENT','QUANTITY_CORRECTION',
    'SCOPE_INCREASE','SCOPE_DECREASE','LINE_SUPERSESSION','REPLACEMENT_DEMAND'
  )),
  quantity_delta NUMERIC(18,6) NOT NULL CHECK (quantity_delta <> 0),
  unit_of_measure TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_evidence_reference TEXT,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  prior_event_hash TEXT,
  event_hash TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_display_name TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT p2_demand_event_identity_item_check
    CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT p2_demand_event_idempotency_unique
    UNIQUE (demand_line_identity, idempotency_key),
  CONSTRAINT p2_demand_event_hash_unique UNIQUE (event_hash)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='p2_demand_event_item_identity_fk') THEN
    ALTER TABLE p2_customer_demand_quantity_events
      ADD CONSTRAINT p2_demand_event_item_identity_fk
      FOREIGN KEY (po_item_id,demand_line_identity)
      REFERENCES p2_purchase_order_items(id,demand_line_identity) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS p2_demand_events_identity_time_idx
  ON p2_customer_demand_quantity_events(demand_line_identity, effective_at, id);

CREATE OR REPLACE FUNCTION prevent_p2_demand_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'P2 customer-demand quantity events are immutable';
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p2_demand_events_immutable') THEN
    CREATE TRIGGER p2_demand_events_immutable
    BEFORE UPDATE OR DELETE ON p2_customer_demand_quantity_events
    FOR EACH ROW EXECUTE FUNCTION prevent_p2_demand_event_mutation();
  END IF;
END $$;

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.p2_demand_quantity.view',
  'View controlled P2 customer-demand quantity history','projects'),
 ('projects.p2_demand_quantity.change',
  'Record controlled P2 customer-demand quantity changes','projects')
ON CONFLICT (key) DO UPDATE
SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role CROSS JOIN perm_capabilities capability
WHERE (role.name IN ('ADMIN','OWNER','MANAGER','PROJECT_MANAGER')
       AND capability.key IN ('projects.p2_demand_quantity.view','projects.p2_demand_quantity.change'))
   OR (role.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','ENGINEERING','QUALITY')
       AND capability.key='projects.p2_demand_quantity.view')
ON CONFLICT (role_id, capability_id) DO NOTHING;
