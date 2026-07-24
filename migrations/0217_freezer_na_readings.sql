-- Idempotent: allow freezer checks to record an explicit N/A status.
ALTER TABLE "freezer_temperature_readings"
  ADD COLUMN IF NOT EXISTS "is_not_applicable" boolean DEFAULT false NOT NULL;

ALTER TABLE "freezer_temperature_readings"
  ALTER COLUMN "temperature" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'freezer_temperature_readings_value_or_na_check'
  ) THEN
    ALTER TABLE "freezer_temperature_readings"
      ADD CONSTRAINT "freezer_temperature_readings_value_or_na_check"
      CHECK (("temperature" IS NOT NULL) <> "is_not_applicable");
  END IF;
END $$;