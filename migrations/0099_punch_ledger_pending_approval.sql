-- Migration 0099: enforce supervisor approval on TRAVELER-source punches
-- Per Architecture Constitution §5.2 (Task #77).
--
-- Changes:
--   1. Switch punch_ledger.approval_status default from 'AUTO' to 'PENDING_APPROVAL'.
--   2. Enforce the allowed-value enum via CHECK constraint.
--   3. Forbid TRAVELER-source punches from carrying approval_status = 'AUTO'.
--   4. Require labor_approval_id linkage for any APPROVED, WAD-linked TRAVELER punch.
--      This is the core integrity invariant: a punch cannot be APPROVED without
--      a corresponding labor_approvals audit row to back it up.
--
-- DEPLOYMENT SAFETY:
--   This migration begins with a fail-fast precondition that aborts with an
--   actionable error if historical TRAVELER+AUTO rows still exist.  Run
--      npx tsx server/scripts/backfillPunchApprovals.ts --apply --cutover <ISO-DATE>
--   first; the script reconciles legacy rows up to the cutover timestamp and
--   leaves post-cutover data untouched (post-cutover writes already obey the
--   PENDING_APPROVAL default thanks to the application-layer changes in this
--   task, so they should not be in TRAVELER+AUTO state).

BEGIN;

-- 0. Fail-fast precondition: refuse to proceed if any TRAVELER+AUTO rows remain.
--    The CHECK constraints below would fail at ALTER time with a noisy error;
--    this gives a single actionable message instead.
DO $$
DECLARE
  legacy_count BIGINT;
  legacy_approved_unlinked BIGINT;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM punch_ledger
  WHERE source = 'TRAVELER' AND approval_status = 'AUTO';

  IF legacy_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0099 precondition failed: % TRAVELER+AUTO rows still exist. Run `npx tsx server/scripts/backfillPunchApprovals.ts --apply --cutover <ISO-DATE>` before applying this migration.',
      legacy_count;
  END IF;

  SELECT COUNT(*) INTO legacy_approved_unlinked
  FROM punch_ledger
  WHERE source = 'TRAVELER'
    AND approval_status = 'APPROVED'
    AND production_work_order_id IS NOT NULL
    AND labor_approval_id IS NULL;

  IF legacy_approved_unlinked > 0 THEN
    RAISE EXCEPTION
      'Migration 0099 precondition failed: % APPROVED TRAVELER+WAD-linked rows lack labor_approval_id. Run the backfill script to link them to labor_approvals rows before applying this migration.',
      legacy_approved_unlinked;
  END IF;
END $$;

-- 1. Default + NOT NULL.
ALTER TABLE punch_ledger
  ALTER COLUMN approval_status SET DEFAULT 'PENDING_APPROVAL';
UPDATE punch_ledger SET approval_status = 'PENDING_APPROVAL' WHERE approval_status IS NULL;
ALTER TABLE punch_ledger
  ALTER COLUMN approval_status SET NOT NULL;

-- 2. Enum guard.
ALTER TABLE punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_approval_status_chk;
ALTER TABLE punch_ledger
  ADD CONSTRAINT punch_ledger_approval_status_chk
  CHECK (approval_status IN (
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'APPROVED_OVERRUN',
    'FLAGGED',
    'AUTO'
  ));

-- 3. §5.2 hard guard: TRAVELER-source punches may never be 'AUTO'.
ALTER TABLE punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_traveler_no_auto_chk;
ALTER TABLE punch_ledger
  ADD CONSTRAINT punch_ledger_traveler_no_auto_chk
  CHECK (NOT (source = 'TRAVELER' AND approval_status = 'AUTO'));

-- 4. Approval-integrity invariant: an APPROVED, WAD-linked TRAVELER punch
--    MUST have labor_approval_id set.  This prevents any code path (current
--    or future) from silently flipping a punch to APPROVED without inserting
--    the corresponding labor_approvals audit row first.  APPROVED_OVERRUN
--    rows must instead be linked via labor_budget_override_id.
ALTER TABLE punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_approved_requires_link_chk;
ALTER TABLE punch_ledger
  ADD CONSTRAINT punch_ledger_approved_requires_link_chk
  CHECK (
    NOT (
      source = 'TRAVELER'
      AND production_work_order_id IS NOT NULL
      AND approval_status = 'APPROVED'
      AND labor_approval_id IS NULL
    )
    AND NOT (
      source = 'TRAVELER'
      AND production_work_order_id IS NOT NULL
      AND approval_status = 'APPROVED_OVERRUN'
      AND labor_approval_id IS NULL
      AND labor_budget_override_id IS NULL
    )
  );

COMMIT;
