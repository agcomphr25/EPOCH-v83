-- Migration 0092: Extend timesheet status vocabulary
--
-- Adds four new lifecycle statuses to timekeeping.timesheets:
--   certified            (replaces "approved" semantically)
--   locked               (admin-sealed; requires correction workflow to reopen)
--   correction_requested (formal correction request is pending review)
--   correction_approved  (correction approved; sheet returns to draft in same tx)
--
-- Legacy rows are mapped before the final constraint is applied:
--   "approved"  → "certified"
--   "rejected"  → "draft"   (rejected is no longer a valid terminal status)
--
-- All changes are idempotent.

-- Drop any existing CHECK constraint on status so we can replace it
DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint
  WHERE conrelid = 'timekeeping.timesheets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE timekeeping.timesheets DROP CONSTRAINT %I', _con);
  END IF;
END;
$$;

-- Add an interim CHECK constraint that still accepts legacy values so
-- existing rows are not rejected when the constraint is first added.
ALTER TABLE timekeeping.timesheets
  ADD CONSTRAINT timesheets_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'certified',
    'locked',
    'correction_requested',
    'correction_approved',
    'approved',
    'rejected'
  ));

-- Migrate legacy "approved" rows to "certified"
UPDATE timekeeping.timesheets
SET status = 'certified'
WHERE status = 'approved';

-- Migrate legacy "rejected" rows back to "draft" so employees can
-- re-submit.  "rejected" is no longer a valid terminal status; the new
-- workflow returns a timesheet to "draft" via the reject route instead.
UPDATE timekeeping.timesheets
SET status = 'draft'
WHERE status = 'rejected';

-- Tighten the constraint to the six canonical statuses only
ALTER TABLE timekeeping.timesheets
  DROP CONSTRAINT timesheets_status_check;

ALTER TABLE timekeeping.timesheets
  ADD CONSTRAINT timesheets_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'certified',
    'locked',
    'correction_requested',
    'correction_approved'
  ));
