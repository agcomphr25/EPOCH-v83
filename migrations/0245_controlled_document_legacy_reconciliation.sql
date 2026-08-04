-- Phase 1B: additive, preview-first legacy controlled-document reconciliation.
-- This migration never updates or deletes historical controlled-document evidence.

CREATE TABLE IF NOT EXISTS controlled_document_reconciliation_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_hash text NOT NULL,
  policy_version text NOT NULL,
  selected_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessment_snapshot jsonb NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_document_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES controlled_document_reconciliation_previews(id) ON DELETE RESTRICT,
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provenance text NOT NULL DEFAULT 'LEGACY_MIGRATION_VERIFIED',
  policy_version text NOT NULL,
  original_snapshot jsonb NOT NULL,
  proposed_changes jsonb NOT NULL,
  completed_changes jsonb NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  checksum text,
  file_identity text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_document_reconciliation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  evidence_payload jsonb NOT NULL,
  immutable_file_path text,
  immutable_file_checksum text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS controlled_document_reconciliation_events_document_idx
  ON controlled_document_reconciliation_events(controlled_document_id, created_at);
CREATE INDEX IF NOT EXISTS controlled_document_reconciliation_evidence_document_idx
  ON controlled_document_reconciliation_evidence(controlled_document_id, created_at);

CREATE OR REPLACE FUNCTION reject_controlled_document_reconciliation_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONTROLLED_DOCUMENT_RECONCILIATION_HISTORY_IS_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS controlled_document_reconciliation_events_append_only
  ON controlled_document_reconciliation_events;
CREATE TRIGGER controlled_document_reconciliation_events_append_only
  BEFORE UPDATE OR DELETE ON controlled_document_reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_reconciliation_history_mutation();

DROP TRIGGER IF EXISTS controlled_document_reconciliation_evidence_append_only
  ON controlled_document_reconciliation_evidence;
CREATE TRIGGER controlled_document_reconciliation_evidence_append_only
  BEFORE UPDATE OR DELETE ON controlled_document_reconciliation_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_reconciliation_history_mutation();
