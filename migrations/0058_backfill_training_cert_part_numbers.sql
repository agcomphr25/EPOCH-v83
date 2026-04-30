-- Migration 0058: Add part_number to training_assignments and backfill training_certifications
--
-- Rationale:
--   Migration 0057 added a nullable part_number column to training_certifications.
--   The checkEmployeeHasValidTrainingCertification storage method filters by part_number
--   when one is supplied — but NULL values bypass the filter (backward-compat fallback).
--   Until certifications carry the correct part_number, Check 5 in the QC sign-off gate
--   remains effectively part-agnostic.
--
--   This migration:
--     1. Adds a nullable part_number column to training_assignments so the assignment
--        chain can carry part context all the way through to the certification record.
--     2. Backfills training_certifications.part_number from training_assignments.part_number
--        where the join is available and the assignment already has a part_number set.

-- Step 1: Add part_number to training_assignments
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_assignments'
  ) THEN
    ALTER TABLE training_assignments
      ADD COLUMN IF NOT EXISTS part_number text;
    RAISE NOTICE 'Added part_number column to training_assignments';
  ELSE
    RAISE NOTICE 'Table training_assignments does not exist yet, skipping';
  END IF;
END $$;

-- Step 2: Backfill training_certifications.part_number from training_assignments.part_number
-- This is a no-op for fresh installs (assignments have NULL part_number), but will
-- correctly propagate values on databases where assignments already have them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_certifications'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_assignments'
      AND column_name = 'part_number'
  ) THEN
    UPDATE training_certifications tc
    SET part_number = ta.part_number
    FROM training_assignments ta
    WHERE tc.assignment_id = ta.id
      AND ta.part_number IS NOT NULL
      AND tc.part_number IS NULL;

    RAISE NOTICE 'Backfilled training_certifications.part_number from training_assignments';
  ELSE
    RAISE NOTICE 'Skipping backfill — required tables/columns not present';
  END IF;
END $$;
