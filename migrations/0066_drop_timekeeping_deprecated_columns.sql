-- Migration 0066: Drop deprecated identity columns from timekeeping.employees
--
-- Migration 0049 renamed first_name, last_name, employee_number, pin, and timezone
-- to *_deprecated and nullified their data. Task #1316 removed the Drizzle schema
-- mappings so no application code reads or writes them. This migration drops the
-- physical columns entirely to keep the schema tidy and prevent accidental reads
-- of stale identity data via raw SQL or external tooling.
--
-- Task #1329 audit (2026-04-22): All in-repo references to the five *_deprecated
-- column names were reviewed. No production routes, services, ORM queries, views,
-- stored procedures, or reporting SQL were found referencing these names outside of
-- this migration and its origin sibling (0049_retire_timekeeping_identity_columns.sql).
-- The project has no external BI or data-warehouse tooling configured that could
-- reference these columns. Follow-up task #1347 tracks adding a CI guard to prevent
-- future accidental re-introduction.
--
-- This migration is idempotent: columns that are already absent are skipped.

DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN

  -- first_name_deprecated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'first_name_deprecated'
  ) INTO col_exists;

  IF col_exists THEN
    EXECUTE 'ALTER TABLE timekeeping.employees DROP COLUMN first_name_deprecated';
    RAISE NOTICE '0066: dropped first_name_deprecated';
  ELSE
    RAISE NOTICE '0066: first_name_deprecated already absent — skipping';
  END IF;

  -- last_name_deprecated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'last_name_deprecated'
  ) INTO col_exists;

  IF col_exists THEN
    EXECUTE 'ALTER TABLE timekeeping.employees DROP COLUMN last_name_deprecated';
    RAISE NOTICE '0066: dropped last_name_deprecated';
  ELSE
    RAISE NOTICE '0066: last_name_deprecated already absent — skipping';
  END IF;

  -- employee_number_deprecated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'employee_number_deprecated'
  ) INTO col_exists;

  IF col_exists THEN
    EXECUTE 'ALTER TABLE timekeeping.employees DROP COLUMN employee_number_deprecated';
    RAISE NOTICE '0066: dropped employee_number_deprecated';
  ELSE
    RAISE NOTICE '0066: employee_number_deprecated already absent — skipping';
  END IF;

  -- pin_deprecated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'pin_deprecated'
  ) INTO col_exists;

  IF col_exists THEN
    EXECUTE 'ALTER TABLE timekeeping.employees DROP COLUMN pin_deprecated';
    RAISE NOTICE '0066: dropped pin_deprecated';
  ELSE
    RAISE NOTICE '0066: pin_deprecated already absent — skipping';
  END IF;

  -- timezone_deprecated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name   = 'employees'
      AND column_name  = 'timezone_deprecated'
  ) INTO col_exists;

  IF col_exists THEN
    EXECUTE 'ALTER TABLE timekeeping.employees DROP COLUMN timezone_deprecated';
    RAISE NOTICE '0066: dropped timezone_deprecated';
  ELSE
    RAISE NOTICE '0066: timezone_deprecated already absent — skipping';
  END IF;

  RAISE NOTICE '0066: drop of deprecated identity columns complete';
END $$;
