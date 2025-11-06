-- Add auto-increment sequence to production bom_definitions.id
-- Run this in your PRODUCTION database console

-- 1. Create the sequence (if it doesn't exist)
CREATE SEQUENCE IF NOT EXISTS bom_definitions_id_seq;

-- 2. Set the sequence to start after the highest existing ID
SELECT setval('bom_definitions_id_seq', COALESCE((SELECT MAX(id) FROM bom_definitions), 1));

-- 3. Set the column default to use the sequence
ALTER TABLE bom_definitions ALTER COLUMN id SET DEFAULT nextval('bom_definitions_id_seq');

-- 4. Set the sequence owner (so it gets dropped with the table)
ALTER SEQUENCE bom_definitions_id_seq OWNED BY bom_definitions.id;

-- Repeat for bom_items table
CREATE SEQUENCE IF NOT EXISTS bom_items_id_seq;
SELECT setval('bom_items_id_seq', COALESCE((SELECT MAX(id) FROM bom_items), 1));
ALTER TABLE bom_items ALTER COLUMN id SET DEFAULT nextval('bom_items_id_seq');
ALTER SEQUENCE bom_items_id_seq OWNED BY bom_items.id;
