-- Migration 0018: Routing Templates and Template Operations
-- Adds reusable routing templates by manufacturing type

-- Routing Templates table
CREATE TABLE IF NOT EXISTS "routing_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_name" text NOT NULL,
  "routing_type" "routing_type" NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "department_sequence" jsonb DEFAULT '[]' NOT NULL,
  "department_config" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Routing Template Operations table
CREATE TABLE IF NOT EXISTS "routing_template_operations" (
  "id" serial PRIMARY KEY NOT NULL,
  "routing_template_id" uuid NOT NULL REFERENCES "routing_templates"("id"),
  "step_number" integer NOT NULL,
  "department_name" text NOT NULL,
  "operation_name" text NOT NULL,
  "operation_type" text NOT NULL,
  "work_center" text,
  "estimated_minutes" integer,
  "requires_signature" boolean DEFAULT false,
  "requires_certification" boolean DEFAULT false,
  "is_outside_process" boolean DEFAULT false,
  "vendor_id" integer,
  "instruction_pack" jsonb DEFAULT '{}',
  "created_at" timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "routing_templates_routing_type_idx" ON "routing_templates" ("routing_type");
CREATE INDEX IF NOT EXISTS "routing_templates_is_active_idx" ON "routing_templates" ("is_active");
CREATE INDEX IF NOT EXISTS "routing_template_operations_template_id_idx" ON "routing_template_operations" ("routing_template_id");
