-- Phase 5: additive, revision-controlled p2_v2 Design Applicability decisions.
-- No legacy rows are backfilled and no legacy project_steps are modified.
DO $$ BEGIN
  ALTER TABLE project_workflow_step_instances
    ADD CONSTRAINT project_workflow_steps_id_instance_project_unique
    UNIQUE (id, workflow_instance_id, project_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_design_applicability_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  workflow_step_type TEXT NOT NULL DEFAULT 'design_applicability' CHECK (workflow_step_type = 'design_applicability'),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SUPERSEDED')),
  responsibility_type TEXT NOT NULL CHECK (responsibility_type IN ('CUSTOMER_BUILD_TO_PRINT','AG_DESIGN_RESPONSIBLE','SHARED_DESIGN_RESPONSIBILITY')),
  ag_design_scope TEXT,
  customer_design_scope TEXT,
  responsibility_boundary TEXT,
  requirement_source TEXT NOT NULL,
  customer_drawing_number TEXT,
  customer_drawing_revision TEXT,
  customer_specifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_design_project_id TEXT REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_required BOOLEAN NOT NULL,
  justification TEXT NOT NULL,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_display_name TEXT,
  submitted_at TIMESTAMP,
  superseded_at TIMESTAMP,
  superseded_by_decision_id UUID REFERENCES project_design_applicability_decisions(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_design_applicability_instance_project_fk FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_design_applicability_step_identity_fk FOREIGN KEY (workflow_step_instance_id, workflow_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, workflow_instance_id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_design_applicability_revision_unique UNIQUE (project_id, workflow_instance_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_design_applicability_current_unique
  ON project_design_applicability_decisions(project_id, workflow_instance_id)
  WHERE status <> 'SUPERSEDED';
CREATE INDEX IF NOT EXISTS project_design_applicability_project_idx
  ON project_design_applicability_decisions(project_id, revision_number DESC);

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('projects.design_applicability.manage', 'Draft, edit, submit and revise P2 V2 Design Applicability decisions', 'projects'),
  ('projects.design_applicability.engineering_decide', 'Record the Engineering Design Applicability decision', 'engineering'),
  ('projects.design_applicability.quality_decide', 'Record the Quality Design Applicability decision', 'quality')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr
JOIN perm_capabilities pc ON (
  (pr.name IN ('ADMIN','OWNER') AND pc.key = 'projects.design_applicability.manage')
  OR (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER') AND pc.key IN ('projects.design_applicability.manage','projects.design_applicability.engineering_decide'))
  OR (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key = 'projects.design_applicability.quality_decide')
)
ON CONFLICT (role_id, capability_id) DO NOTHING;
