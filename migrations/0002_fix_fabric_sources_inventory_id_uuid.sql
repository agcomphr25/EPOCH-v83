-- Safe migration: cutting_built_packet_fabric_sources.fabric_inventory_id integer → uuid
-- Strategy: add new column, backfill via cutting_fabric_inventory.inventory_item_id, drop old, rename.
-- This migration is fully idempotent: if the column is already uuid the DO block is a no-op.
-- Rows whose old integer value has no matching inventory_item_id keep fabric_inventory_id = NULL
-- (those references were already broken since cutting_fabric_inventory.id is uuid).

DO $$
BEGIN
  -- Guard: only run if the column is still integer type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_built_packet_fabric_sources'
      AND column_name = 'fabric_inventory_id'
      AND data_type   = 'integer'
  ) THEN

    -- Step 1: add temporary uuid column alongside existing integer column
    ALTER TABLE cutting_built_packet_fabric_sources
      ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

    -- Step 2: backfill — map old integer FK to uuid via cutting_fabric_inventory.inventory_item_id
    UPDATE cutting_built_packet_fabric_sources cbpfs
    SET fabric_inventory_uuid = fi.id
    FROM cutting_fabric_inventory fi
    WHERE fi.inventory_item_id = cbpfs.fabric_inventory_id
      AND cbpfs.fabric_inventory_id IS NOT NULL;

    -- Step 3: drop FK constraint on old integer column (ignore if it doesn't exist)
    ALTER TABLE cutting_built_packet_fabric_sources
      DROP CONSTRAINT IF EXISTS "cutting_built_packet_fabric_sources_fabric_inventory_id_fkey";

    -- Drop the old integer index so the name can be reused after rename
    DROP INDEX IF EXISTS cutting_built_packet_sources_inventory_idx;

    -- Step 4a: drop old integer column
    ALTER TABLE cutting_built_packet_fabric_sources
      DROP COLUMN fabric_inventory_id;

    -- Step 4b: promote the uuid column to the canonical name
    ALTER TABLE cutting_built_packet_fabric_sources
      RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

    -- Re-add FK constraint pointing to cutting_fabric_inventory.id (uuid)
    ALTER TABLE cutting_built_packet_fabric_sources
      ADD CONSTRAINT "cutting_built_packet_fabric_sources_fabric_inventory_id_fkey"
      FOREIGN KEY (fabric_inventory_id)
      REFERENCES cutting_fabric_inventory(id);

    -- Recreate index
    CREATE INDEX IF NOT EXISTS cutting_built_packet_sources_inventory_idx
      ON cutting_built_packet_fabric_sources(fabric_inventory_id);

  END IF;
END $$;
