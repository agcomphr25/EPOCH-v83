-- Production Control Templates — WAD Step 6
-- Adds the template library, WAD production controls record, and traceability columns

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE production_control_template_type AS ENUM ('ROUTING', 'TRAVELER', 'QC', 'WORK_INSTRUCTION', 'SPEC_SHEET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE production_control_approval_status AS ENUM ('DRAFT', 'APPROVED', 'OBSOLETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wad_risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Production Control Templates table
CREATE TABLE IF NOT EXISTS production_control_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  template_type production_control_template_type NOT NULL,
  routing_type  TEXT,                   -- CNC | COMPOSITE | ASSEMBLY | PAINT_FINISH | SPECIAL_PROCESS (nullable)
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  approval_status production_control_approval_status NOT NULL DEFAULT 'DRAFT',
  approved_by   TEXT,
  approved_at   TIMESTAMP WITH TIME ZONE,
  approved_by_user_id INTEGER,
  data          JSONB,
  file_url      TEXT,
  created_by    TEXT NOT NULL,
  created_by_user_id INTEGER,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pct_type_status_idx ON production_control_templates (template_type, approval_status);
CREATE INDEX IF NOT EXISTS pct_approval_status_idx ON production_control_templates (approval_status);

-- 3. WAD Production Controls table
CREATE TABLE IF NOT EXISTS wad_production_controls (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id                UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  part_type                    TEXT NOT NULL,
  production_type              TEXT NOT NULL,
  routing_required             BOOLEAN NOT NULL DEFAULT false,
  traveler_required            BOOLEAN NOT NULL DEFAULT false,
  work_instruction_required    BOOLEAN NOT NULL DEFAULT false,
  spec_sheet_required          BOOLEAN NOT NULL DEFAULT false,
  final_qc_only                BOOLEAN NOT NULL DEFAULT false,
  in_process_inspection_required BOOLEAN NOT NULL DEFAULT false,
  spot_check_plan_required     BOOLEAN NOT NULL DEFAULT false,
  cert_required                BOOLEAN NOT NULL DEFAULT false,
  ai_reason                    TEXT,
  ai_confidence_score          NUMERIC(3, 2),
  ai_risk_level                wad_risk_level,
  selected_template_ids        JSONB,
  provisioned_at               TIMESTAMP WITH TIME ZONE,
  provision_summary            JSONB,
  created_at                   TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wad_production_controls_work_order_unique ON wad_production_controls (work_order_id);
CREATE INDEX IF NOT EXISTS wad_production_controls_work_order_idx ON wad_production_controls (work_order_id);

-- 4. Traceability columns on part_routings
ALTER TABLE part_routings
  ADD COLUMN IF NOT EXISTS created_from_template_id UUID,
  ADD COLUMN IF NOT EXISTS created_from_template_version INTEGER;

-- 5. Traceability columns on travelers
ALTER TABLE travelers
  ADD COLUMN IF NOT EXISTS created_from_template_id UUID,
  ADD COLUMN IF NOT EXISTS created_from_template_version INTEGER;

-- 6. template_source_id on traveler_tasks
ALTER TABLE traveler_tasks
  ADD COLUMN IF NOT EXISTS template_source_id UUID;
