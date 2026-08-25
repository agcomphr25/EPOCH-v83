-- Add an auditable identity bridge from root Production Launch demand to the
-- customer serialized units allocated for its exact P2 production order.
-- Older schema baselines may predate the composite constraint declared by
-- migration 0264. The primary key already guarantees id uniqueness; this
-- index makes the project-scoped identity explicit and supports the FK below.
CREATE UNIQUE INDEX IF NOT EXISTS project_production_demands_id_project_unique_idx
  ON project_production_demands(id,project_id);

CREATE TABLE IF NOT EXISTS project_production_demand_serialized_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  demand_id UUID NOT NULL,
  p2_production_order_id INTEGER NOT NULL REFERENCES p2_production_orders(id) ON DELETE RESTRICT,
  serialized_item_id UUID NOT NULL REFERENCES p2_serialized_items(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (demand_id,project_id)
    REFERENCES project_production_demands(id,project_id) ON DELETE RESTRICT,
  UNIQUE (serialized_item_id),
  UNIQUE (demand_id,serialized_item_id)
);

CREATE INDEX IF NOT EXISTS project_production_demand_serialized_units_demand_idx
  ON project_production_demand_serialized_units(demand_id,p2_production_order_id);

ALTER TABLE project_production_launch_events
  DROP CONSTRAINT IF EXISTS project_production_launch_events_event_type_check;

ALTER TABLE project_production_launch_events
  ADD CONSTRAINT project_production_launch_events_event_type_check
  CHECK (event_type IN (
    'RECURSIVE_DEMAND_GRAPH_PERSISTED',
    'EXECUTION_AUTHORIZED',
    'P2_PRODUCTION_ORDERS_PROVISIONED',
    'P2_SERIALIZED_UNITS_PROVISIONED',
    'P2_DRAFT_TRAVELERS_PROVISIONED',
    'P2_WORK_ORDERS_PROVISIONED',
    'P2_COMPONENT_TRAVELERS_PROVISIONED'
  ));
