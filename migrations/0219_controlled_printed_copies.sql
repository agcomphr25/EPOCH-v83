-- Phase 9: accountable controlled printed copies for Design Control evidence.
CREATE SEQUENCE IF NOT EXISTS controlled_printed_copy_number_seq;

CREATE TABLE IF NOT EXISTS controlled_printed_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_number text NOT NULL UNIQUE,
  source_type text NOT NULL,
  controlled_document_id uuid,
  document_version_history_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  design_control_template_revision_id uuid REFERENCES design_control_form_template_revisions(id) ON DELETE RESTRICT,
  project_form_instance_id uuid REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  project_form_instance_revision_id uuid REFERENCES project_form_instance_revisions(id) ON DELETE RESTRICT,
  ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ecr_revision_id uuid REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  ecn_revision_id uuid REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
  engineering_release_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  rd_project_id text REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid REFERENCES design_control_records(id) ON DELETE RESTRICT,
  source_document_number text NOT NULL,
  source_revision text NOT NULL,
  source_artifact_path text NOT NULL,
  source_pdf_checksum text NOT NULL,
  issued_artifact_path text NOT NULL,
  issued_pdf_checksum text NOT NULL,
  verification_token_hash text NOT NULL UNIQUE,
  recipient_type text NOT NULL,
  recipient_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  recipient_snapshot jsonb NOT NULL,
  department text,
  location text,
  purpose text NOT NULL,
  acknowledgement_required boolean NOT NULL DEFAULT false,
  acknowledged_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  acknowledgement_snapshot jsonb,
  acknowledged_at timestamptz,
  issued_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issued_by_snapshot jsonb NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  lifecycle_status text NOT NULL DEFAULT 'ISSUED',
  disposition text,
  replacement_for_copy_id uuid REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  replaced_by_copy_id uuid REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  source_historical_exception jsonb,
  returned_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_printed_copies_status_check CHECK (
    lifecycle_status IN ('ISSUED','RETURNED','SCANNED','CLOSED','DESTROYED','VOID','LOST','REPLACED')
  )
);
CREATE INDEX IF NOT EXISTS controlled_printed_copies_scope_idx
  ON controlled_printed_copies(rd_project_id,design_control_record_id,lifecycle_status);
CREATE INDEX IF NOT EXISTS controlled_printed_copies_document_idx
  ON controlled_printed_copies(controlled_document_id,document_version_history_id,lifecycle_status);

CREATE TABLE IF NOT EXISTS controlled_printed_copy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_copy_id uuid NOT NULL REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  copy_number_snapshot text NOT NULL,
  event_type text NOT NULL,
  prior_status text,
  resulting_status text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  recipient_snapshot jsonb,
  reason text NOT NULL,
  source_pdf_checksum text NOT NULL,
  issued_pdf_checksum text NOT NULL,
  related_replacement_copy_id uuid REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  before_values jsonb,
  after_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS controlled_printed_copy_events_copy_idx
  ON controlled_printed_copy_events(controlled_copy_id,occurred_at);

CREATE TABLE IF NOT EXISTS controlled_printed_copy_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_copy_id uuid NOT NULL REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES controlled_printed_copy_events(id) ON DELETE RESTRICT,
  attachment_kind text NOT NULL,
  original_filename text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256_checksum text NOT NULL,
  completed_form_evidence boolean NOT NULL DEFAULT false,
  linked_project_form_instance_id uuid REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  linked_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  linked_ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  uploaded_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_snapshot jsonb NOT NULL,
  accepted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  acceptance_snapshot jsonb,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_printed_copy_legacy_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_distribution_log_id uuid NOT NULL UNIQUE REFERENCES document_distribution_logs(id) ON DELETE RESTRICT,
  controlled_copy_id uuid REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  reconciliation_status text NOT NULL DEFAULT 'LEGACY_DISTRIBUTION_UNVERIFIED',
  deterministic_source_reference jsonb,
  reason text NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_printed_copy_scan_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_copy_id uuid NOT NULL REFERENCES controlled_printed_copies(id) ON DELETE RESTRICT,
  attachment_id uuid NOT NULL UNIQUE REFERENCES controlled_printed_copy_attachments(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  reason text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_copy_scan_decision_check CHECK (decision IN ('ACCEPTED','REJECTED'))
);

CREATE OR REPLACE FUNCTION prevent_controlled_copy_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Controlled printed-copy evidence is append-only';
END $$;
DROP TRIGGER IF EXISTS controlled_copy_no_delete ON controlled_printed_copies;
CREATE TRIGGER controlled_copy_no_delete BEFORE DELETE ON controlled_printed_copies
FOR EACH ROW EXECUTE FUNCTION prevent_controlled_copy_evidence_mutation();
DROP TRIGGER IF EXISTS controlled_copy_event_immutable ON controlled_printed_copy_events;
CREATE TRIGGER controlled_copy_event_immutable BEFORE UPDATE OR DELETE ON controlled_printed_copy_events
FOR EACH ROW EXECUTE FUNCTION prevent_controlled_copy_evidence_mutation();
DROP TRIGGER IF EXISTS controlled_copy_attachment_immutable ON controlled_printed_copy_attachments;
CREATE TRIGGER controlled_copy_attachment_immutable BEFORE UPDATE OR DELETE ON controlled_printed_copy_attachments
FOR EACH ROW EXECUTE FUNCTION prevent_controlled_copy_evidence_mutation();
DROP TRIGGER IF EXISTS controlled_copy_scan_acceptance_immutable ON controlled_printed_copy_scan_acceptances;
CREATE TRIGGER controlled_copy_scan_acceptance_immutable BEFORE UPDATE OR DELETE ON controlled_printed_copy_scan_acceptances
FOR EACH ROW EXECUTE FUNCTION prevent_controlled_copy_evidence_mutation();
