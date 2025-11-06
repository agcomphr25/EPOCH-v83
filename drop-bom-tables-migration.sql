-- Migration: Drop and recreate BOM tables with UUID
-- This will be run during deployment

-- Drop existing tables (will lose any BOM data in production)
DROP TABLE IF EXISTS bom_items CASCADE;
DROP TABLE IF EXISTS bom_definitions CASCADE;

-- Tables will be recreated automatically by Drizzle with UUID columns
