-- Phase 9A: additive p2_v2 Production evidence, holds, and completion review.
-- Authoritative manufacturing records remain in their existing tables. This
-- migration stores only controlled links and immutable review snapshots.

CREATE UNIQUE INDEX IF NOT EXISTS project_production_launches_id_project_unique
  ON project_production_launches(id, project_id);

CREATE TABLE IF NOT EXISTS project_production_stage_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  production_launch_id UUID NOT NULL,
  production_release_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','BLOCKED','READY_FOR_COMPLETION_REVIEW',
      'PENDING_APPROVAL','COMPLETE','STALE','INVALIDATED','SUPERSEDED')),
  production_plan_revision INTEGER NOT NULL,
  wad_revision INTEGER NOT NULL,
  configuration_baseline_id TEXT NOT NULL,
  effectivity_reference TEXT NOT NULL,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_by_display_name TEXT,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  superseded_at TIMESTAMP,
  superseded_by_review_id UUID REFERENCES project_production_stage_reviews(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (production_launch_id, project_id)
    REFERENCES project_production_launches(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (production_release_id, project_id)
    REFERENCES project_production_releases(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_production_stage_current_unique
  ON project_production_stage_reviews(project_id, workflow_instance_id)
  WHERE status IN ('IN_PROGRESS','BLOCKED','READY_FOR_COMPLETION_REVIEW','PENDING_APPROVAL');
CREATE INDEX IF NOT EXISTS project_production_stage_history_idx
  ON project_production_stage_reviews(project_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS project_production_evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  production_stage_review_id UUID NOT NULL REFERENCES project_production_stage_reviews(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  record_revision TEXT,
  quantity NUMERIC,
  effectivity_reference TEXT,
  authoritative BOOLEAN NOT NULL DEFAULT true,
  linked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_by_display_name TEXT NOT NULL,
  linked_at TIMESTAMP NOT NULL DEFAULT now(),
  superseded_at TIMESTAMP,
  supersession_reason TEXT,
  UNIQUE (production_stage_review_id, record_type, record_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS project_production_evidence_project_idx
  ON project_production_evidence_links(project_id, record_type);

CREATE TABLE IF NOT EXISTS project_production_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  production_stage_review_id UUID NOT NULL REFERENCES project_production_stage_reviews(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_record_id TEXT,
  affected_part_number TEXT,
  affected_quantity NUMERIC,
  required_disposition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','SUPERSEDED')),
  placed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  placed_by_display_name TEXT NOT NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT now(),
  release_authorized_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  release_authorized_by_display_name TEXT,
  release_reason TEXT,
  released_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS project_production_holds_active_idx
  ON project_production_holds(project_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS project_production_stage_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  production_stage_review_id UUID NOT NULL REFERENCES project_production_stage_reviews(id) ON DELETE RESTRICT,
  production_stage_revision INTEGER NOT NULL,
  approval_type TEXT NOT NULL CHECK (approval_type IN
    ('OPERATIONS','QUALITY','PROJECT_MANAGEMENT','MANUFACTURING_ENGINEERING')),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  signature_meaning TEXT NOT NULL,
  reason TEXT,
  evidence_snapshot_hash TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_employee_id INTEGER,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT now(),
  superseded_at TIMESTAMP,
  UNIQUE (production_stage_review_id, approval_type)
);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.production_stage.manage','Recalculate, submit, and complete P2 V2 Production evidence','operations'),
 ('projects.production_stage.hold','Place controlled P2 V2 Production holds','operations'),
 ('projects.production_stage.release_hold','Authorize release of controlled P2 V2 Production holds','quality'),
 ('projects.production_stage.operations_decide','Approve P2 V2 Production completion for Operations','operations'),
 ('projects.production_stage.quality_decide','Approve P2 V2 Production completion for Quality','quality'),
 ('projects.production_stage.pm_decide','Approve P2 V2 Production completion for Project Management','projects'),
 ('projects.production_stage.engineering_decide','Approve conditional P2 V2 Production completion for Manufacturing Engineering','engineering')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key LIKE 'projects.production_stage.%') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER')
   AND pc.key IN ('projects.production_stage.manage','projects.production_stage.hold',
     'projects.production_stage.operations_decide')) OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER')
   AND pc.key IN ('projects.production_stage.release_hold','projects.production_stage.quality_decide')) OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND pc.key='projects.production_stage.pm_decide') OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER','MANUFACTURING_ENGINEERING')
   AND pc.key='projects.production_stage.engineering_decide')
) ON CONFLICT (role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_completed_production_stage_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'COMPLETE' AND (
    NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot OR
    NEW.blockers IS DISTINCT FROM OLD.blockers OR
    NEW.warnings IS DISTINCT FROM OLD.warnings OR
    NEW.exceptions IS DISTINCT FROM OLD.exceptions OR
    NEW.configuration_baseline_id IS DISTINCT FROM OLD.configuration_baseline_id OR
    NEW.effectivity_reference IS DISTINCT FROM OLD.effectivity_reference
  ) THEN
    RAISE EXCEPTION 'Completed Production-stage evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_completed_production_stage_snapshot_trigger
  ON project_production_stage_reviews;
CREATE TRIGGER protect_completed_production_stage_snapshot_trigger
BEFORE UPDATE ON project_production_stage_reviews
FOR EACH ROW EXECUTE FUNCTION protect_completed_production_stage_snapshot();
