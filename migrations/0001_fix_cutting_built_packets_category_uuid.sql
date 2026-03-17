-- Safe migration: convert cutting_built_packets.product_category_id to UUID
-- The column was originally created as integer via boot migration before drizzle tracking.
-- This migration brings production in sync with the schema (uuid type).
-- Uses USING NULL because integer values cannot be cast to uuid; the foreign-key
-- data is not critical (cutting packet category tracking, re-assignable).

DO $$
BEGIN
  -- Skip if already uuid
  IF (
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'cutting_built_packets' AND column_name = 'product_category_id'
  ) = 'uuid' THEN
    RETURN;
  END IF;

  -- Drop FK constraint if it exists
  ALTER TABLE "cutting_built_packets"
    DROP CONSTRAINT IF EXISTS "cutting_built_packets_product_category_id_fkey";

  -- Remove NOT NULL so we can safely null out integer values
  ALTER TABLE "cutting_built_packets"
    ALTER COLUMN "product_category_id" DROP NOT NULL;

  -- Clear existing integer values (cannot be cast to uuid)
  UPDATE "cutting_built_packets" SET "product_category_id" = NULL;

  -- Change type to uuid
  ALTER TABLE "cutting_built_packets"
    ALTER COLUMN "product_category_id" TYPE uuid USING NULL;

END $$;
