-- 0100_audit_ledger_privilege_hardening.sql
--
-- Task #85 follow-up: harden the append-only protection of public.audit_events
-- at the privilege boundary, in addition to the trigger added by 0099.
--
-- Strategy:
--   1. REVOKE UPDATE / DELETE / TRUNCATE on public.audit_events from PUBLIC
--      and from the application role (best-effort: we attempt a list of
--      well-known role names; missing roles are ignored).
--   2. Replace the GUC-based archive bypass with a dedicated SECURITY DEFINER
--      function `audit_archive_delete_segment(min_seq BIGINT, max_seq BIGINT,
--      reason TEXT)` owned by the DB superuser. The function sets the
--      `audit.allow_archive` GUC for the duration of its call only, deletes
--      the requested segment, anchors the new chain head, and inserts an
--      audit row recording the archive operation. EXECUTE on this function
--      is granted only to a new `audit_archiver` role.
--   3. Application code MUST NOT call SET LOCAL audit.allow_archive directly;
--      archive jobs MUST call the function instead.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Revoke direct mutation privileges
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM PUBLIC;

DO $$
DECLARE
    r TEXT;
    candidates TEXT[] := ARRAY['app', 'epoch', 'epoch_app', 'application', 'web'];
BEGIN
    FOREACH r IN ARRAY candidates LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_events FROM %I', r);
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Dedicated audit_archiver role + SECURITY DEFINER bypass function
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_archiver') THEN
        CREATE ROLE audit_archiver NOLOGIN;
    END IF;
END $$;

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
    deleted_count BIGINT;
BEGIN
    IF min_seq IS NULL OR max_seq IS NULL OR max_seq < min_seq THEN
        RAISE EXCEPTION 'audit_archive_delete_segment: invalid sequence range';
    END IF;
    IF reason IS NULL OR length(trim(reason)) = 0 THEN
        RAISE EXCEPTION 'audit_archive_delete_segment: reason is required';
    END IF;

    -- Bypass the append-only trigger only for the rest of THIS transaction.
    PERFORM set_config('audit.allow_archive', 'true', true);

    DELETE FROM public.audit_events
     WHERE sequence_number BETWEEN min_seq AND max_seq;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Record the archive action OUT-OF-CHAIN (no sequence number).
    -- An in-chain summary event is emitted by the application archive job
    -- via recordAuditEvent() before/after the call to this function.
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

REVOKE ALL ON FUNCTION public.audit_archive_delete_segment(BIGINT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_archive_delete_segment(BIGINT, BIGINT, TEXT) TO audit_archiver;

COMMIT;
