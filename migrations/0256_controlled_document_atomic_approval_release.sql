-- Prospective Phase 2 evidence only. Applying migration 0256 does not activate Phase 2.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.controlled_document_approval_release_events') IS NOT NULL
     AND EXISTS (
       SELECT required.name
       FROM unnest(ARRAY[
         'id','controlled_document_id','revision_id','approval_id','idempotency_key',
         'request_identity_hash','file_checksum','document_number_snapshot','revision_snapshot',
         'actor_user_id','actor_snapshot','authority_snapshot','reason','before_lifecycle',
         'after_lifecycle','effective_date','created_at'
       ]) required(name)
       LEFT JOIN information_schema.columns actual
         ON actual.table_schema = 'public'
        AND actual.table_name = 'controlled_document_approval_release_events'
        AND actual.column_name = required.name
       WHERE actual.column_name IS NULL
     ) THEN
    RAISE EXCEPTION 'controlled_document_approval_release_events is partially applied or malformed';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS controlled_document_approval_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  approval_id uuid NOT NULL REFERENCES controlled_document_revision_approvals(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  request_identity_hash text NOT NULL CHECK (request_identity_hash ~ '^[0-9a-f]{64}$'),
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (controlled_document_id)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_document_fk FOREIGN KEY (controlled_document_id) REFERENCES controlled_documents(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (revision_id)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_revision_fk FOREIGN KEY (revision_id) REFERENCES document_version_history(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (approval_id)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_approval_fk FOREIGN KEY (approval_id) REFERENCES controlled_document_revision_approvals(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (actor_user_id)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%(idempotency_key)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_idempotency_uidx UNIQUE (idempotency_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) ILIKE '%(revision_id)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_revision_uidx UNIQUE (revision_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%request_identity_hash%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_request_hash_check CHECK (request_identity_hash ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%file_checksum%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_checksum_check CHECK (file_checksum ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%btrim(reason)%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_reason_check CHECK (btrim(reason) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'controlled_document_approval_release_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%after_lifecycle%') THEN
    ALTER TABLE controlled_document_approval_release_events ADD CONSTRAINT controlled_document_approval_release_lifecycle_check CHECK (after_lifecycle = 'RELEASED');
  END IF;
END;
$$;

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

-- Rejection evidence must be truthful when no authoritative checksum is available.
-- Existing approval rows and their values are left untouched.
ALTER TABLE controlled_document_revision_approvals
  ALTER COLUMN file_checksum DROP NOT NULL;
ALTER TABLE controlled_document_revision_approvals
  ADD COLUMN IF NOT EXISTS checksum_verification_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'controlled_document_revision_approvals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%checksum_verification_status%'
      AND pg_get_constraintdef(oid) ILIKE '%VERIFIED%'
      AND pg_get_constraintdef(oid) ILIKE '%UNAVAILABLE%'
      AND pg_get_constraintdef(oid) ILIKE '%MISMATCH%'
  ) THEN
    ALTER TABLE controlled_document_revision_approvals
      ADD CONSTRAINT controlled_document_revision_approvals_checksum_status_check
      CHECK (
        checksum_verification_status IS NULL
        OR checksum_verification_status IN ('VERIFIED', 'UNAVAILABLE', 'MISMATCH')
      );
  END IF;
END;
$$;

COMMIT;
