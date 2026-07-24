-- Phase 4: independently controlled Design Control form-template definitions.
-- Additive only. This migration intentionally does not seed, approve, release,
-- rename, overwrite, or delete production records. Authenticated document
-- controllers run the idempotent canonical seed operation after deployment.

CREATE TABLE IF NOT EXISTS design_control_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  controlled_document_id uuid NOT NULL UNIQUE REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  form_category text NOT NULL,
  workflow_step_key text,
  change_record_type text,
  active_template_revision_id uuid,
  reconciliation_status text NOT NULL DEFAULT 'READY',
  reconciliation_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_control_form_templates_category_check
    CHECK (form_category IN ('DESIGN_CONTROL_STEP', 'ENGINEERING_CHANGE_REQUEST', 'ENGINEERING_CHANGE_NOTICE')),
  CONSTRAINT design_control_form_templates_mapping_check CHECK (
    (form_category = 'DESIGN_CONTROL_STEP' AND workflow_step_key IS NOT NULL AND change_record_type IS NULL)
    OR
    (form_category <> 'DESIGN_CONTROL_STEP' AND workflow_step_key IS NULL AND change_record_type IN ('ECR', 'ECN'))
  ),
  CONSTRAINT design_control_form_templates_reconciliation_check
    CHECK (reconciliation_status IN ('READY', 'RECONCILIATION_REQUIRED'))
);

CREATE TABLE IF NOT EXISTS design_control_form_template_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_control_form_template_id uuid NOT NULL REFERENCES design_control_form_templates(id) ON DELETE RESTRICT,
  document_version_history_id uuid NOT NULL UNIQUE REFERENCES document_version_history(id) ON DELETE RESTRICT,
  template_revision_sequence integer NOT NULL CHECK (template_revision_sequence > 0),
  template_schema_version text NOT NULL,
  renderer_version text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  canonical_definition jsonb NOT NULL,
  definition_checksum text NOT NULL,
  document_number_snapshot text NOT NULL,
  document_revision_snapshot text NOT NULL,
  template_key_snapshot text NOT NULL,
  lifecycle_status_at_use text NOT NULL DEFAULT 'DRAFT',
  blank_pdf_path text,
  blank_pdf_checksum text,
  blank_pdf_size integer,
  blank_pdf_generated_at timestamptz,
  revision_reason text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_control_form_template_revisions_sequence_unique
    UNIQUE (design_control_form_template_id, template_revision_sequence),
  CONSTRAINT design_control_form_template_revisions_lifecycle_check
    CHECK (lifecycle_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RELEASED', 'SUPERSEDED', 'OBSOLETE')),
  CONSTRAINT design_control_form_template_revisions_use_lifecycle_check
    CHECK (lifecycle_status_at_use IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'RELEASED', 'SUPERSEDED', 'OBSOLETE')),
  CONSTRAINT design_control_form_template_revisions_checksum_check
    CHECK (definition_checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT design_control_form_template_revisions_pdf_check CHECK (
    (blank_pdf_path IS NULL AND blank_pdf_checksum IS NULL AND blank_pdf_size IS NULL)
    OR
    (blank_pdf_path IS NOT NULL AND blank_pdf_checksum ~ '^[0-9a-f]{64}$' AND blank_pdf_size > 0)
  )
);

CREATE INDEX IF NOT EXISTS design_control_form_template_revisions_template_idx
  ON design_control_form_template_revisions(design_control_form_template_id);
CREATE INDEX IF NOT EXISTS design_control_form_template_revisions_lifecycle_idx
  ON design_control_form_template_revisions(lifecycle_status);

CREATE TABLE IF NOT EXISTS design_control_form_template_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  conflict_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);
CREATE UNIQUE INDEX IF NOT EXISTS design_control_form_template_reconciliation_unresolved_unique
  ON design_control_form_template_reconciliation(template_key, conflict_type)
  WHERE resolved_at IS NULL;

DO $$ BEGIN
  ALTER TABLE design_control_form_templates
    ADD CONSTRAINT design_control_form_templates_active_revision_fk
    FOREIGN KEY (active_template_revision_id)
    REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION prevent_design_control_template_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Design Control template revisions are append-only';
  END IF;
  IF OLD.lifecycle_status IN ('RELEASED', 'SUPERSEDED', 'OBSOLETE') AND (
    NEW.canonical_definition IS DISTINCT FROM OLD.canonical_definition
    OR NEW.definition_checksum IS DISTINCT FROM OLD.definition_checksum
    OR NEW.document_version_history_id IS DISTINCT FROM OLD.document_version_history_id
    OR NEW.template_schema_version IS DISTINCT FROM OLD.template_schema_version
    OR NEW.renderer_version IS DISTINCT FROM OLD.renderer_version
    OR NEW.document_number_snapshot IS DISTINCT FROM OLD.document_number_snapshot
    OR NEW.document_revision_snapshot IS DISTINCT FROM OLD.document_revision_snapshot
    OR NEW.template_key_snapshot IS DISTINCT FROM OLD.template_key_snapshot
    OR NEW.blank_pdf_path IS DISTINCT FROM OLD.blank_pdf_path
    OR NEW.blank_pdf_checksum IS DISTINCT FROM OLD.blank_pdf_checksum
  ) THEN
    RAISE EXCEPTION 'Released Design Control template definition and artifact identity are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS design_control_form_template_revision_immutable
  ON design_control_form_template_revisions;
CREATE TRIGGER design_control_form_template_revision_immutable
BEFORE UPDATE OR DELETE ON design_control_form_template_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_design_control_template_revision_mutation();

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('documents.template.create', 'Create and reconcile controlled form-template registrations', 'documents'),
  ('documents.template.revise', 'Create controlled form-template definition revisions', 'documents'),
  ('documents.template.release', 'Release exact controlled form-template revisions and retained blank artifacts', 'documents'),
  ('documents.template.obsolete', 'Obsolete released controlled form-template revisions', 'documents')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM perm_roles r
JOIN perm_capabilities c ON c.key IN (
  'documents.template.create',
  'documents.template.revise',
  'documents.template.release',
  'documents.template.obsolete'
)
WHERE r.name IN ('ADMIN', 'OWNER', 'DOCUMENT_MANAGER')
ON CONFLICT DO NOTHING;
