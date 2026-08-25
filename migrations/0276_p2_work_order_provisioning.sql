ALTER TABLE project_production_demand_execution_links
  DROP CONSTRAINT IF EXISTS project_production_demand_execution_links_link_type_check;

ALTER TABLE project_production_demand_execution_links
  ADD CONSTRAINT project_production_demand_execution_links_link_type_check
  CHECK (link_type IN (
    'P2_PRODUCTION_ORDER','WAD','WORK_ORDER','TRAVELER','CNC_JOB',
    'MANUFACTURING_QUEUE','CUTTING_DEMAND'
  ));

ALTER TABLE project_production_launch_events
  DROP CONSTRAINT IF EXISTS project_production_launch_events_event_type_check;

ALTER TABLE project_production_launch_events
  ADD CONSTRAINT project_production_launch_events_event_type_check
  CHECK (event_type IN (
    'RECURSIVE_DEMAND_GRAPH_PERSISTED','EXECUTION_AUTHORIZED',
    'P2_PRODUCTION_ORDERS_PROVISIONED','P2_SERIALIZED_UNITS_PROVISIONED',
    'P2_DRAFT_TRAVELERS_PROVISIONED','P2_WORK_ORDERS_PROVISIONED',
    'P2_COMPONENT_TRAVELERS_PROVISIONED'
  ));
