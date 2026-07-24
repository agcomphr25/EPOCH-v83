-- Phase 5: controlled Design Project form instances.
-- Additive and idempotent. This migration does not create completed instances,
-- approve evidence, modify P2 records, or rewrite historical Engineering Releases.

CREATE TABLE IF NOT EXISTS project_form_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_number text NOT NULL UNIQUE,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  design_control_step_id uuid NOT NULL REFERENCES design_control_steps(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  template_registration_id uuid NOT NULL REFERENCES design_control_form_templates(id) ON DELETE RESTRICT,
  template_definition_revision_id uuid NOT NULL REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  document_version_history_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  template_document_number_snapshot text NOT NULL,
  template_revision_snapshot text NOT NULL,
  template_checksum_snapshot text NOT NULL,
  renderer_version text NOT NULL,
  completion_method text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  indexed_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_content_revision_id uuid,
  retained_pdf_path text,
  retained_pdf_checksum text,
  retained_pdf_size integer,
  retained_pdf_generated_at timestamptz,
  supersedes_instance_id uuid REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  superseded_by_instance_id uuid REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  submitted_at timestamptz,
  submitted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_snapshot jsonb,
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_form_instances_completion_method_check
    CHECK (completion_method IN ('ELECTRONIC', 'PAPER_UPLOAD')),
  CONSTRAINT project_form_instances_lifecycle_check
    CHECK (lifecycle_status IN (
      'DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED',
      'RETURNED_FOR_REVISION', 'SUPERSEDED', 'VOID'
    )),
  CONSTRAINT project_form_instances_template_checksum_check
    CHECK (template_checksum_snapshot ~ '^[0-9a-f]{64}$'),
  CONSTRAINT project_form_instances_retained_pdf_check CHECK (
    (retained_pdf_path IS NULL AND retained_pdf_checksum IS NULL AND retained_pdf_size IS NULL)
    OR
    (retained_pdf_path IS NOT NULL AND retained_pdf_checksum ~ '^[0-9a-f]{64}$' AND retained_pdf_size > 0)
  )
);

CREATE INDEX IF NOT EXISTS project_form_instances_record_idx
  ON project_form_instances(design_control_record_id, step_key);
CREATE INDEX IF NOT EXISTS project_form_instances_project_idx
  ON project_form_instances(rd_project_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_form_instances_current_step_unique
  ON project_form_instances(design_control_record_id, step_key)
  WHERE lifecycle_status NOT IN ('SUPERSEDED', 'VOID');

CREATE TABLE IF NOT EXISTS project_form_instance_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_form_instance_id uuid NOT NULL REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  content_revision_number integer NOT NULL CHECK (content_revision_number > 0),
  canonical_content jsonb NOT NULL,
  content_checksum text NOT NULL CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
  template_definition_revision_id uuid NOT NULL REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  template_checksum_snapshot text NOT NULL CHECK (template_checksum_snapshot ~ '^[0-9a-f]{64}$'),
  revision_status text NOT NULL DEFAULT 'SUBMITTED',
  change_reason text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_form_instance_revisions_status_check
    CHECK (revision_status IN ('SUBMITTED', 'APPROVED', 'RETURNED', 'SUPERSEDED')),
  CONSTRAINT project_form_instance_revisions_sequence_unique
    UNIQUE (project_form_instance_id, content_revision_number)
);
CREATE INDEX IF NOT EXISTS project_form_instance_revisions_instance_idx
  ON project_form_instance_revisions(project_form_instance_id, content_revision_number);

DO $$ BEGIN
  ALTER TABLE project_form_instances
    ADD CONSTRAINT project_form_instances_current_revision_fk
    FOREIGN KEY (current_content_revision_id)
    REFERENCES project_form_instance_revisions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS project_form_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_form_instance_id uuid NOT NULL REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  project_form_instance_revision_id uuid NOT NULL REFERENCES project_form_instance_revisions(id) ON DELETE RESTRICT,
  content_checksum text NOT NULL CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
  template_definition_revision_id uuid NOT NULL REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  approval_key text NOT NULL,
  approval_role_snapshot text NOT NULL,
  required_capability_snapshot text NOT NULL,
  decision text NOT NULL,
  signature_meaning text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_comment text,
  status text NOT NULL DEFAULT 'VALID',
  invalidated_at timestamptz,
  invalidated_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  invalidation_reason text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_form_approvals_decision_check
    CHECK (decision IN ('APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION')),
  CONSTRAINT project_form_approvals_status_check CHECK (status IN ('VALID', 'INVALIDATED')),
  CONSTRAINT project_form_approvals_actor_decision_unique
    UNIQUE (project_form_instance_revision_id, approval_key, actor_user_id, decision)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_form_approvals_valid_slot_unique
  ON project_form_approvals(project_form_instance_revision_id, approval_key)
  WHERE status = 'VALID' AND decision = 'APPROVED';

CREATE TABLE IF NOT EXISTS project_form_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_form_instance_id uuid NOT NULL REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  project_form_instance_revision_id uuid REFERENCES project_form_instance_revisions(id) ON DELETE RESTRICT,
  attachment_kind text NOT NULL,
  original_filename text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256_checksum text NOT NULL CHECK (sha256_checksum ~ '^[0-9a-f]{64}$'),
  indexing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_snapshot jsonb NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_form_attachments_kind_check
    CHECK (attachment_kind IN ('PAPER_ORIGINAL', 'EVIDENCE', 'COMPLETED_PDF')),
  CONSTRAINT project_form_attachments_original_unique
    UNIQUE (project_form_instance_id, attachment_kind, sha256_checksum)
);
CREATE INDEX IF NOT EXISTS project_form_attachments_instance_idx
  ON project_form_attachments(project_form_instance_id);

CREATE OR REPLACE FUNCTION prevent_project_form_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Project Form Instance evidence is append-only';
  END IF;
  IF TG_TABLE_NAME = 'project_form_approvals' THEN
    IF (
      to_jsonb(NEW) - ARRAY[
        'status', 'invalidated_at', 'invalidated_by_user_id',
        'invalidation_reason'
      ]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'status', 'invalidated_at', 'invalidated_by_user_id',
        'invalidation_reason'
      ]
    ) THEN
      RAISE EXCEPTION 'Project Form approval decision evidence is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN (
    'project_form_instance_revisions',
    'project_form_attachments'
  ) THEN
    RAISE EXCEPTION 'Project Form Instance evidence is immutable';
  END IF;
  IF OLD.lifecycle_status IN ('APPROVED', 'SUPERSEDED', 'VOID') AND (
    NEW.draft_content IS DISTINCT FROM OLD.draft_content
    OR NEW.current_content_revision_id IS DISTINCT FROM OLD.current_content_revision_id
    OR NEW.template_definition_revision_id IS DISTINCT FROM OLD.template_definition_revision_id
    OR NEW.retained_pdf_path IS DISTINCT FROM OLD.retained_pdf_path
    OR NEW.retained_pdf_checksum IS DISTINCT FROM OLD.retained_pdf_checksum
  ) THEN
    RAISE EXCEPTION 'Approved Project Form Instance evidence is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_form_revision_immutable ON project_form_instance_revisions;
CREATE TRIGGER project_form_revision_immutable
BEFORE UPDATE OR DELETE ON project_form_instance_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_project_form_evidence_mutation();
DROP TRIGGER IF EXISTS project_form_approval_immutable ON project_form_approvals;
CREATE TRIGGER project_form_approval_immutable
BEFORE UPDATE OR DELETE ON project_form_approvals
FOR EACH ROW EXECUTE FUNCTION prevent_project_form_evidence_mutation();
DROP TRIGGER IF EXISTS project_form_attachment_immutable ON project_form_attachments;
CREATE TRIGGER project_form_attachment_immutable
BEFORE UPDATE OR DELETE ON project_form_attachments
FOR EACH ROW EXECUTE FUNCTION prevent_project_form_evidence_mutation();
DROP TRIGGER IF EXISTS project_form_terminal_immutable ON project_form_instances;
CREATE TRIGGER project_form_terminal_immutable
BEFORE UPDATE OR DELETE ON project_form_instances
FOR EACH ROW EXECUTE FUNCTION prevent_project_form_evidence_mutation();

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('design.forms.view', 'View Design Project controlled form instances', 'design'),
  ('design.forms.create', 'Create controlled form instances for authoritative Design Projects', 'design'),
  ('design.forms.edit', 'Edit controlled form-instance drafts', 'design'),
  ('design.forms.submit', 'Submit immutable form content for authenticated approval', 'design'),
  ('design.forms.approve', 'Record authenticated form-instance approval decisions', 'design'),
  ('design.forms.upload_paper', 'Upload immutable original paper-form scans', 'design'),
  ('design.forms.supersede', 'Supersede or void controlled form instances with reason', 'design')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM perm_roles r
JOIN perm_capabilities c ON c.key LIKE 'design.forms.%'
WHERE r.name IN ('ADMIN', 'OWNER', 'ENGINEERING', 'QUALITY', 'DOCUMENT_MANAGER')
ON CONFLICT DO NOTHING;
