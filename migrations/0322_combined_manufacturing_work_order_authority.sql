-- Materialize a selected combined-process plan as one schedulable work order.
-- Existing one-work-order-per-demand-node authorities remain unchanged.

CREATE TABLE IF NOT EXISTS combined_manufacturing_work_order_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id UUID NOT NULL UNIQUE REFERENCES combined_manufacturing_process_selections(id) ON DELETE RESTRICT,
  production_work_order_id UUID NOT NULL UNIQUE REFERENCES production_work_orders(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  frozen_demand_baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  process_id UUID NOT NULL REFERENCES combined_manufacturing_processes(id) ON DELETE RESTRICT,
  planned_runs INTEGER NOT NULL CHECK (planned_runs > 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','CANCELLED')),
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  materialized_by_user_id INTEGER NOT NULL,
  materialized_by_display_name TEXT NOT NULL,
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combined_manufacturing_work_order_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combined_authority_id UUID NOT NULL REFERENCES combined_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  part_number_snapshot TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL,
  quantity_per_run NUMERIC(18,6) NOT NULL CHECK (quantity_per_run > 0),
  required_quantity NUMERIC(18,6) NOT NULL CHECK (required_quantity >= 0),
  planned_quantity NUMERIC(18,6) NOT NULL CHECK (planned_quantity > 0),
  excess_quantity NUMERIC(18,6) NOT NULL CHECK (excess_quantity >= 0),
  demand_node_ids JSONB NOT NULL,
  UNIQUE(combined_authority_id,inventory_item_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS combined_mwo_one_primary_output_uidx
  ON combined_manufacturing_work_order_outputs(combined_authority_id) WHERE is_primary=true;

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('manufacturing.combined_processes.materialize','Materialize a selected combined-process plan as one production work order','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER') AND c.key='manufacturing.combined_processes.materialize'
ON CONFLICT DO NOTHING;
