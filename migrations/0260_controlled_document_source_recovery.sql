-- Master Document Register source-file recovery controls.
-- Additive only: this migration does not update or delete controlled-document rows.

INSERT INTO perm_capabilities(key, description, category)
VALUES
  ('documents.recovery_view', 'View controlled-document source recovery inventory', 'documents'),
  ('documents.recovery_preview', 'Create read-only source recovery previews', 'documents'),
  ('documents.recovery_import', 'Stage exact controlled-document bytes in managed storage', 'documents'),
  ('documents.recovery_execute', 'Execute checksum-bound source recovery handoffs', 'documents'),
  ('documents.recovery_disposition', 'Record append-only Quality duplicate dispositions', 'documents')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS controlled_document_recovery_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_hash text NOT NULL,
  policy_version text NOT NULL,
  normalized_document_code text NOT NULL,
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  source_snapshot jsonb NOT NULL,
  document_snapshot jsonb NOT NULL,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_action text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_document_recovery_preview_hash_format
    CHECK (preview_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS controlled_document_recovery_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid NOT NULL REFERENCES controlled_document_recovery_previews(id) ON DELETE RESTRICT,
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  request_identity_hash text NOT NULL,
  storage_object_path text,
  storage_provider text,
  original_filename text NOT NULL,
  media_type text NOT NULL,
  file_size bigint NOT NULL,
  file_checksum text NOT NULL,
  expected_checksum text,
  source_type text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'RESERVED',
  failure_code text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  staged_at timestamptz,
  consumed_at timestamptz,
  CONSTRAINT controlled_document_recovery_import_checksum_format
    CHECK (file_checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT controlled_document_recovery_import_expected_checksum_format
    CHECK (expected_checksum IS NULL OR expected_checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT controlled_document_recovery_import_size_positive
    CHECK (file_size > 0 AND file_size <= 52428800),
  CONSTRAINT controlled_document_recovery_import_status_allowed
    CHECK (status IN ('RESERVED','STAGED','CONSUMED','STAGING_FAILED','CLEANUP_REQUIRED')),
  CONSTRAINT controlled_document_recovery_import_source_type_allowed
    CHECK (source_type IN ('DIRECT_UPLOAD','GOOGLE_DRIVE_PROVENANCE','LEGACY_EPOCH_REFERENCE','OTHER_VERIFIED_SOURCE'))
);

CREATE TABLE IF NOT EXISTS controlled_document_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES controlled_document_recovery_previews(id) ON DELETE RESTRICT,
  import_id uuid REFERENCES controlled_document_recovery_imports(id) ON DELETE RESTRICT,
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES document_version_history(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  policy_version text NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  checksum text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_document_recovery_event_checksum_format
    CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS controlled_document_recovery_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_document_code text NOT NULL,
  authoritative_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  related_document_ids jsonb NOT NULL,
  disposition text NOT NULL,
  supporting_evidence jsonb NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT controlled_document_recovery_disposition_allowed
    CHECK (disposition IN ('AUTHORITATIVE_RECORD_SELECTED','REFERENCE_ONLY','OBSOLETE','VOID','MANUAL_REVIEW_REQUIRED'))
);

-- Drizzle may create the additive tables before safe boot. Add the canonical
-- checks when the tables exist but the migration-owned constraints do not.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_preview_hash_format' AND conrelid='controlled_document_recovery_previews'::regclass) THEN
    ALTER TABLE controlled_document_recovery_previews
      ADD CONSTRAINT controlled_document_recovery_preview_hash_format
      CHECK (preview_hash ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_import_checksum_format' AND conrelid='controlled_document_recovery_imports'::regclass) THEN
    ALTER TABLE controlled_document_recovery_imports
      ADD CONSTRAINT controlled_document_recovery_import_checksum_format
      CHECK (file_checksum ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_import_expected_checksum_format' AND conrelid='controlled_document_recovery_imports'::regclass) THEN
    ALTER TABLE controlled_document_recovery_imports
      ADD CONSTRAINT controlled_document_recovery_import_expected_checksum_format
      CHECK (expected_checksum IS NULL OR expected_checksum ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_import_size_positive' AND conrelid='controlled_document_recovery_imports'::regclass) THEN
    ALTER TABLE controlled_document_recovery_imports
      ADD CONSTRAINT controlled_document_recovery_import_size_positive
      CHECK (file_size > 0 AND file_size <= 52428800);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_import_status_allowed' AND conrelid='controlled_document_recovery_imports'::regclass) THEN
    ALTER TABLE controlled_document_recovery_imports
      ADD CONSTRAINT controlled_document_recovery_import_status_allowed
      CHECK (status IN ('RESERVED','STAGED','CONSUMED','STAGING_FAILED','CLEANUP_REQUIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_import_source_type_allowed' AND conrelid='controlled_document_recovery_imports'::regclass) THEN
    ALTER TABLE controlled_document_recovery_imports
      ADD CONSTRAINT controlled_document_recovery_import_source_type_allowed
      CHECK (source_type IN ('DIRECT_UPLOAD','GOOGLE_DRIVE_PROVENANCE','LEGACY_EPOCH_REFERENCE','OTHER_VERIFIED_SOURCE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_event_checksum_format' AND conrelid='controlled_document_recovery_events'::regclass) THEN
    ALTER TABLE controlled_document_recovery_events
      ADD CONSTRAINT controlled_document_recovery_event_checksum_format
      CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='controlled_document_recovery_disposition_allowed' AND conrelid='controlled_document_recovery_dispositions'::regclass) THEN
    ALTER TABLE controlled_document_recovery_dispositions
      ADD CONSTRAINT controlled_document_recovery_disposition_allowed
      CHECK (disposition IN ('AUTHORITATIVE_RECORD_SELECTED','REFERENCE_ONLY','OBSOLETE','VOID','MANUAL_REVIEW_REQUIRED'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS controlled_document_recovery_previews_document_idx
  ON controlled_document_recovery_previews(controlled_document_id, created_at);
CREATE INDEX IF NOT EXISTS controlled_document_recovery_imports_document_idx
  ON controlled_document_recovery_imports(controlled_document_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS controlled_document_recovery_imports_idempotency_uidx
  ON controlled_document_recovery_imports(idempotency_key);
CREATE INDEX IF NOT EXISTS controlled_document_recovery_imports_status_idx
  ON controlled_document_recovery_imports(status, created_at);
CREATE INDEX IF NOT EXISTS controlled_document_recovery_events_document_idx
  ON controlled_document_recovery_events(controlled_document_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS controlled_document_recovery_events_idempotency_uidx
  ON controlled_document_recovery_events(idempotency_key);
CREATE INDEX IF NOT EXISTS controlled_document_recovery_dispositions_code_idx
  ON controlled_document_recovery_dispositions(normalized_document_code, created_at);

CREATE OR REPLACE FUNCTION reject_controlled_document_recovery_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONTROLLED_DOCUMENT_RECOVERY_HISTORY_IS_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS controlled_document_recovery_previews_append_only
  ON controlled_document_recovery_previews;
CREATE TRIGGER controlled_document_recovery_previews_append_only
  BEFORE UPDATE OR DELETE ON controlled_document_recovery_previews
  FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_recovery_history_mutation();

DROP TRIGGER IF EXISTS controlled_document_recovery_events_append_only
  ON controlled_document_recovery_events;
CREATE TRIGGER controlled_document_recovery_events_append_only
  BEFORE UPDATE OR DELETE ON controlled_document_recovery_events
  FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_recovery_history_mutation();

DROP TRIGGER IF EXISTS controlled_document_recovery_dispositions_append_only
  ON controlled_document_recovery_dispositions;
CREATE TRIGGER controlled_document_recovery_dispositions_append_only
  BEFORE UPDATE OR DELETE ON controlled_document_recovery_dispositions
  FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_recovery_history_mutation();

COMMENT ON TABLE controlled_document_recovery_imports IS
  'Mutable staging registry only. Immutable recovery evidence is retained in controlled_document_recovery_events.';
COMMENT ON COLUMN controlled_document_recovery_imports.storage_object_path IS
  'Private managed-storage identity; never returned to clients or copied into audit payloads.';
COMMENT ON TABLE controlled_document_recovery_dispositions IS
  'Append-only Quality decisions. Dispositions do not merge, delete, or renumber historical records.';
