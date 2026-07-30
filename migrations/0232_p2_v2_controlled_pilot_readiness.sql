-- Phase 10B: controlled p2_v2 pilot readiness and operational acceptance.
-- Additive only. Pilot records reference authoritative P2 evidence; they do not
-- copy or rewrite legacy, Design Control, manufacturing, quality, or shipping data.

CREATE TABLE IF NOT EXISTS project_pilot_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_number TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  customer_po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  customer_po_number TEXT NOT NULL,
  approved_po_lines JSONB NOT NULL,
  approved_part_numbers JSONB NOT NULL,
  maximum_quantities JSONB NOT NULL,
  workflow_version TEXT NOT NULL CHECK (workflow_version='p2_v2'),
  definition_version INTEGER NOT NULL CHECK (definition_version=2),
  configuration_baseline_revision TEXT NOT NULL,
  production_plan_revision INTEGER NOT NULL CHECK (production_plan_revision > 0),
  wad_revision INTEGER NOT NULL CHECK (wad_revision > 0),
  authorized_participants JSONB NOT NULL,
  quality_approver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operations_approver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_management_approver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rollout_owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pilot_start_date DATE NOT NULL,
  review_expires_at TIMESTAMPTZ NOT NULL,
  rollback_owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rollback_plan_reference TEXT NOT NULL,
  risks_and_mitigations JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','PENDING_READINESS','PENDING_APPROVAL','AUTHORIZED','ACTIVE',
     'PAUSED','COMPLETED','CANCELLED','EXPIRED')),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  revision_number INTEGER NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  scope_hash TEXT NOT NULL,
  approved_scope_hash TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (id, project_id),
  UNIQUE (project_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_pilot_one_current_per_project
  ON project_pilot_authorizations(project_id)
  WHERE status NOT IN ('COMPLETED','CANCELLED','EXPIRED');
CREATE INDEX IF NOT EXISTS project_pilot_environment_status_idx
  ON project_pilot_authorizations(environment,status,review_expires_at);

CREATE TABLE IF NOT EXISTS project_pilot_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  authorization_revision INTEGER NOT NULL,
  approval_type TEXT NOT NULL CHECK (approval_type IN
    ('QUALITY','OPERATIONS','PROJECT_MANAGEMENT','ROLLOUT_OWNER')),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  signature_meaning TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id INTEGER,
  actor_role TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_authorization_id,authorization_revision,approval_type),
  UNIQUE (pilot_authorization_id,authorization_revision,actor_user_id)
);

CREATE TABLE IF NOT EXISTS project_pilot_training_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  functional_role TEXT NOT NULL,
  training_version TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  trainer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acknowledgment_meaning TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  topics JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_authorization_id,user_id,functional_role,training_version)
);

CREATE TABLE IF NOT EXISTS project_pilot_readiness_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  checklist_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CURRENT','MISSING','STALE','REJECTED','SUPERSEDED','INCONSISTENT')),
  authoritative_record_type TEXT NOT NULL,
  authoritative_record_id TEXT NOT NULL,
  authoritative_revision TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  responsible_function TEXT NOT NULL,
  correction_location TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_authorization_id,checklist_key)
);

CREATE TABLE IF NOT EXISTS project_pilot_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number TEXT NOT NULL UNIQUE,
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  workflow_stage TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL','MAJOR','MINOR')),
  category TEXT NOT NULL CHECK (category IN
    ('COMPLIANCE_PRODUCT_SAFETY','WORKFLOW_BLOCKER','USABILITY','TRAINING',
     'DATA_CONFIGURATION','EXISTING_UNRELATED_DEFECT')),
  description TEXT NOT NULL,
  affected_record_type TEXT NOT NULL,
  affected_record_id TEXT NOT NULL,
  affected_revision TEXT NOT NULL,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  containment TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  root_cause TEXT,
  corrective_action TEXT,
  retest_evidence TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONTAINED','PENDING_RETEST','CLOSED')),
  closure_approved_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  closure_approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS project_pilot_blocking_issue_idx
  ON project_pilot_issues(pilot_authorization_id,severity,status);

CREATE TABLE IF NOT EXISTS project_pilot_evidence_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  authoritative_record_type TEXT NOT NULL,
  authoritative_record_id TEXT NOT NULL,
  authoritative_revision TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  immutable_hash TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_authorization_id,category,authoritative_record_type,authoritative_record_id,authoritative_revision)
);

CREATE TABLE IF NOT EXISTS project_pilot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_authorization_id UUID NOT NULL REFERENCES project_pilot_authorizations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  authorization_revision INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  meaning TEXT NOT NULL,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilot_authorization_id,idempotency_key)
);

CREATE OR REPLACE FUNCTION protect_project_pilot_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('epoch.pilot_transition',true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Pilot status changes require the controlled transition service';
  END IF;
  IF OLD.status IN ('AUTHORIZED','ACTIVE','PAUSED','COMPLETED')
     AND (NEW.environment IS DISTINCT FROM OLD.environment
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id
       OR NEW.customer_po_id IS DISTINCT FROM OLD.customer_po_id
       OR NEW.approved_po_lines IS DISTINCT FROM OLD.approved_po_lines
       OR NEW.approved_part_numbers IS DISTINCT FROM OLD.approved_part_numbers
       OR NEW.maximum_quantities IS DISTINCT FROM OLD.maximum_quantities
       OR NEW.configuration_baseline_revision IS DISTINCT FROM OLD.configuration_baseline_revision
       OR NEW.production_plan_revision IS DISTINCT FROM OLD.production_plan_revision
       OR NEW.wad_revision IS DISTINCT FROM OLD.wad_revision
       OR NEW.authorized_participants IS DISTINCT FROM OLD.authorized_participants) THEN
    RAISE EXCEPTION 'Approved pilot scope is immutable; create a revised authorization';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_project_pilot_status_trigger ON project_pilot_authorizations;
CREATE TRIGGER protect_project_pilot_status_trigger
BEFORE UPDATE ON project_pilot_authorizations
FOR EACH ROW EXECUTE FUNCTION protect_project_pilot_status();

INSERT INTO perm_capabilities (key,description,category) VALUES
 ('projects.pilot_v2.view','View controlled P2 V2 pilot readiness','projects'),
 ('projects.pilot_v2.manage','Create and manage controlled P2 V2 pilot authorization drafts','projects'),
 ('projects.pilot_v2.quality_approve','Approve a P2 V2 pilot as Quality authority','quality'),
 ('projects.pilot_v2.operations_approve','Approve a P2 V2 pilot as Operations authority','operations'),
 ('projects.pilot_v2.pm_approve','Approve a P2 V2 pilot as Project Management authority','projects'),
 ('projects.pilot_v2.rollout_approve','Approve and activate a P2 V2 pilot as rollout owner','admin'),
 ('projects.pilot_v2.issue_manage','Record and resolve controlled pilot issues','quality'),
 ('projects.pilot_v2.training_record','Link authoritative pilot training acknowledgments','training')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id,capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON
  (pr.name IN ('ADMIN','OWNER') AND pc.key LIKE 'projects.pilot_v2.%')
  OR (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key IN
    ('projects.pilot_v2.view','projects.pilot_v2.quality_approve','projects.pilot_v2.issue_manage'))
  OR (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER') AND pc.key IN
    ('projects.pilot_v2.view','projects.pilot_v2.operations_approve'))
  OR (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND pc.key IN
    ('projects.pilot_v2.view','projects.pilot_v2.manage','projects.pilot_v2.pm_approve'))
ON CONFLICT (role_id,capability_id) DO NOTHING;
