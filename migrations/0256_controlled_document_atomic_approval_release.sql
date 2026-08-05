-- Prospective Phase 2 evidence only. Applying migration 0256 does not activate Phase 2.
BEGIN;

CREATE TABLE IF NOT EXISTS controlled_document_approval_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  approval_id uuid NOT NULL REFERENCES controlled_document_revision_approvals(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  file_checksum text NOT NULL CHECK (file_checksum ~ '^[0-9a-f]{64}$'),
  document_number_snapshot text NOT NULL,
  revision_snapshot text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  authority_snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  before_lifecycle text NOT NULL,
  after_lifecycle text NOT NULL CHECK (after_lifecycle = 'RELEASED'),
  effective_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_document_approval_release_revision_uidx UNIQUE (revision_id)
);

CREATE INDEX IF NOT EXISTS controlled_document_approval_release_document_idx
  ON controlled_document_approval_release_events(controlled_document_id, created_at);

CREATE OR REPLACE FUNCTION reject_controlled_document_approval_release_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'controlled document approval-release evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS controlled_document_approval_release_events_append_only
  ON controlled_document_approval_release_events;
CREATE TRIGGER controlled_document_approval_release_events_append_only
BEFORE UPDATE OR DELETE ON controlled_document_approval_release_events
FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_approval_release_event_mutation();

-- Prospective state only. No existing row is updated.
ALTER TABLE controlled_documents DROP CONSTRAINT IF EXISTS controlled_documents_lifecycle_check;
ALTER TABLE controlled_documents ADD CONSTRAINT controlled_documents_lifecycle_check
  CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','RELEASED','SUPERSEDED','OBSOLETE','VOID')) NOT VALID;
ALTER TABLE controlled_documents VALIDATE CONSTRAINT controlled_documents_lifecycle_check;

ALTER TABLE document_version_history DROP CONSTRAINT IF EXISTS document_version_history_lifecycle_check;
ALTER TABLE document_version_history ADD CONSTRAINT document_version_history_lifecycle_check
  CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','RELEASED','SUPERSEDED','OBSOLETE','VOID')) NOT VALID;
ALTER TABLE document_version_history VALIDATE CONSTRAINT document_version_history_lifecycle_status_check;

COMMIT;
