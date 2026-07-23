-- Phase 3: additive Master Document Register lifecycle and revision hardening.
ALTER TABLE IF EXISTS controlled_documents
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS lifecycle_reason text,
  ADD COLUMN IF NOT EXISTS current_revision_id uuid,
  ADD COLUMN IF NOT EXISTS current_released_revision_id uuid,
  ADD COLUMN IF NOT EXISTS working_draft_revision_id uuid,
  ADD COLUMN IF NOT EXISTS number_control_status text NOT NULL DEFAULT 'LEGACY_UNVERIFIED';

ALTER TABLE IF EXISTS document_version_history
  ADD COLUMN IF NOT EXISTS revision_sequence integer,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS file_size integer,
  ADD COLUMN IF NOT EXISTS file_checksum text,
  ADD COLUMN IF NOT EXISTS checksum_status text NOT NULL DEFAULT 'PENDING_BACKFILL',
  ADD COLUMN IF NOT EXISTS submitted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS submitted_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reviewed_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approved_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS released_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS released_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_revision_id uuid,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS obsoleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS obsoleted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revision_reason text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY document_id ORDER BY created_at NULLS FIRST, id
  ) AS sequence
  FROM document_version_history
)
UPDATE document_version_history history
SET revision_sequence = ranked.sequence
FROM ranked
WHERE history.id = ranked.id AND history.revision_sequence IS NULL;

ALTER TABLE document_version_history
  ALTER COLUMN revision_sequence SET DEFAULT 1,
  ALTER COLUMN revision_sequence SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS document_version_history_document_sequence_unique
  ON document_version_history(document_id, revision_sequence);
CREATE INDEX IF NOT EXISTS document_version_history_document_lifecycle_idx
  ON document_version_history(document_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS document_version_history_checksum_idx
  ON document_version_history(file_checksum) WHERE file_checksum IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE controlled_documents ADD CONSTRAINT controlled_documents_lifecycle_check
    CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','APPROVED','RELEASED','SUPERSEDED','OBSOLETE','VOID'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE document_version_history ADD CONSTRAINT document_version_history_lifecycle_check
    CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','APPROVED','RELEASED','SUPERSEDED','OBSOLETE','VOID'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE controlled_documents ADD CONSTRAINT controlled_documents_current_revision_fk
    FOREIGN KEY (current_revision_id) REFERENCES document_version_history(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE controlled_documents ADD CONSTRAINT controlled_documents_current_released_revision_fk
    FOREIGN KEY (current_released_revision_id) REFERENCES document_version_history(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE controlled_documents ADD CONSTRAINT controlled_documents_working_draft_revision_fk
    FOREIGN KEY (working_draft_revision_id) REFERENCES document_version_history(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE document_version_history ADD CONSTRAINT document_version_history_superseding_fk
    FOREIGN KEY (superseded_by_revision_id) REFERENCES document_version_history(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS controlled_document_number_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_number text NOT NULL UNIQUE,
  display_number text NOT NULL,
  controlled_document_id uuid REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'RESERVED',
  conflict_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reserved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  reserved_by_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS controlled_document_revision_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  controlled_document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES document_version_history(id) ON DELETE RESTRICT,
  file_checksum text NOT NULL,
  document_number_snapshot text NOT NULL,
  revision_snapshot text NOT NULL,
  decision text NOT NULL,
  signature_meaning text NOT NULL,
  decision_comment text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_status text NOT NULL DEFAULT 'VALID',
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS controlled_document_revision_approvals_revision_idx
  ON controlled_document_revision_approvals(revision_id);
CREATE UNIQUE INDEX IF NOT EXISTS controlled_document_revision_approved_unique
  ON controlled_document_revision_approvals(revision_id)
  WHERE decision = 'APPROVED' AND approval_status = 'VALID';
DO $$ BEGIN
  ALTER TABLE controlled_document_revision_approvals
    ADD CONSTRAINT controlled_document_revision_approval_decision_check
    CHECK (decision IN ('APPROVED','REJECTED','RETURNED_FOR_REVISION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE controlled_document_revision_approvals
    ADD CONSTRAINT controlled_document_revision_approval_status_check
    CHECK (approval_status IN ('VALID','INVALIDATED','SUPERSEDED','REVOKED','EXTERNAL_EVIDENCE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION protect_controlled_document_approval_evidence()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Controlled document approval evidence is append-only';
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  CREATE TRIGGER prevent_controlled_document_revision_approval_update
    BEFORE UPDATE OR DELETE ON controlled_document_revision_approvals
    FOR EACH ROW EXECUTE FUNCTION protect_controlled_document_approval_evidence();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Deterministic legacy authority: only unique normalized numbers are reserved.
WITH normalized AS (
  SELECT upper(trim(document_number)) AS normalized_number,
         min(document_number) AS display_number,
         min(id::text)::uuid AS document_id,
         count(*) AS occurrences,
         jsonb_agg(id ORDER BY id) AS ids
  FROM controlled_documents
  GROUP BY upper(trim(document_number))
)
INSERT INTO controlled_document_number_registry (
  normalized_number, display_number, controlled_document_id, status, conflict_document_ids
)
SELECT normalized_number, display_number,
       CASE WHEN occurrences = 1 THEN document_id ELSE NULL END,
       CASE WHEN occurrences = 1 THEN 'RESERVED' ELSE 'NUMBER_RECONCILIATION_REQUIRED' END,
       CASE WHEN occurrences = 1 THEN '[]'::jsonb ELSE ids END
FROM normalized
ON CONFLICT (normalized_number) DO NOTHING;

UPDATE controlled_documents document
SET number_control_status = CASE
  WHEN registry.status = 'RESERVED' THEN 'RESERVED'
  ELSE 'NUMBER_RECONCILIATION_REQUIRED'
END
FROM controlled_document_number_registry registry
WHERE registry.normalized_number = upper(trim(document.document_number));

-- Do not invent checksums or release provenance. Link only an unambiguous latest row.
WITH latest AS (
  SELECT DISTINCT ON (document_id) document_id, id, version_number, file_path
  FROM document_version_history
  ORDER BY document_id, revision_sequence DESC, created_at DESC NULLS LAST
)
UPDATE controlled_documents document
SET current_revision_id = latest.id,
    working_draft_revision_id = CASE
      WHEN document.lifecycle_status IN ('DRAFT','IN_REVIEW','APPROVED') THEN latest.id ELSE NULL
    END
FROM latest
WHERE document.id = latest.document_id
  AND document.current_revision_id IS NULL
  AND (document.current_version = latest.version_number OR document.file_path = latest.file_path);

CREATE OR REPLACE FUNCTION protect_controlled_document_evidence()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Controlled document and revision evidence cannot be hard-deleted';
  END IF;
  IF OLD.lifecycle_status IN ('RELEASED','SUPERSEDED','OBSOLETE')
     AND (NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_checksum IS DISTINCT FROM OLD.file_checksum
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.revision_sequence IS DISTINCT FROM OLD.revision_sequence) THEN
    RAISE EXCEPTION 'Released controlled revision file identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER prevent_document_version_history_delete
    BEFORE DELETE ON document_version_history
    FOR EACH ROW EXECUTE FUNCTION protect_controlled_document_evidence();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER protect_released_document_revision_identity
    BEFORE UPDATE ON document_version_history
    FOR EACH ROW EXECUTE FUNCTION protect_controlled_document_evidence();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION prevent_controlled_document_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Controlled documents cannot be hard-deleted; use VOID or OBSOLETE';
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  CREATE TRIGGER prevent_controlled_document_hard_delete
    BEFORE DELETE ON controlled_documents
    FOR EACH ROW EXECUTE FUNCTION prevent_controlled_document_delete();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('documents.view', 'View controlled documents and exact revisions', 'documents'),
  ('documents.create', 'Create controlled documents and reserve document numbers', 'documents'),
  ('documents.edit_draft', 'Edit controlled document draft metadata', 'documents'),
  ('documents.submit', 'Submit controlled revisions for review', 'documents'),
  ('documents.approve', 'Approve exact controlled document revisions', 'documents'),
  ('documents.release', 'Release approved controlled document revisions', 'documents'),
  ('documents.revise', 'Create new controlled document revisions', 'documents'),
  ('documents.supersede', 'Supersede released controlled document revisions', 'documents'),
  ('documents.obsolete', 'Obsolete controlled documents', 'documents'),
  ('documents.void', 'Void unreleased controlled documents', 'documents'),
  ('documents.number_admin', 'Reconcile and administer controlled document numbers', 'documents')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key LIKE 'documents.%'
WHERE role.name IN ('ADMIN','OWNER','DOCUMENT_MANAGER')
ON CONFLICT (role_id, capability_id) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key = 'documents.view'
ON CONFLICT (role_id, capability_id) DO NOTHING;
