-- Transactional persistence controls for recursive P2 Production Launch evidence.
-- Planning evidence only: no execution, purchasing, inventory movement, or stage changes.

ALTER TABLE project_production_launches
  ADD COLUMN IF NOT EXISTS workflow_instance_id UUID,
  ADD COLUMN IF NOT EXISTS configuration_baseline_id TEXT,
  ADD COLUMN IF NOT EXISTS production_plan_id UUID,
  ADD COLUMN IF NOT EXISTS wad_authorization_id UUID,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS preview_digest TEXT,
  ADD COLUMN IF NOT EXISTS evidence_digest TEXT,
  ADD COLUMN IF NOT EXISTS signature_meaning TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_workflow_project_fk') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_workflow_project_fk
      FOREIGN KEY (workflow_instance_id,project_id) REFERENCES project_workflow_instances(id,project_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_plan_fk') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_plan_fk
      FOREIGN KEY (production_plan_id) REFERENCES project_production_plans(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_wad_fk') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_wad_fk
      FOREIGN KEY (wad_authorization_id) REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_request_hash_check') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_request_hash_check
      CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_preview_digest_check') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_preview_digest_check
      CHECK (preview_digest IS NULL OR preview_digest ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_production_launches_evidence_digest_check') THEN
    ALTER TABLE project_production_launches ADD CONSTRAINT project_production_launches_evidence_digest_check
      CHECK (evidence_digest IS NULL OR evidence_digest ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_production_launches_baseline_idempotency_unique
  ON project_production_launches(project_id,configuration_baseline_id,idempotency_key)
  WHERE configuration_baseline_id IS NOT NULL;

-- Align the recursive demand evidence with the controlled classifications
-- introduced by migration 0265 without rewriting historical rows.
ALTER TABLE project_production_demands
  DROP CONSTRAINT IF EXISTS project_production_demands_classification_check;
ALTER TABLE project_production_demands
  ADD CONSTRAINT project_production_demands_classification_check CHECK (classification IN (
    'PACKET','KIT','MACHINED_PART','CORE','SUB_ASSEMBLY','ASSEMBLY',
    'FINAL_ASSEMBLY','COMPOSITE','COMPONENT','MANUFACTURED_COMPONENT',
    'PURCHASED_COMPONENT','RAW_MATERIAL','OUTSIDE_PROCESS','PHANTOM',
    'STOCK_SATISFIED','BLOCKED_UNRESOLVED','MANUFACTURED','PURCHASED','CUSTOMER_SUPPLIED'
  ));

CREATE TABLE IF NOT EXISTS project_production_launch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  production_launch_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type='RECURSIVE_DEMAND_GRAPH_PERSISTED'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  created_record_ids JSONB NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (production_launch_id,project_id)
    REFERENCES project_production_launches(id,project_id) ON DELETE RESTRICT,
  UNIQUE (production_launch_id,event_type)
);

CREATE OR REPLACE FUNCTION protect_project_production_launch_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Production Launch audit events are immutable';
END $$;
DROP TRIGGER IF EXISTS protect_project_production_launch_event_trigger ON project_production_launch_events;
CREATE TRIGGER protect_project_production_launch_event_trigger
BEFORE UPDATE OR DELETE ON project_production_launch_events
FOR EACH ROW EXECUTE FUNCTION protect_project_production_launch_event();
