CREATE TABLE IF NOT EXISTS project_production_serialized_unit_travelers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  serialized_unit_link_id UUID NOT NULL REFERENCES project_production_demand_serialized_units(id) ON DELETE RESTRICT,
  traveler_id VARCHAR(255) NOT NULL REFERENCES travelers(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (serialized_unit_link_id),
  UNIQUE (traveler_id)
);

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
