-- 0099_audit_evidence_hardening.sql
-- Task #85 — Unified, append-only, tamper-evident, hash-chained audit ledger.
--
-- This migration:
--   1. Extends `audit_events` with normalized subject + hash-chain columns.
--   2. Adds an append-only trigger that blocks UPDATE / DELETE on audit_events
--      and records the tamper attempt as a high-severity ledger event.
--   3. Adds `audit_anchors` for periodic chain-head checkpoints.
--   4. Adds `audit_retention_policies` with a DCAA-aligned minimum floor.
--
-- All operations are idempotent: this file may be re-run safely.

-- ---------------------------------------------------------------
-- 1. Extend audit_events with hash-chain & subject columns
-- ---------------------------------------------------------------
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS subject_type    TEXT,
  ADD COLUMN IF NOT EXISTS subject_id      TEXT,
  ADD COLUMN IF NOT EXISTS payload_json    JSONB,
  ADD COLUMN IF NOT EXISTS payload_hash    TEXT,
  ADD COLUMN IF NOT EXISTS prev_hash       TEXT,
  ADD COLUMN IF NOT EXISTS row_hash        TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_service  TEXT,
  ADD COLUMN IF NOT EXISTS sequence_number BIGINT;

-- Backfill subject_type / subject_id from the legacy entity_* columns so
-- unified queries see every historical row.
UPDATE public.audit_events
   SET subject_type = entity_type
 WHERE subject_type IS NULL;
UPDATE public.audit_events
   SET subject_id = entity_id
 WHERE subject_id IS NULL;

CREATE INDEX IF NOT EXISTS audit_events_subject_idx
  ON public.audit_events (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS audit_events_source_service_idx
  ON public.audit_events (source_service);
CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx
  ON public.audit_events (occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_sequence_number_uidx
  ON public.audit_events (sequence_number)
  WHERE sequence_number IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. Append-only enforcement at the database layer.
--    Bypass requires session GUC `audit.allow_archive = true`,
--    intended for the soft-archival pathway run as a maintenance job.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_events_block_dml()
RETURNS trigger AS $$
DECLARE
  bypass TEXT;
BEGIN
  bypass := current_setting('audit.allow_archive', true);
  IF bypass IS NULL OR bypass <> 'true' THEN
    -- Best-effort: record the tamper attempt. Never let an error here
    -- swallow the RAISE that follows.
    BEGIN
      INSERT INTO public.audit_events (
        entity_type, entity_id, action, actor_name, reason,
        meta, subject_type, subject_id, payload_json,
        recorded_at, source_service
      ) VALUES (
        'audit_ledger', TG_OP, 'AUDIT_DML_BLOCKED',
        current_user, 'Tamper attempt blocked by audit_events trigger',
        jsonb_build_object('op', TG_OP, 'role', current_user),
        'audit_ledger', TG_OP, jsonb_build_object('op', TG_OP),
        NOW(), 'audit_trigger'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE EXCEPTION 'audit_events is append-only; % blocked by audit_events_block_dml', TG_OP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_block_update ON public.audit_events;
CREATE TRIGGER audit_events_block_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_block_dml();

DROP TRIGGER IF EXISTS audit_events_block_delete ON public.audit_events;
CREATE TRIGGER audit_events_block_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_block_dml();

-- ---------------------------------------------------------------
-- 3. Anchor checkpoints — daily chain-head snapshot
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_anchors (
  id             SERIAL PRIMARY KEY,
  anchored_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  head_event_id  INTEGER REFERENCES public.audit_events(id),
  head_row_hash  TEXT,
  head_sequence  BIGINT,
  event_count    BIGINT,
  notes          TEXT,
  exported_to    TEXT,
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS audit_anchors_anchored_at_idx
  ON public.audit_anchors (anchored_at DESC);

-- ---------------------------------------------------------------
-- 4. Retention policies — DCAA-aligned minimum floor (7 years)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_retention_policies (
  id                  SERIAL PRIMARY KEY,
  event_type          TEXT NOT NULL UNIQUE,
  min_retention_days  INTEGER NOT NULL DEFAULT 2555,
  archive_after_days  INTEGER,
  description         TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.audit_retention_policies (event_type, min_retention_days, archive_after_days, description)
VALUES
  ('*',                       2555, NULL, 'Default DCAA-aligned 7-year retention floor for all audit event types'),
  ('PAYROLL_EXPORT',          2555, NULL, 'Payroll export batches & supersede events (FAR/DCAA)'),
  ('LABOR_APPROVAL',          2555, NULL, 'Labor approval / supervisor sign-off audit trail'),
  ('LABOR_CORRECTION',        2555, NULL, 'Manual labor corrections (immutable addendum records)'),
  ('PERIOD_CLOSE',            2555, NULL, 'Pay period close / reopen events'),
  ('PROCUREMENT_APPROVAL',    2555, NULL, 'Procurement approvals & PO release events'),
  ('POLICY_ACKNOWLEDGMENT',   2555, NULL, 'Employee acknowledgments of written policies'),
  ('AUDIT_DML_BLOCKED',       3650, NULL, 'Tamper-attempt records — extended retention')
ON CONFLICT (event_type) DO NOTHING;
