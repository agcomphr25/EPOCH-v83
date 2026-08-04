-- Phase 2 explicit activation state for the Design Project configuration workspace.
-- Existing projects remain untouched until an authorized user starts configuration.
CREATE TABLE IF NOT EXISTS design_project_configuration_workspaces (
  rd_project_id text PRIMARY KEY REFERENCES rd_projects(id) ON DELETE RESTRICT,
  configuration_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (configuration_status IN ('DRAFT', 'IN_REVIEW', 'COMPLETE')),
  activated_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  activated_by_snapshot jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_project_configuration_workspaces_status_idx
  ON design_project_configuration_workspaces(configuration_status);

-- 0248 originally declared these only inside CREATE TABLE IF NOT EXISTS.
-- Repair schema-push-first databases where the tables already existed and the
-- table-level declarations were therefore skipped.
CREATE UNIQUE INDEX IF NOT EXISTS design_project_configuration_items_project_number_unique
  ON design_project_configuration_items(rd_project_id, configuration_item_number);

CREATE UNIQUE INDEX IF NOT EXISTS design_project_configuration_relationship_unique
  ON design_project_configuration_item_relationships(
    parent_configuration_item_id,
    child_configuration_item_id,
    effectivity_start,
    effectivity_end
  );

ALTER TABLE design_project_document_applicability
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'NOT_REQUIRED';

ALTER TABLE design_project_document_applicability
  DROP CONSTRAINT IF EXISTS design_project_document_applicability_na_check;

ALTER TABLE design_project_document_applicability
  DROP CONSTRAINT IF EXISTS design_project_document_applicability_approval_status_check;

ALTER TABLE design_project_document_applicability
  ADD CONSTRAINT design_project_document_applicability_approval_status_check CHECK (
    approval_status IN ('NOT_REQUIRED', 'DRAFT', 'PENDING', 'APPROVED')
    AND (decision <> 'NOT_APPLICABLE' OR nullif(btrim(justification), '') IS NOT NULL)
    AND (approval_status <> 'APPROVED' OR (
      decision = 'NOT_APPLICABLE' AND approved_by_user_id IS NOT NULL
      AND approved_by_snapshot IS NOT NULL AND approved_at IS NOT NULL
    ))
  );
