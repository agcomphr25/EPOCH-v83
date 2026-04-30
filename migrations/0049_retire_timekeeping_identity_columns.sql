-- Migration: Retire identity columns from timekeeping.employees (Phase 2)
--
-- Phase 1 (0047_timekeeper_pin_and_timezone.sql) copied pin and timezone into
-- public.employees, making it the canonical identity source. Phase 2 nullifies
-- those shadow columns in timekeeping.employees and renames them to *_deprecated
-- to prevent stale reads from creeping back in.
--
-- SAFETY GATE: This migration ABORTS if any row with epoch_employee_id either
--   (a) has no corresponding public.employees row, or
--   (b) had a legacy pin in timekeeping.employees.pin that was never backfilled
--       into public.employees.timekeeper_pin.
-- Employees that never had a PIN in either system are intentionally PIN-less and
-- are safe to proceed. Resolve any remaining unbackfilled rows, then re-run.
--
-- This migration is idempotent: if the columns are already renamed it is a no-op.

DO $$
DECLARE
  cols_exist          BOOLEAN;
  orphan_link_count   INTEGER := 0;
  missing_pin_count   INTEGER := 0;
  total_issues        INTEGER := 0;
BEGIN
  -- Step 1: Check whether the original column names still exist.
  --         If they are already renamed this migration has already run; exit early.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'first_name'
  ) INTO cols_exist;

  IF NOT cols_exist THEN
    RAISE NOTICE 'Phase 2 (0049): identity columns already renamed — no-op';
    RETURN;
  END IF;

  -- Step 2a: Orphaned links — epoch_employee_id is set but no matching public.employees row.
  --          LEFT JOIN surfaces timekeeping rows whose FK target does not exist.
  SELECT COUNT(*) INTO orphan_link_count
  FROM timekeeping.employees te
  LEFT JOIN public.employees pe ON pe.id = te.epoch_employee_id
  WHERE te.epoch_employee_id IS NOT NULL
    AND pe.id IS NULL;

  -- Step 2b: Unbackfilled PINs — employee had a legacy pin in timekeeping.employees.pin
  --          but it was never copied into public.employees.timekeeper_pin.
  --          Employees that never had a PIN in either system are intentionally
  --          PIN-less and must NOT block this migration.
  SELECT COUNT(*) INTO missing_pin_count
  FROM timekeeping.employees te
  JOIN public.employees pe ON pe.id = te.epoch_employee_id
  WHERE te.epoch_employee_id IS NOT NULL
    AND (te.pin IS NOT NULL AND te.pin <> '')
    AND (pe.timekeeper_pin IS NULL OR pe.timekeeper_pin = '');

  total_issues := orphan_link_count + missing_pin_count;

  IF total_issues > 0 THEN
    RAISE EXCEPTION
      'Phase 2 (0049) ABORTED: % issue(s) block nullification — '
      'orphaned epoch_employee_id references with no public.employees row: %, '
      'linked rows with legacy pin not yet backfilled to public.employees.timekeeper_pin: %. '
      'Complete the Phase 1 PIN backfill and remove dangling FKs, then re-run.',
      total_issues, orphan_link_count, missing_pin_count;
  END IF;

  RAISE NOTICE 'Phase 2 (0049) verification OK: no unbackfilled legacy PINs and no orphaned links';

  -- Step 3: Drop NOT NULL constraints first so the subsequent nullification UPDATE
  --         can succeed even for rows that still carry data in these columns.
  EXECUTE 'ALTER TABLE timekeeping.employees ALTER COLUMN first_name DROP NOT NULL';
  EXECUTE 'ALTER TABLE timekeeping.employees ALTER COLUMN last_name  DROP NOT NULL';
  EXECUTE 'ALTER TABLE timekeeping.employees ALTER COLUMN timezone   DROP NOT NULL';

  -- Step 4: Nullify identity data for all rows linked to public.employees.
  --         public.employees is now the canonical source for these fields.
  EXECUTE '
    UPDATE timekeeping.employees
    SET first_name      = NULL,
        last_name       = NULL,
        employee_number = NULL,
        pin             = NULL,
        timezone        = NULL
    WHERE epoch_employee_id IS NOT NULL
  ';

  -- Step 5: Rename to *_deprecated to signal these columns must not be read or written.
  EXECUTE 'ALTER TABLE timekeeping.employees RENAME COLUMN first_name      TO first_name_deprecated';
  EXECUTE 'ALTER TABLE timekeeping.employees RENAME COLUMN last_name       TO last_name_deprecated';
  EXECUTE 'ALTER TABLE timekeeping.employees RENAME COLUMN employee_number TO employee_number_deprecated';
  EXECUTE 'ALTER TABLE timekeeping.employees RENAME COLUMN pin             TO pin_deprecated';
  EXECUTE 'ALTER TABLE timekeeping.employees RENAME COLUMN timezone        TO timezone_deprecated';

  RAISE NOTICE 'Phase 2 (0049): identity columns renamed to *_deprecated and data nullified for all linked rows';
END $$;
