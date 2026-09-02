-- Controlled planner selection of one combined-process recommendation per released baseline.
-- Selection is advisory and does not create or mutate production work orders.

CREATE TABLE IF NOT EXISTS combined_manufacturing_process_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  frozen_demand_baseline_id UUID NOT NULL REFERENCES p2_frozen_production_demand_baselines(id) ON DELETE RESTRICT,
  process_id UUID NOT NULL REFERENCES combined_manufacturing_processes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'SELECTED' CHECK (status IN ('SELECTED','WITHDRAWN')),
  baseline_checksum TEXT NOT NULL,
  recommended_runs INTEGER NOT NULL CHECK (recommended_runs > 0),
  recommendation_snapshot JSONB NOT NULL,
  selection_reason TEXT NOT NULL,
  selected_by_user_id INTEGER NOT NULL,
  selected_by_display_name TEXT NOT NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_by_user_id INTEGER,
  withdrawn_by_display_name TEXT,
  withdrawn_reason TEXT,
  withdrawn_at TIMESTAMPTZ,
  CHECK ((status='SELECTED' AND withdrawn_at IS NULL) OR
         (status='WITHDRAWN' AND withdrawn_at IS NOT NULL AND length(trim(withdrawn_reason)) > 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS combined_mfg_one_selected_plan_per_baseline_uidx
  ON combined_manufacturing_process_selections(frozen_demand_baseline_id)
  WHERE status='SELECTED';
CREATE INDEX IF NOT EXISTS combined_mfg_selection_project_idx
  ON combined_manufacturing_process_selections(project_id, frozen_demand_baseline_id, selected_at DESC);

CREATE TABLE IF NOT EXISTS combined_manufacturing_process_selection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id UUID NOT NULL REFERENCES combined_manufacturing_process_selections(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('SELECTED','WITHDRAWN')),
  actor_user_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('manufacturing.combined_processes.plan','Select or withdraw a combined manufacturing process planning decision','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','PROJECT_MANAGER','PROGRAM_MANAGER')
  AND c.key='manufacturing.combined_processes.plan'
ON CONFLICT DO NOTHING;
