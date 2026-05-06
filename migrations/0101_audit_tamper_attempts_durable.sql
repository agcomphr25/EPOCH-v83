-- 0101_audit_tamper_attempts_durable.sql
-- Task #85 follow-up — make tamper-attempt evidence durable.
--
-- Background:
--   The append-only trigger on public.audit_events (added by 0099) inserts an
--   AUDIT_DML_BLOCKED record and then RAISEs an exception.  In Postgres, that
--   exception aborts the surrounding transaction, which silently rolls back the
--   tamper-attempt row.  The required forensic evidence is therefore lost.
--
-- Fix:
--   1. Add a dedicated public.audit_dml_attempts table.  This is the durable
--      sink for tamper attempts.  It is itself protected against DML the same
--      way audit_events is (REVOKEs + a block trigger).
--   2. Open an autonomous-style transaction inside the audit_events trigger
--      using dblink to write the attempt to audit_dml_attempts BEFORE raising
--      the exception.  Because dblink commits in its own backend connection,
--      the row survives the rollback of the offending UPDATE/DELETE.
--   3. The attempt is also mirrored into the unified audit ledger AFTER the
--      fact by a scheduled drainer (see auditLedgerService.drainTamperAttempts)
--      so the chain reflects every blocked attempt with sequence + hash.

BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE TABLE IF NOT EXISTS public.audit_dml_attempts (
  id              BIGSERIAL PRIMARY KEY,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  op              TEXT        NOT NULL,
  db_role         TEXT        NOT NULL,
  session_user_n  TEXT        NOT NULL,
  client_addr     INET,
  application_nm  TEXT,
  target_id       INTEGER,
  target_seq      BIGINT,
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  drained_at      TIMESTAMPTZ,
  drained_event_id INTEGER REFERENCES public.audit_events(id)
);

CREATE INDEX IF NOT EXISTS audit_dml_attempts_attempted_at_idx
  ON public.audit_dml_attempts (attempted_at DESC);
CREATE INDEX IF NOT EXISTS audit_dml_attempts_undrained_idx
  ON public.audit_dml_attempts (id)
  WHERE drained_at IS NULL;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_dml_attempts FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.audit_dml_attempts_block()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Allow ONLY drained_at / drained_event_id to be set (one-shot, never reset).
    IF OLD.drained_at IS NOT NULL THEN
      RAISE EXCEPTION 'audit_dml_attempts: drained_at is one-shot and cannot be reset';
    END IF;
    IF NEW.attempted_at <> OLD.attempted_at
       OR NEW.op <> OLD.op
       OR NEW.db_role <> OLD.db_role
       OR NEW.payload::text <> OLD.payload::text THEN
      RAISE EXCEPTION 'audit_dml_attempts: only drained_at / drained_event_id may be updated';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_dml_attempts is append-only; % blocked', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_dml_attempts_block_delete ON public.audit_dml_attempts;
CREATE TRIGGER audit_dml_attempts_block_delete
  BEFORE DELETE ON public.audit_dml_attempts
  FOR EACH ROW EXECUTE FUNCTION public.audit_dml_attempts_block();

DROP TRIGGER IF EXISTS audit_dml_attempts_block_update ON public.audit_dml_attempts;
CREATE TRIGGER audit_dml_attempts_block_update
  BEFORE UPDATE ON public.audit_dml_attempts
  FOR EACH ROW EXECUTE FUNCTION public.audit_dml_attempts_block();

-- ---------------------------------------------------------------------------
-- Replace audit_events_block_dml so it logs durably via dblink before raising.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_events_block_dml()
RETURNS trigger AS $$
DECLARE
  bypass         TEXT;
  conn_target    TEXT;
  insert_sql     TEXT;
BEGIN
  bypass := current_setting('audit.allow_archive', true);
  IF bypass = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Build the connection string for the local DB.  We re-enter via dblink so
  -- the INSERT lives in its own backend transaction and survives the RAISE
  -- below that aborts the offending statement.
  conn_target := format(
    'host=%s port=%s dbname=%s user=%s',
    coalesce(current_setting('audit.dblink_host',  true), 'localhost'),
    coalesce(current_setting('audit.dblink_port',  true), '5432'),
    current_database(),
    current_user
  );

  insert_sql := format(
    $sql$INSERT INTO public.audit_dml_attempts
      (op, db_role, session_user_n, client_addr, application_nm, target_id, target_seq, payload)
      VALUES (%L, %L, %L, %L, %L, %s, %s, %L::jsonb)$sql$,
    TG_OP,
    current_user,
    session_user,
    coalesce(host(inet_client_addr())::text, ''),
    coalesce(current_setting('application_name', true), ''),
    coalesce((CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text, 'NULL'),
    coalesce((CASE WHEN TG_OP = 'DELETE' THEN OLD.sequence_number ELSE NEW.sequence_number END)::text, 'NULL'),
    jsonb_build_object(
      'op',           TG_OP,
      'old_row_hash', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.row_hash ELSE NULL END,
      'new_row_hash', CASE WHEN TG_OP = 'UPDATE'             THEN NEW.row_hash ELSE NULL END,
      'old_action',   CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.action   ELSE NULL END
    )::text
  );

  -- Best-effort durable write.  If dblink is unavailable we still raise so the
  -- offending statement is rejected; we just lose the autonomous record.
  BEGIN
    PERFORM dblink_exec(conn_target, insert_sql);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_events_block_dml: dblink_exec failed: %', SQLERRM;
  END;

  RAISE EXCEPTION 'audit_events is append-only; % blocked by audit_events_block_dml', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Make the archive function anchor-aware: write a pre-anchor of the segment
-- head and a post-anchor of the new chain head, so verification can resume
-- from a known-good waypoint after deletion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_archive_delete_segment(
    min_seq BIGINT,
    max_seq BIGINT,
    reason  TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    deleted_count   BIGINT;
    head_id         INTEGER;
    head_hash       TEXT;
    head_seq        BIGINT;
    pre_event_count BIGINT;
BEGIN
    IF min_seq IS NULL OR max_seq IS NULL OR max_seq < min_seq THEN
        RAISE EXCEPTION 'audit_archive_delete_segment: invalid sequence range';
    END IF;
    IF reason IS NULL OR length(trim(reason)) = 0 THEN
        RAISE EXCEPTION 'audit_archive_delete_segment: reason is required';
    END IF;

    -- 1. Pre-anchor the LAST surviving row before min_seq (verification floor).
    SELECT id, row_hash, sequence_number
      INTO head_id, head_hash, head_seq
      FROM public.audit_events
     WHERE sequence_number IS NOT NULL
       AND sequence_number < min_seq
     ORDER BY sequence_number DESC
     LIMIT 1;

    SELECT count(*) INTO pre_event_count
      FROM public.audit_events
     WHERE sequence_number IS NOT NULL;

    IF head_id IS NOT NULL THEN
      INSERT INTO public.audit_anchors
        (head_event_id, head_row_hash, head_sequence, event_count, notes, created_by)
      VALUES
        (head_id, head_hash, head_seq, pre_event_count,
         format('Pre-archive anchor for segment [%s..%s]: %s', min_seq, max_seq, reason),
         'audit_archive_delete_segment');
    END IF;

    -- 2. Bypass append-only trigger and delete the requested segment.
    PERFORM set_config('audit.allow_archive', 'true', true);
    DELETE FROM public.audit_events
     WHERE sequence_number BETWEEN min_seq AND max_seq;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- 3. Post-anchor the new chain head so verification has a fresh waypoint.
    SELECT id, row_hash, sequence_number
      INTO head_id, head_hash, head_seq
      FROM public.audit_events
     WHERE sequence_number IS NOT NULL
     ORDER BY sequence_number DESC
     LIMIT 1;

    IF head_id IS NOT NULL THEN
      INSERT INTO public.audit_anchors
        (head_event_id, head_row_hash, head_sequence, event_count, notes, created_by)
      VALUES
        (head_id, head_hash, head_seq, pre_event_count - deleted_count,
         format('Post-archive anchor for segment [%s..%s]: %s', min_seq, max_seq, reason),
         'audit_archive_delete_segment');
    END IF;

    -- 4. Out-of-chain summary record of the archive operation itself.
    INSERT INTO public.audit_events (
        entity_type, entity_id, action, reason,
        meta, source_service, occurred_at, recorded_at
    ) VALUES (
        'audit_events', 'segment',
        'AUDIT_ARCHIVE_DELETED', reason,
        jsonb_build_object(
            'min_seq', min_seq,
            'max_seq', max_seq,
            'deleted_count', deleted_count
        ),
        'audit_archive_delete_segment',
        now(), now()
    );

    RETURN deleted_count;
END $$;

COMMIT;
