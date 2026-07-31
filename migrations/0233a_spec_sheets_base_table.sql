-- Additive production repair for deployments that received the document
-- management routes without the original spec_sheets base table.
-- This must run before 0233_part_specification_sheet_control.sql, which
-- extends spec_sheets with the controlled revision workflow.

CREATE TABLE IF NOT EXISTS spec_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_routing_id UUID,
  part_number VARCHAR(255),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  source_type VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  file_url TEXT,
  file_name VARCHAR(500),
  file_type VARCHAR(100),
  file_size INTEGER,
  specifications JSONB,
  ai_extracted_content JSONB,
  ai_extracted_fields JSONB,
  ai_processed_at TIMESTAMPTZ,
  is_template BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repair partially-created legacy tables without replacing or deleting data.
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS part_routing_id UUID;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS part_number VARCHAR(255);
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'uploaded';
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS file_name VARCHAR(500);
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS specifications JSONB;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS ai_extracted_content JSONB;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS ai_extracted_fields JSONB;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE spec_sheets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS spec_sheets_part_routing_idx ON spec_sheets(part_routing_id);
CREATE INDEX IF NOT EXISTS spec_sheets_part_number_idx ON spec_sheets(part_number);
