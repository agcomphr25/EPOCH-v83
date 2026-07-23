-- Phase 8A: additive p2_v2 commercial-stage review revisions.
-- Authoritative RFQ, estimate, quote, PO and contract-review records remain unchanged.
CREATE TABLE IF NOT EXISTS project_commercial_stage_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  stage_type TEXT NOT NULL CHECK (stage_type IN ('rfq_risk_assessment','estimate_quote','contract_review')),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','COMPLETE','REJECTED','STALE','INVALIDATED','SUPERSEDED')),
  source_record_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_revision TEXT,
  source_updated_at TIMESTAMP,
  source_snapshot JSONB NOT NULL,
  requirements_snapshot JSONB NOT NULL,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  differences JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  unresolved_information_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
  sufficiently_defined BOOLEAN,
  differences_resolved BOOLEAN NOT NULL DEFAULT false,
  effectivity_reference TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  owner_display_name TEXT,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  superseded_at TIMESTAMP,
  superseded_by_review_id UUID REFERENCES project_commercial_stage_reviews(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT commercial_review_instance_project_fk FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT commercial_review_step_project_fk FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT commercial_review_revision_unique UNIQUE (project_id, workflow_instance_id, stage_type, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_commercial_reviews_current_unique
  ON project_commercial_stage_reviews(project_id, workflow_instance_id,stage_type)
  WHERE status IN ('DRAFT','PENDING_APPROVAL','APPROVED','COMPLETE');
CREATE INDEX IF NOT EXISTS project_commercial_reviews_project_idx
  ON project_commercial_stage_reviews(project_id,stage_type,revision_number DESC);

INSERT INTO perm_capabilities (key,description,category) VALUES
 ('projects.commercial_review.manage','Link, draft, submit and revise P2 V2 commercial reviews','projects'),
 ('projects.commercial_review.pm_decide','Record PM/Sales/Contracts commercial decisions','projects'),
 ('projects.commercial_review.engineering_decide','Record Engineering contract-review decisions','engineering'),
 ('projects.commercial_review.quality_decide','Record Quality contract-review decisions','quality'),
 ('projects.commercial_review.operations_decide','Record Operations contract-review decisions','operations'),
 ('projects.commercial_review.finance_decide','Record conditional Finance contract-review decisions','finance')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id,capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key LIKE 'projects.commercial_review.%') OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER','SALES','CONTRACTS') AND pc.key IN ('projects.commercial_review.manage','projects.commercial_review.pm_decide')) OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER') AND pc.key='projects.commercial_review.engineering_decide') OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.commercial_review.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER') AND pc.key='projects.commercial_review.operations_decide') OR
 (pr.name IN ('FINANCE','CONTROLLER') AND pc.key='projects.commercial_review.finance_decide')
) ON CONFLICT (role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_commercial_review_snapshots()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.source_record_type IS DISTINCT FROM OLD.source_record_type OR
    NEW.source_record_id IS DISTINCT FROM OLD.source_record_id OR
    NEW.source_revision IS DISTINCT FROM OLD.source_revision OR
    NEW.source_updated_at IS DISTINCT FROM OLD.source_updated_at OR
    NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR
    NEW.requirements_snapshot IS DISTINCT FROM OLD.requirements_snapshot
  ) THEN
    RAISE EXCEPTION 'Submitted commercial-review snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_commercial_review_snapshots_trigger ON project_commercial_stage_reviews;
CREATE TRIGGER protect_commercial_review_snapshots_trigger
BEFORE UPDATE ON project_commercial_stage_reviews
FOR EACH ROW EXECUTE FUNCTION protect_commercial_review_snapshots();
