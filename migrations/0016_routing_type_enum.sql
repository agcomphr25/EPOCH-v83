-- Migration: Add routing_type enum and column to part_routings
-- Creates the routing_type Postgres enum and adds the routingType column
-- with a default of 'COMPOSITE' so existing records are unaffected.

DO $$ BEGIN
  CREATE TYPE "routing_type" AS ENUM (
    'COMPOSITE',
    'CNC',
    'CORE',
    'KIT',
    'SUB_ASSEMBLY',
    'ASSEMBLY',
    'OUTSIDE_PROCESS',
    'INSPECTION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "part_routings"
  ADD COLUMN IF NOT EXISTS "routing_type" "routing_type" NOT NULL DEFAULT 'COMPOSITE';
