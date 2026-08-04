-- Prospective-only P2 V2 definition v3 handoff evidence.
-- Definition snapshots live on workflow instances; this migration does not
-- update, relabel, reorder, or backfill any existing workflow record.

CREATE TABLE IF NOT EXISTS project_p2_control_center_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  production_release_id UUID NOT NULL REFERENCES project_production_releases(id) ON DELETE RESTRICT,
  customer_po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  definition_version INTEGER NOT NULL CHECK (definition_version = 3),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RELEASED' CHECK (status IN ('RELEASED','INVALIDATED')),
  approval_evidence_snapshot JSONB NOT NULL,
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_display_name TEXT NOT NULL,
  released_by_role TEXT NOT NULL,
  signature_meaning TEXT NOT NULL,
  released_at TIMESTAMP NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_p2_control_center_release_current_unique
  ON project_p2_control_center_releases(project_id) WHERE status='RELEASED';
CREATE INDEX IF NOT EXISTS project_p2_control_center_release_po_idx
  ON project_p2_control_center_releases(customer_po_id, released_at DESC);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.p2_handoff.release','Release an approved P2 V2 order to the authoritative P2 Control Center','operations')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON
  pc.key='projects.p2_handoff.release' AND
  pr.name IN ('ADMIN','OWNER','OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER')
ON CONFLICT (role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_p2_control_center_release_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id OR
     NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id OR
     NEW.workflow_step_instance_id IS DISTINCT FROM OLD.workflow_step_instance_id OR
     NEW.production_release_id IS DISTINCT FROM OLD.production_release_id OR
     NEW.customer_po_id IS DISTINCT FROM OLD.customer_po_id OR
     NEW.definition_version IS DISTINCT FROM OLD.definition_version OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.request_hash IS DISTINCT FROM OLD.request_hash OR
     NEW.approval_evidence_snapshot IS DISTINCT FROM OLD.approval_evidence_snapshot OR
     NEW.released_by IS DISTINCT FROM OLD.released_by OR
     NEW.released_by_display_name IS DISTINCT FROM OLD.released_by_display_name OR
     NEW.released_by_role IS DISTINCT FROM OLD.released_by_role OR
     NEW.signature_meaning IS DISTINCT FROM OLD.signature_meaning OR
     NEW.released_at IS DISTINCT FROM OLD.released_at
  THEN RAISE EXCEPTION 'P2 Control Center release evidence is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_p2_control_center_release_evidence_trigger
  ON project_p2_control_center_releases;
CREATE TRIGGER protect_p2_control_center_release_evidence_trigger
BEFORE UPDATE ON project_p2_control_center_releases
FOR EACH ROW EXECUTE FUNCTION protect_p2_control_center_release_evidence();
