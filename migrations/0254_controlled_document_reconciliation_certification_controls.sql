-- Phase 1B corrective certification controls. Additive only; migration 0245 remains immutable.
ALTER TABLE controlled_document_reconciliation_events
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS after_snapshot jsonb;

COMMENT ON COLUMN controlled_document_reconciliation_events.before_snapshot IS
  'Complete pre-change snapshot for new reconciliation events; historical 0245 rows remain unchanged.';
COMMENT ON COLUMN controlled_document_reconciliation_events.after_snapshot IS
  'Complete post-change snapshot for new reconciliation events; historical 0245 rows remain unchanged.';

CREATE UNIQUE INDEX IF NOT EXISTS controlled_document_reconciliation_events_idempotency_uidx
  ON controlled_document_reconciliation_events(idempotency_key);

ALTER TABLE controlled_document_reconciliation_evidence
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmation_reason text,
  ADD COLUMN IF NOT EXISTS immutable_file_media_type text,
  ADD COLUMN IF NOT EXISTS immutable_file_size bigint,
  ADD COLUMN IF NOT EXISTS immutable_file_provenance jsonb;

COMMENT ON COLUMN controlled_document_reconciliation_evidence.confirmed_at IS
  'Quality confirmation of historical evidence; never a new electronic approval or release.';
