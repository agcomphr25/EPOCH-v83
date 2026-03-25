-- Migration: Add itemType, manufacturedCategory, and manufacturingLevel to inventory_items
-- Also creates the enum types and migrates existing data from legacy `type` and `isPacket` fields.

-- Create enum types
DO $$ BEGIN
  CREATE TYPE inventory_item_type AS ENUM ('PURCHASED', 'MANUFACTURED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inventory_manufactured_category AS ENUM ('PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inventory_manufacturing_level AS ENUM ('COMPONENT', 'INTERMEDIATE', 'FINAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_type inventory_item_type,
  ADD COLUMN IF NOT EXISTS manufactured_category inventory_manufactured_category,
  ADD COLUMN IF NOT EXISTS manufacturing_level inventory_manufacturing_level;

-- Migrate existing data:
-- 1. Items with isPacket = true → MANUFACTURED / PACKET
UPDATE inventory_items
SET
  item_type = 'MANUFACTURED',
  manufactured_category = 'PACKET'
WHERE is_packet = true AND item_type IS NULL;

-- 2. Items with type = 'Manufactured' (and not already set via isPacket) → MANUFACTURED
UPDATE inventory_items
SET item_type = 'MANUFACTURED'
WHERE type = 'Manufactured' AND item_type IS NULL;

-- 3. Items with type = 'Purchased' OR type is not 'Manufactured' → PURCHASED
UPDATE inventory_items
SET item_type = 'PURCHASED'
WHERE item_type IS NULL AND (type = 'Purchased' OR type IS NULL OR type != 'Manufactured');
