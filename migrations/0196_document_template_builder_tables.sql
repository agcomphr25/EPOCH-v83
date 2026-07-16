-- Additive production repair for the Form & Document Builder template workflow.
-- Some deployments have routing_documents but never received the reusable
-- document_templates and template_fields tables.

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(500) NOT NULL,
  template_type VARCHAR(100) NOT NULL,
  description TEXT,
  source_document_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  learned_from_count INTEGER DEFAULT 0,
  structure JSONB,
  sections JSONB,
  default_fields JSONB,
  ai_generated_prompt TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS template_name VARCHAR(500);
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS template_type VARCHAR(100);
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS source_document_ids TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS learned_from_count INTEGER DEFAULT 0;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS structure JSONB;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS sections JSONB;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS default_fields JSONB;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS ai_generated_prompt TEXT;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  is_required BOOLEAN DEFAULT false,
  is_unique_per_serial BOOLEAN DEFAULT false,
  default_value TEXT,
  validation_rules JSONB,
  options JSONB,
  section_name VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS field_name VARCHAR(255);
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS field_label VARCHAR(255);
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS field_type VARCHAR(50) DEFAULT 'text';
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS is_unique_per_serial BOOLEAN DEFAULT false;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS default_value TEXT;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS validation_rules JSONB;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS section_name VARCHAR(255);
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS ai_suggested BOOLEAN DEFAULT false;
ALTER TABLE template_fields ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS document_templates_type_idx ON document_templates(template_type);
CREATE INDEX IF NOT EXISTS template_fields_template_idx ON template_fields(template_id);
