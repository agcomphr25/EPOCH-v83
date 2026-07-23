-- Phase 8C: revision-controlled p2_v2 preproduction readiness and the
-- separate Production Release / Production Launch evidence records.
-- No existing project or production record is backfilled or changed.
CREATE TABLE IF NOT EXISTS project_preproduction_readiness_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','COMPLETE','REJECTED','STALE','INVALIDATED','SUPERSEDED')),
  readiness_state TEXT NOT NULL DEFAULT 'NOT_READY'
    CHECK (readiness_state IN ('READY','NOT_READY','BLOCKED','STALE')),
  source_stage_revisions JSONB NOT NULL DEFAULT '{}'::jsonb,
  checklist_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks_and_controls JSONB NOT NULL DEFAULT '[]'::jsonb,
  supply_chain_required BOOLEAN NOT NULL DEFAULT false,
  finance_required BOOLEAN NOT NULL DEFAULT false,
  effectivity_reference TEXT NOT NULL,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  superseded_at TIMESTAMP,
  superseded_by_review_id UUID REFERENCES project_preproduction_readiness_reviews(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_preproduction_current_unique
  ON project_preproduction_readiness_reviews(project_id, workflow_instance_id)
  WHERE status IN ('DRAFT','PENDING_APPROVAL','COMPLETE');
CREATE INDEX IF NOT EXISTS project_preproduction_history_idx
  ON project_preproduction_readiness_reviews(project_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS project_production_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  readiness_review_id UUID NOT NULL REFERENCES project_preproduction_readiness_reviews(id) ON DELETE RESTRICT,
  readiness_revision INTEGER NOT NULL,
  wad_authorization_id UUID NOT NULL REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT,
  wad_revision INTEGER NOT NULL,
  production_plan_id UUID NOT NULL REFERENCES project_production_plans(id) ON DELETE RESTRICT,
  production_plan_revision INTEGER NOT NULL,
  configuration_baseline_id TEXT NOT NULL,
  effectivity_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED'
    CHECK (status IN ('APPROVED','INVALIDATED','SUPERSEDED')),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by_display_name TEXT NOT NULL,
  approved_at TIMESTAMP NOT NULL DEFAULT now(),
  evidence_snapshot JSONB NOT NULL,
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, readiness_review_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_production_release_current_unique
  ON project_production_releases(project_id)
  WHERE status='APPROVED';

CREATE TABLE IF NOT EXISTS project_production_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  production_release_id UUID NOT NULL REFERENCES project_production_releases(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETE','FAILED')),
  production_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  launched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  launched_by_display_name TEXT NOT NULL,
  launched_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_production_launch_complete_unique
  ON project_production_launches(project_id) WHERE status='COMPLETE';

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.preproduction.manage','Draft, submit, complete and revise P2 V2 preproduction readiness','projects'),
 ('projects.preproduction.pm_decide','Approve P2 V2 readiness for Project Management','projects'),
 ('projects.preproduction.engineering_decide','Approve P2 V2 readiness for Engineering','engineering'),
 ('projects.preproduction.quality_decide','Approve P2 V2 readiness for Quality','quality'),
 ('projects.preproduction.operations_decide','Approve P2 V2 readiness for Operations','operations'),
 ('projects.preproduction.supply_chain_decide','Approve conditional supply-chain readiness','procurement'),
 ('projects.preproduction.finance_decide','Approve conditional commercial finance readiness','finance'),
 ('projects.production_release.approve','Approve a P2 V2 project for production release','projects'),
 ('projects.production_launch.launch','Launch an approved P2 V2 project into production','operations')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND (pc.key LIKE 'projects.preproduction.%' OR pc.key LIKE 'projects.production_%')) OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND pc.key IN ('projects.preproduction.manage','projects.preproduction.pm_decide','projects.production_release.approve')) OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER','MANUFACTURING_ENGINEERING') AND pc.key='projects.preproduction.engineering_decide') OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.preproduction.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER') AND pc.key IN ('projects.preproduction.operations_decide','projects.production_launch.launch')) OR
 (pr.name IN ('PROCUREMENT','PURCHASING','SUPPLY_CHAIN','SUPPLY_CHAIN_MANAGER') AND pc.key='projects.preproduction.supply_chain_decide') OR
 (pr.name IN ('FINANCE','ACCOUNTING','CONTROLLER') AND pc.key='projects.preproduction.finance_decide')
) ON CONFLICT (role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_preproduction_completed_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('DRAFT','PENDING_APPROVAL') AND (
    NEW.source_stage_revisions IS DISTINCT FROM OLD.source_stage_revisions OR
    NEW.checklist_snapshot IS DISTINCT FROM OLD.checklist_snapshot OR
    NEW.exceptions IS DISTINCT FROM OLD.exceptions OR
    NEW.risks_and_controls IS DISTINCT FROM OLD.risks_and_controls OR
    NEW.effectivity_reference IS DISTINCT FROM OLD.effectivity_reference
  ) THEN RAISE EXCEPTION 'Completed preproduction readiness snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_preproduction_completed_snapshot_trigger
  ON project_preproduction_readiness_reviews;
CREATE TRIGGER protect_preproduction_completed_snapshot_trigger
BEFORE UPDATE ON project_preproduction_readiness_reviews
FOR EACH ROW EXECUTE FUNCTION protect_preproduction_completed_snapshot();
