-- Phase 7: additive p2_v2 WAD authorization bridge.
-- The authoritative WAD remains production_work_orders. No legacy backfill.
CREATE TABLE IF NOT EXISTS project_wad_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  workflow_step_type TEXT NOT NULL DEFAULT 'wad_authorization' CHECK (workflow_step_type = 'wad_authorization'),
  production_plan_id UUID NOT NULL REFERENCES project_production_plans(id) ON DELETE RESTRICT,
  production_plan_revision INTEGER NOT NULL CHECK (production_plan_revision > 0),
  wad_work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE RESTRICT,
  wad_number TEXT NOT NULL,
  wad_revision INTEGER NOT NULL CHECK (wad_revision > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','RELEASED','REJECTED','BLOCKED','SUPERSEDED')),
  po_id INTEGER REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  po_revision_number INTEGER,
  configuration_revision TEXT NOT NULL,
  effectivity_reference TEXT NOT NULL,
  inherited_requirements_snapshot JSONB NOT NULL,
  budget_snapshot JSONB NOT NULL,
  approval_snapshot JSONB,
  finance_required BOOLEAN NOT NULL DEFAULT false,
  executive_required BOOLEAN NOT NULL DEFAULT false,
  authorized_at TIMESTAMP,
  authorized_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  authorized_by_display_name TEXT,
  superseded_at TIMESTAMP,
  superseded_by_authorization_id UUID REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_wad_authorizations_instance_project_fk FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_wad_authorizations_step_identity_fk FOREIGN KEY (workflow_step_instance_id, workflow_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, workflow_instance_id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_wad_authorizations_revision_unique UNIQUE (project_id, workflow_instance_id, wad_revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_wad_authorizations_current_unique
  ON project_wad_authorizations(project_id, workflow_instance_id) WHERE status <> 'SUPERSEDED';
CREATE INDEX IF NOT EXISTS project_wad_authorizations_project_idx
  ON project_wad_authorizations(project_id, wad_revision DESC);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.wad_authorization.manage','Create, submit and revise P2 V2 WAD authorizations','projects'),
 ('projects.wad_authorization.pm_decide','Record Project Management V2 WAD decisions','projects'),
 ('projects.wad_authorization.engineering_decide','Record Engineering V2 WAD decisions','engineering'),
 ('projects.wad_authorization.quality_decide','Record Quality V2 WAD decisions','quality'),
 ('projects.wad_authorization.operations_decide','Record Operations V2 WAD decisions','operations'),
 ('projects.wad_authorization.finance_decide','Record conditional Finance V2 WAD decisions','finance'),
 ('projects.wad_authorization.executive_decide','Record conditional Executive V2 WAD decisions','executive'),
 ('projects.wad_authorization.release','Release an approved P2 V2 WAD authorization','projects')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key IN ('projects.wad_authorization.manage','projects.wad_authorization.release')) OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND pc.key IN ('projects.wad_authorization.manage','projects.wad_authorization.pm_decide','projects.wad_authorization.release')) OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER') AND pc.key='projects.wad_authorization.engineering_decide') OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.wad_authorization.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER') AND pc.key='projects.wad_authorization.operations_decide') OR
 (pr.name IN ('FINANCE','CONTROLLER') AND pc.key='projects.wad_authorization.finance_decide') OR
 (pr.name IN ('EXECUTIVE') AND pc.key='projects.wad_authorization.executive_decide')
) ON CONFLICT (role_id, capability_id) DO NOTHING;
