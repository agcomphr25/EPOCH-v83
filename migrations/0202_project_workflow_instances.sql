-- Phase 3: additive storage for inactive p2_v2 workflow instances.
-- Intentionally contains no backfill and does not modify projects or project_steps rows.
CREATE TABLE IF NOT EXISTS project_workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_version TEXT NOT NULL,
  definition_version INTEGER NOT NULL DEFAULT 1 CHECK (definition_version > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','BLOCKED','COMPLETE','SUPERSEDED','CANCELLED')),
  initialized_at TIMESTAMP NOT NULL DEFAULT now(),
  initialized_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  initialized_by_display_name TEXT,
  activated_at TIMESTAMP,
  completed_at TIMESTAMP,
  superseded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_workflow_instances_version_check CHECK (workflow_version = 'p2_v2'),
  CONSTRAINT project_workflow_instances_id_project_unique UNIQUE (id, project_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_workflow_instances_active_unique
  ON project_workflow_instances(project_id, workflow_version)
  WHERE status NOT IN ('SUPERSEDED','CANCELLED');
CREATE INDEX IF NOT EXISTS project_workflow_instances_project_idx ON project_workflow_instances(project_id);

CREATE TABLE IF NOT EXISTS project_workflow_step_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL,
  project_id UUID NOT NULL,
  step_type TEXT NOT NULL,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  label_snapshot TEXT NOT NULL,
  description_snapshot TEXT,
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED','IN_PROGRESS','PENDING_APPROVAL','APPROVED','COMPLETE','BLOCKED','NOT_APPLICABLE','SUPERSEDED','CANCELLED')),
  applicability TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (applicability IN ('REQUIRED','CONDITIONAL','NOT_APPLICABLE')),
  applicability_reason TEXT,
  applicability_source TEXT,
  applicability_decided_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  applicability_decided_by_display_name TEXT,
  applicability_decided_at TIMESTAMP,
  owner_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  owner_role TEXT,
  due_date DATE,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  completed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  completed_by_display_name TEXT,
  blocked_reason TEXT,
  revision_reference TEXT,
  effectivity_reference TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_workflow_steps_instance_project_fk FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_workflow_steps_type_unique UNIQUE (workflow_instance_id, step_type),
  CONSTRAINT project_workflow_steps_order_unique UNIQUE (workflow_instance_id, step_order),
  CONSTRAINT project_workflow_steps_id_project_unique UNIQUE (id, project_id)
);
CREATE INDEX IF NOT EXISTS project_workflow_steps_project_idx ON project_workflow_step_instances(project_id);
CREATE INDEX IF NOT EXISTS project_workflow_steps_instance_idx ON project_workflow_step_instances(workflow_instance_id, step_order);

CREATE TABLE IF NOT EXISTS project_workflow_step_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_instance_id UUID NOT NULL,
  project_id UUID NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('PRIMARY','SUPPORTING','EVIDENCE','SATISFIES_REQUIREMENT','SUPERSEDES')),
  is_authoritative BOOLEAN NOT NULL DEFAULT false,
  record_revision TEXT,
  effectivity_reference TEXT,
  linked_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  linked_by_display_name TEXT,
  linked_at TIMESTAMP NOT NULL DEFAULT now(),
  unlinked_at TIMESTAMP,
  unlink_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_workflow_links_step_project_fk FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS project_workflow_links_step_idx ON project_workflow_step_links(workflow_step_instance_id);

CREATE TABLE IF NOT EXISTS project_workflow_step_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_instance_id UUID NOT NULL,
  project_id UUID NOT NULL,
  approval_type TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED','WAIVED','NOT_APPLICABLE_APPROVED')),
  signature_meaning TEXT NOT NULL,
  reason TEXT,
  actor_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT now(),
  step_revision_snapshot TEXT,
  evidence_snapshot JSONB,
  superseded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_workflow_approvals_step_project_fk FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS project_workflow_approvals_step_idx ON project_workflow_step_approvals(workflow_step_instance_id);
