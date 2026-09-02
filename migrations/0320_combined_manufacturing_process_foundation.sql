-- Combined manufacturing process authority and planning preview foundation.
-- Additive and prospective only. Existing inventory, BOM, demand, and work-order
-- records are not changed. Normal one-work-order-per-part generation remains the
-- default until a later, separately gated materialization phase is introduced.

CREATE TABLE IF NOT EXISTS combined_manufacturing_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  lead_department_id INTEGER NOT NULL REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  minimum_runs INTEGER NOT NULL DEFAULT 1 CHECK (minimum_runs > 0),
  maximum_runs INTEGER CHECK (maximum_runs IS NULL OR maximum_runs >= minimum_runs),
  setup_minutes INTEGER NOT NULL DEFAULT 0 CHECK (setup_minutes >= 0),
  cycle_minutes_per_run INTEGER NOT NULL DEFAULT 0 CHECK (cycle_minutes_per_run >= 0),
  allow_excess_output BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by_user_id INTEGER,
  approved_by_display_name TEXT,
  approved_at TIMESTAMPTZ,
  UNIQUE(process_code, revision)
);
CREATE INDEX IF NOT EXISTS combined_mfg_process_status_idx
  ON combined_manufacturing_processes(status, lead_department_id);

CREATE TABLE IF NOT EXISTS combined_manufacturing_process_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES combined_manufacturing_processes(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_per_run NUMERIC(18,6) NOT NULL CHECK (quantity_per_run > 0),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(process_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS combined_mfg_output_item_idx
  ON combined_manufacturing_process_outputs(inventory_item_id, process_id);
CREATE UNIQUE INDEX IF NOT EXISTS combined_mfg_one_primary_output_uidx
  ON combined_manufacturing_process_outputs(process_id)
  WHERE is_primary=true;

CREATE TABLE IF NOT EXISTS combined_manufacturing_process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES combined_manufacturing_processes(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','UPDATED','APPROVED','RETIRED')),
  actor_user_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION combined_mfg_approved_process_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('APPROVED','RETIRED') AND (
    NEW.process_code IS DISTINCT FROM OLD.process_code OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.lead_department_id IS DISTINCT FROM OLD.lead_department_id OR
    NEW.revision IS DISTINCT FROM OLD.revision OR
    NEW.minimum_runs IS DISTINCT FROM OLD.minimum_runs OR
    NEW.maximum_runs IS DISTINCT FROM OLD.maximum_runs OR
    NEW.setup_minutes IS DISTINCT FROM OLD.setup_minutes OR
    NEW.cycle_minutes_per_run IS DISTINCT FROM OLD.cycle_minutes_per_run OR
    NEW.allow_excess_output IS DISTINCT FROM OLD.allow_excess_output
  ) THEN
    RAISE EXCEPTION 'Approved combined manufacturing process definitions are immutable; create a new revision';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS combined_mfg_approved_process_immutable ON combined_manufacturing_processes;
CREATE TRIGGER combined_mfg_approved_process_immutable
  BEFORE UPDATE ON combined_manufacturing_processes
  FOR EACH ROW EXECUTE FUNCTION combined_mfg_approved_process_immutable();

CREATE OR REPLACE FUNCTION combined_mfg_approved_outputs_immutable() RETURNS trigger AS $$
DECLARE current_status TEXT;
BEGIN
  SELECT status INTO current_status
  FROM combined_manufacturing_processes
  WHERE id=COALESCE(NEW.process_id, OLD.process_id);
  IF current_status IN ('APPROVED','RETIRED') THEN
    RAISE EXCEPTION 'Approved combined manufacturing process outputs are immutable; create a new revision';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS combined_mfg_approved_outputs_immutable ON combined_manufacturing_process_outputs;
CREATE TRIGGER combined_mfg_approved_outputs_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON combined_manufacturing_process_outputs
  FOR EACH ROW EXECUTE FUNCTION combined_mfg_approved_outputs_immutable();

CREATE OR REPLACE FUNCTION combined_mfg_validate_approval() RETURNS trigger AS $$
DECLARE output_count INTEGER;
DECLARE primary_count INTEGER;
BEGIN
  IF NEW.status='APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
    SELECT count(*)::int,count(*) FILTER (WHERE is_primary)::int
      INTO output_count,primary_count
    FROM combined_manufacturing_process_outputs
    WHERE process_id=NEW.id;
    IF output_count < 2 OR primary_count <> 1 THEN
      RAISE EXCEPTION 'Combined manufacturing process approval requires at least two outputs and exactly one primary output';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS combined_mfg_validate_approval ON combined_manufacturing_processes;
CREATE TRIGGER combined_mfg_validate_approval
  BEFORE UPDATE OF status ON combined_manufacturing_processes
  FOR EACH ROW EXECUTE FUNCTION combined_mfg_validate_approval();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('manufacturing.combined_processes.view','View combined manufacturing process definitions and recommendations','inventory'),
 ('manufacturing.combined_processes.manage','Create and revise draft combined manufacturing processes','inventory'),
 ('manufacturing.combined_processes.approve','Approve controlled combined manufacturing process revisions','inventory')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN (
   'manufacturing.combined_processes.view',
   'manufacturing.combined_processes.manage',
   'manufacturing.combined_processes.approve'
 )) OR
 (r.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER','MANAGER','SUPERVISOR')
   AND c.key='manufacturing.combined_processes.view')
ON CONFLICT DO NOTHING;
