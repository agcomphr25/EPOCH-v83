-- Migration 0057: Harden P2 certifications
-- 1. Change FK on p2_employee_part_certifications.part_certification_id from CASCADE to RESTRICT
--    so deleting a part certification requirement does NOT silently wipe employee cert records.
-- 2. Add optional part_number column to training_certifications for part-specific enforcement.

-- Step 1: Drop the existing CASCADE FK and re-add it as RESTRICT (only if table exists)
DO $$
DECLARE
  v_conname text;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'p2_employee_part_certifications'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Table p2_employee_part_certifications does not exist, skipping FK change';
    RETURN;
  END IF;

  SELECT tc.constraint_name INTO v_conname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'p2_employee_part_certifications'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'part_certification_id';

  IF v_conname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE p2_employee_part_certifications DROP CONSTRAINT %I',
      v_conname
    );
    RAISE NOTICE 'Dropped old CASCADE FK: %', v_conname;
  END IF;

  -- Only add the RESTRICT constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'p2_employee_part_certifications'
      AND constraint_name = 'p2_employee_part_certifications_part_cert_id_restrict_fkey'
  ) THEN
    ALTER TABLE p2_employee_part_certifications
      ADD CONSTRAINT p2_employee_part_certifications_part_cert_id_restrict_fkey
      FOREIGN KEY (part_certification_id)
      REFERENCES p2_part_certifications(id)
      ON DELETE RESTRICT;
    RAISE NOTICE 'Added RESTRICT FK constraint';
  END IF;
END $$;

-- Step 2: Add part_number column to training_certifications (nullable for backward compat)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_certifications'
  ) THEN
    ALTER TABLE training_certifications
      ADD COLUMN IF NOT EXISTS part_number text;
    RAISE NOTICE 'Added part_number column to training_certifications';
  ELSE
    RAISE NOTICE 'Table training_certifications does not exist yet, skipping column add';
  END IF;
END $$;
