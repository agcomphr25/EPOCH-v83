-- Admit the first controlled floor-provisioning event while retaining the
-- closed Production Launch event vocabulary.
ALTER TABLE project_production_launch_events
  DROP CONSTRAINT IF EXISTS project_production_launch_events_event_type_check;

ALTER TABLE project_production_launch_events
  ADD CONSTRAINT project_production_launch_events_event_type_check
  CHECK (event_type IN (
    'RECURSIVE_DEMAND_GRAPH_PERSISTED',
    'EXECUTION_AUTHORIZED',
    'P2_PRODUCTION_ORDERS_PROVISIONED'
  ));
