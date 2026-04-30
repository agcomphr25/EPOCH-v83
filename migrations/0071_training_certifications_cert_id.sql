-- Add certification_id to training_certifications
-- This links a training certification record to the specific HR certifications.id
-- that it satisfies, enabling per-operation cert enforcement in traveler gate checks.
-- Nullable so existing records are unaffected.
--
-- Guard: training_certifications is created by Drizzle schema push (not by a migration
-- file), so it may be absent on a freshly-seeded schema-baseline database that was
-- built from an older pg_dump snapshot.  Skip the ALTER if the table does not yet
-- exist; the column will be present once the schema push catches up.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'training_certifications'
  ) THEN
    ALTER TABLE training_certifications
      ADD COLUMN IF NOT EXISTS certification_id INTEGER REFERENCES certifications(id);
  ELSE
    RAISE NOTICE '0071: table training_certifications does not exist yet — skipping ALTER (no-op)';
  END IF;
END $$;
