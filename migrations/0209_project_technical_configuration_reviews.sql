-- Phase 8B: manufacturing Technical & Configuration Review for p2_v2 definition v2.
-- Migration 0203 and its Design Applicability records remain intact for definition-v1 compatibility.
-- No legacy rows are backfilled and no Design Control, PO, production, or release records are changed.
CREATE TABLE IF NOT EXISTS project_technical_configuration_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  workflow_step_type TEXT NOT NULL DEFAULT 'technical_configuration_review'
    CHECK (workflow_step_type = 'technical_configuration_review'),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','COMPLETE','REJECTED','STALE','INVALIDATED','SUPERSEDED')),
  po_id INTEGER REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  po_revision_number INTEGER NOT NULL,
  source_revision TEXT NOT NULL,
  source_snapshot JSONB NOT NULL,
  technical_baseline JSONB NOT NULL,
  released_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sufficiently_defined BOOLEAN NOT NULL DEFAULT false,
  supply_chain_required BOOLEAN NOT NULL DEFAULT false,
  effectivity_reference TEXT NOT NULL,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  owner_display_name TEXT,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  superseded_at TIMESTAMP,
  superseded_by_review_id UUID REFERENCES project_technical_configuration_reviews(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_technical_review_instance_project_fk
    FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_technical_review_step_project_fk
    FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_technical_review_revision_unique
    UNIQUE (project_id, workflow_instance_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_technical_reviews_current_unique
  ON project_technical_configuration_reviews(project_id, workflow_instance_id)
  WHERE status IN ('DRAFT','PENDING_APPROVAL','COMPLETE');
CREATE INDEX IF NOT EXISTS project_technical_reviews_project_idx
  ON project_technical_configuration_reviews(project_id, revision_number DESC);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.technical_configuration.manage','Draft, submit and revise P2 V2 technical and configuration reviews','projects'),
 ('projects.technical_configuration.pm_decide','Confirm customer-order and scope alignment','projects'),
 ('projects.technical_configuration.engineering_decide','Confirm technical package and manufacturability','engineering'),
 ('projects.technical_configuration.quality_decide','Confirm inspection, acceptance and quality-clause requirements','quality'),
 ('projects.technical_configuration.operations_decide','Confirm production capability, capacity and execution readiness','operations'),
 ('projects.technical_configuration.supply_chain_decide','Confirm conditional external-source and material readiness','procurement')
ON CONFLICT (key) DO UPDATE
SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr
JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key LIKE 'projects.technical_configuration.%') OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER','SALES','CONTRACTS') AND pc.key IN ('projects.technical_configuration.manage','projects.technical_configuration.pm_decide')) OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER','MANUFACTURING_ENGINEERING') AND pc.key IN ('projects.technical_configuration.manage','projects.technical_configuration.engineering_decide')) OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.technical_configuration.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER') AND pc.key='projects.technical_configuration.operations_decide') OR
 (pr.name IN ('PROCUREMENT','PURCHASING','SUPPLY_CHAIN','SUPPLY_CHAIN_MANAGER') AND pc.key='projects.technical_configuration.supply_chain_decide')
)
ON CONFLICT (role_id, capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_technical_configuration_review_snapshots()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.po_id IS DISTINCT FROM OLD.po_id OR
    NEW.po_revision_number IS DISTINCT FROM OLD.po_revision_number OR
    NEW.source_revision IS DISTINCT FROM OLD.source_revision OR
    NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR
    NEW.technical_baseline IS DISTINCT FROM OLD.technical_baseline OR
    NEW.released_evidence IS DISTINCT FROM OLD.released_evidence
  ) THEN
    RAISE EXCEPTION 'Submitted technical/configuration review snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_technical_configuration_review_snapshots_trigger
  ON project_technical_configuration_reviews;
CREATE TRIGGER protect_technical_configuration_review_snapshots_trigger
BEFORE UPDATE ON project_technical_configuration_reviews
FOR EACH ROW EXECUTE FUNCTION protect_technical_configuration_review_snapshots();
