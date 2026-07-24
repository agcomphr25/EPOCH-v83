-- Phase 6: authoritative Engineering Change Requests for R&D Design Projects.
-- Additive, idempotent, non-destructive, and deliberately does not implement ECNs.

CREATE SEQUENCE IF NOT EXISTS engineering_change_request_number_seq;

CREATE TABLE IF NOT EXISTS engineering_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_number text NOT NULL UNIQUE,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  source_engineering_release_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  source_engineering_release_baseline_id uuid REFERENCES engineering_release_baselines(id) ON DELETE RESTRICT,
  title text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  priority text NOT NULL DEFAULT 'NORMAL',
  change_classification text NOT NULL DEFAULT 'DESIGN',
  current_owner_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_design_control_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_effectivity jsonb NOT NULL DEFAULT '{}'::jsonb,
  disposition text,
  current_content_revision_id uuid,
  template_registration_id uuid REFERENCES design_control_form_templates(id) ON DELETE RESTRICT,
  template_definition_revision_id uuid REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  template_document_version_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  template_document_number_snapshot text,
  template_revision_snapshot text,
  template_checksum_snapshot text,
  completion_method text NOT NULL DEFAULT 'ELECTRONIC',
  retained_form_path text,
  retained_form_checksum text,
  retained_form_size integer,
  retained_form_generated_at timestamptz,
  legacy_source_change_id uuid REFERENCES design_control_changes(id) ON DELETE RESTRICT,
  legacy_provenance text NOT NULL DEFAULT 'NATIVE_AUTHENTICATED',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  submitted_at timestamptz,
  decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engineering_change_requests_status_check CHECK (
    lifecycle_status IN (
      'DRAFT', 'SUBMITTED', 'IMPACT_REVIEW', 'RETURNED_FOR_REVISION',
      'APPROVED', 'REJECTED', 'CANCELLED', 'VOID'
    )
  ),
  CONSTRAINT engineering_change_requests_completion_check CHECK (
    completion_method IN ('ELECTRONIC', 'PAPER')
  ),
  CONSTRAINT engineering_change_requests_legacy_unique UNIQUE (legacy_source_change_id)
);

CREATE INDEX IF NOT EXISTS engineering_change_requests_project_idx
  ON engineering_change_requests(rd_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS engineering_change_requests_record_idx
  ON engineering_change_requests(design_control_record_id, lifecycle_status);

CREATE TABLE IF NOT EXISTS engineering_change_request_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL,
  canonical_content jsonb NOT NULL,
  content_checksum text NOT NULL,
  template_definition_revision_id uuid NOT NULL REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  template_document_version_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  template_checksum_snapshot text NOT NULL,
  change_reason text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecr_id, revision_number)
);

DO $$ BEGIN
  ALTER TABLE engineering_change_requests
    ADD CONSTRAINT engineering_change_requests_current_revision_fk
    FOREIGN KEY (current_content_revision_id)
    REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS engineering_change_request_affected_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_id text,
  stable_external_reference text,
  part_document_number_snapshot text,
  revision_snapshot text,
  description text NOT NULL,
  proposed_change text NOT NULL,
  impact_category text NOT NULL,
  disposition_recommendation text,
  evidence_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engineering_change_request_affected_type_check CHECK (
    source_type IN (
      'REQUIREMENT', 'DRAWING', 'CAD_MODEL', 'SPECIFICATION', 'BOM',
      'SOFTWARE_FIRMWARE', 'TEST_METHOD', 'VERIFICATION_RECORD',
      'VALIDATION_RECORD', 'RISK_RECORD', 'MANUFACTURING_ROUTING_REFERENCE',
      'WORK_INSTRUCTION_REFERENCE', 'TOOLING', 'SUPPLIER',
      'CONTROLLED_DOCUMENT', 'DESIGN_CONTROL_STEP',
      'RELEASED_CONFIGURATION_ITEM', 'OTHER'
    )
  )
);
CREATE INDEX IF NOT EXISTS engineering_change_request_affected_items_ecr_idx
  ON engineering_change_request_affected_items(ecr_id);

CREATE TABLE IF NOT EXISTS engineering_change_request_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ecr_revision_id uuid NOT NULL REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  content_checksum text NOT NULL,
  review_function text NOT NULL,
  required_capability_snapshot text NOT NULL,
  decision text NOT NULL,
  impact_assessment text NOT NULL,
  conditions text,
  required_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'VALID',
  invalidated_at timestamptz,
  invalidation_reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecr_id, ecr_revision_id, review_function, actor_user_id)
);

CREATE TABLE IF NOT EXISTS engineering_change_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb,
  project_id_snapshot text NOT NULL,
  design_control_record_id_snapshot uuid NOT NULL,
  source_release_id_snapshot uuid,
  source_baseline_id_snapshot uuid,
  content_revision_id uuid REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  content_checksum text,
  reason text,
  before_values jsonb,
  after_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engineering_change_request_events_ecr_idx
  ON engineering_change_request_events(ecr_id, occurred_at);

CREATE TABLE IF NOT EXISTS engineering_change_request_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ecr_revision_id uuid NOT NULL REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  content_checksum text NOT NULL,
  disposition text NOT NULL,
  reason text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecr_id, ecr_revision_id, disposition)
);

CREATE TABLE IF NOT EXISTS engineering_change_request_legacy_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_change_id uuid NOT NULL REFERENCES design_control_changes(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  rd_project_id text REFERENCES rd_projects(id) ON DELETE RESTRICT,
  mapped_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  reconciliation_status text NOT NULL,
  reason text NOT NULL,
  stable_source_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS engineering_change_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecr_id uuid NOT NULL REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ecr_revision_id uuid REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  attachment_kind text NOT NULL,
  original_filename text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256_checksum text NOT NULL,
  uploaded_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_snapshot jsonb NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_ecr_immutable_row_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ECR immutable evidence cannot be changed or deleted';
END $$;

DROP TRIGGER IF EXISTS ecr_revision_immutable_update ON engineering_change_request_revisions;
CREATE TRIGGER ecr_revision_immutable_update
BEFORE UPDATE OR DELETE ON engineering_change_request_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_ecr_immutable_row_mutation();

DROP TRIGGER IF EXISTS ecr_event_immutable_update ON engineering_change_request_events;
CREATE TRIGGER ecr_event_immutable_update
BEFORE UPDATE OR DELETE ON engineering_change_request_events
FOR EACH ROW EXECUTE FUNCTION prevent_ecr_immutable_row_mutation();

DROP TRIGGER IF EXISTS ecr_review_no_delete ON engineering_change_request_reviews;
CREATE TRIGGER ecr_review_no_delete
BEFORE DELETE ON engineering_change_request_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_ecr_immutable_row_mutation();

DROP TRIGGER IF EXISTS ecr_disposition_immutable ON engineering_change_request_dispositions;
CREATE TRIGGER ecr_disposition_immutable
BEFORE UPDATE OR DELETE ON engineering_change_request_dispositions
FOR EACH ROW EXECUTE FUNCTION prevent_ecr_immutable_row_mutation();

CREATE OR REPLACE FUNCTION prevent_terminal_ecr_material_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle_status IN ('APPROVED', 'REJECTED', 'CANCELLED', 'VOID')
     AND (
       NEW.ecr_number IS DISTINCT FROM OLD.ecr_number OR
       NEW.rd_project_id IS DISTINCT FROM OLD.rd_project_id OR
       NEW.design_control_record_id IS DISTINCT FROM OLD.design_control_record_id OR
       NEW.content IS DISTINCT FROM OLD.content OR
       NEW.current_content_revision_id IS DISTINCT FROM OLD.current_content_revision_id OR
       NEW.retained_form_checksum IS DISTINCT FROM OLD.retained_form_checksum
     ) THEN
    RAISE EXCEPTION 'Terminal ECR content and evidence are immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ecr_terminal_immutable_update ON engineering_change_requests;
CREATE TRIGGER ecr_terminal_immutable_update
BEFORE UPDATE ON engineering_change_requests
FOR EACH ROW EXECUTE FUNCTION prevent_terminal_ecr_material_mutation();

CREATE OR REPLACE FUNCTION prevent_ecr_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ECR records are retained and cannot be deleted';
END $$;

DROP TRIGGER IF EXISTS ecr_no_delete ON engineering_change_requests;
CREATE TRIGGER ecr_no_delete
BEFORE DELETE ON engineering_change_requests
FOR EACH ROW EXECUTE FUNCTION prevent_ecr_delete();
