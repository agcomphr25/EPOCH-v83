ALTER TABLE "freezer_temperature_logs"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "updated_by_user_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_by_display_name" text,
  ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "voided_by_user_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "voided_by_display_name" text,
  ADD COLUMN IF NOT EXISTS "void_reason" text,
  ADD COLUMN IF NOT EXISTS "restored_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "restored_by_user_id" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "restored_by_display_name" text;

CREATE INDEX IF NOT EXISTS "freezer_temperature_logs_voided_at_idx"
  ON "freezer_temperature_logs" ("voided_at");

ALTER TABLE "freezer_temperature_logs"
  DROP CONSTRAINT IF EXISTS "freezer_temperature_logs_void_reason_required";

ALTER TABLE "freezer_temperature_logs"
  ADD CONSTRAINT "freezer_temperature_logs_void_reason_required"
  CHECK ("voided_at" IS NULL OR length(btrim(coalesce("void_reason", ''))) >= 3);
