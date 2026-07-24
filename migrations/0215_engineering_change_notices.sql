-- Phase 7: evolve legacy engineering_change_orders into authoritative ECNs.
-- Additive, idempotent, non-destructive. No source revision, inventory, P2,
-- or Engineering Release is created, released, or mutated by this migration.

CREATE SEQUENCE IF NOT EXISTS engineering_change_notice_number_seq;

DO $$ BEGIN
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'implementation_planned';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'submitted';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'in_implementation';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'verification_validation';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'release_ready';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'returned_for_revision';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'cancelled';
  ALTER TYPE engineering_eco_status ADD VALUE IF NOT EXISTS 'void';
END $$;

ALTER TABLE engineering_change_orders
  ADD COLUMN IF NOT EXISTS ecn_number text,
  ADD COLUMN IF NOT EXISTS source_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_ecr_revision_id uuid REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_ecr_checksum text,
  ADD COLUMN IF NOT EXISTS rd_project_id text REFERENCES rd_projects(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS design_control_record_id uuid REFERENCES design_control_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_engineering_release_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_engineering_release_baseline_id uuid REFERENCES engineering_release_baselines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS implementation_scope text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS change_classification text,
  ADD COLUMN IF NOT EXISTS canonical_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS effectivity_method text,
  ADD COLUMN IF NOT EXISTS effectivity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory_wip_disposition jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_content_revision_id uuid,
  ADD COLUMN IF NOT EXISTS template_registration_id uuid REFERENCES design_control_form_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS template_definition_revision_id uuid REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS template_document_version_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS template_document_number_snapshot text,
  ADD COLUMN IF NOT EXISTS template_revision_snapshot text,
  ADD COLUMN IF NOT EXISTS template_checksum_snapshot text,
  ADD COLUMN IF NOT EXISTS completion_method text NOT NULL DEFAULT 'ELECTRONIC',
  ADD COLUMN IF NOT EXISTS retained_form_path text,
  ADD COLUMN IF NOT EXISTS retained_form_checksum text,
  ADD COLUMN IF NOT EXISTS retained_form_size integer,
  ADD COLUMN IF NOT EXISTS retained_form_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS resulting_engineering_release_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS no_release_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_provenance text NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
  ADD COLUMN IF NOT EXISTS created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS implementation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_ready_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS engineering_change_orders_ecn_number_unique
  ON engineering_change_orders(ecn_number) WHERE ecn_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS engineering_change_orders_ecr_idx
  ON engineering_change_orders(source_ecr_id);
CREATE INDEX IF NOT EXISTS engineering_change_orders_rd_project_idx
  ON engineering_change_orders(rd_project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engineering_change_notice_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL,
  canonical_content jsonb NOT NULL,
  content_checksum text NOT NULL,
  source_ecr_revision_id uuid NOT NULL REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  source_ecr_checksum text NOT NULL,
  template_definition_revision_id uuid NOT NULL REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  template_document_version_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  template_checksum_snapshot text NOT NULL,
  change_reason text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecn_id, revision_number)
);

DO $$ BEGIN
  ALTER TABLE engineering_change_orders
    ADD CONSTRAINT engineering_change_orders_current_revision_fk
    FOREIGN KEY (current_content_revision_id)
    REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS engineering_change_notice_affected_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  source_ecr_affected_item_id uuid REFERENCES engineering_change_request_affected_items(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  stable_source_reference text NOT NULL,
  part_document_number_snapshot text,
  current_revision_snapshot text,
  proposed_revision text,
  change_description text NOT NULL,
  responsible_owner_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  responsible_owner_role text,
  implementation_status text NOT NULL DEFAULT 'NOT_STARTED',
  verification_required boolean NOT NULL DEFAULT false,
  effectivity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  resulting_controlled_revision_id uuid REFERENCES engineering_controlled_revisions(id) ON DELETE RESTRICT,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecn_id, stable_source_reference)
);

CREATE TABLE IF NOT EXISTS engineering_change_step_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  impact_reason text NOT NULL,
  reopen_required boolean NOT NULL DEFAULT false,
  required_new_form_revision boolean NOT NULL DEFAULT false,
  required_approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_required boolean NOT NULL DEFAULT false,
  validation_required boolean NOT NULL DEFAULT false,
  completion_status text NOT NULL DEFAULT 'PLANNED',
  reopened_step_generation_id uuid,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecn_id, step_key),
  CONSTRAINT engineering_change_step_impacts_step_check CHECK (step_key ~ '^(?:[1-9]|1[0-2])$')
);

CREATE TABLE IF NOT EXISTS engineering_change_implementation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  action_number integer NOT NULL,
  affected_item_id uuid REFERENCES engineering_change_notice_affected_items(id) ON DELETE RESTRICT,
  description text NOT NULL,
  responsible_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  responsible_role text,
  due_date date,
  status text NOT NULL DEFAULT 'NOT_STARTED',
  completion_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  completed_by_snapshot jsonb,
  completed_at timestamptz,
  accepted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by_snapshot jsonb,
  accepted_at timestamptz,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecn_id, action_number),
  CONSTRAINT engineering_change_actions_status_check CHECK (
    status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETE','ACCEPTED','CANCELLED')
  )
);

CREATE TABLE IF NOT EXISTS engineering_change_verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  ecn_revision_id uuid NOT NULL REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  plan_protocol text NOT NULL,
  acceptance_criteria text NOT NULL,
  actual_result text NOT NULL,
  result_status text NOT NULL,
  evidence_reference text NOT NULL,
  performer_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  performer_snapshot jsonb NOT NULL,
  independent_reviewer_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  independent_reviewer_snapshot jsonb,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engineering_change_vv_type_check CHECK (evidence_type IN ('VERIFICATION','VALIDATION')),
  CONSTRAINT engineering_change_vv_result_check CHECK (result_status IN ('PASS','FAIL'))
);

CREATE TABLE IF NOT EXISTS engineering_change_notice_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  ecn_revision_id uuid NOT NULL REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
  content_checksum text NOT NULL,
  source_ecr_revision_id uuid NOT NULL REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  source_ecr_checksum text NOT NULL,
  approval_function text NOT NULL,
  required_capability_snapshot text NOT NULL,
  decision text NOT NULL,
  signature_meaning text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment_conditions text,
  status text NOT NULL DEFAULT 'VALID',
  invalidated_at timestamptz,
  invalidation_reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecn_id, ecn_revision_id, approval_function, actor_user_id)
);

CREATE TABLE IF NOT EXISTS engineering_change_notice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  ecn_revision_id uuid REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS engineering_change_notice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecn_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb,
  ecr_id_snapshot uuid,
  project_id_snapshot text,
  design_control_record_id_snapshot uuid,
  ecn_revision_id uuid REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
  content_checksum text,
  reason text,
  before_values jsonb,
  after_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engineering_change_notice_events_ecn_idx
  ON engineering_change_notice_events(ecn_id, occurred_at);

CREATE TABLE IF NOT EXISTS engineering_change_notice_legacy_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eco_id uuid NOT NULL REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  reconciliation_status text NOT NULL,
  stable_source_key text NOT NULL UNIQUE,
  reason text NOT NULL,
  mapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_ecn_immutable_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ECN immutable evidence cannot be changed or deleted';
END $$;

DROP TRIGGER IF EXISTS ecn_revision_immutable ON engineering_change_notice_revisions;
CREATE TRIGGER ecn_revision_immutable BEFORE UPDATE OR DELETE
ON engineering_change_notice_revisions FOR EACH ROW
EXECUTE FUNCTION prevent_ecn_immutable_evidence_mutation();

DROP TRIGGER IF EXISTS ecn_event_immutable ON engineering_change_notice_events;
CREATE TRIGGER ecn_event_immutable BEFORE UPDATE OR DELETE
ON engineering_change_notice_events FOR EACH ROW
EXECUTE FUNCTION prevent_ecn_immutable_evidence_mutation();

DROP TRIGGER IF EXISTS ecn_approval_no_delete ON engineering_change_notice_approvals;
CREATE TRIGGER ecn_approval_no_delete BEFORE DELETE
ON engineering_change_notice_approvals FOR EACH ROW
EXECUTE FUNCTION prevent_ecn_immutable_evidence_mutation();

DROP TRIGGER IF EXISTS ecn_vv_immutable ON engineering_change_verification_records;
CREATE TRIGGER ecn_vv_immutable BEFORE UPDATE OR DELETE
ON engineering_change_verification_records FOR EACH ROW
EXECUTE FUNCTION prevent_ecn_immutable_evidence_mutation();

CREATE OR REPLACE FUNCTION protect_accepted_ecn_action()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ACCEPTED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Accepted ECN actions are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ecn_action_accepted_immutable ON engineering_change_implementation_actions;
CREATE TRIGGER ecn_action_accepted_immutable BEFORE UPDATE
ON engineering_change_implementation_actions FOR EACH ROW
EXECUTE FUNCTION protect_accepted_ecn_action();

CREATE OR REPLACE FUNCTION prevent_authoritative_ecn_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ecn_number IS NOT NULL THEN
    RAISE EXCEPTION 'Authoritative ECNs are retained and cannot be deleted';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS authoritative_ecn_no_delete ON engineering_change_orders;
CREATE TRIGGER authoritative_ecn_no_delete BEFORE DELETE
ON engineering_change_orders FOR EACH ROW
EXECUTE FUNCTION prevent_authoritative_ecn_delete();
