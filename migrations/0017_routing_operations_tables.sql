-- Migration: Add routing_operations and routing_cnc_operations tables
-- routing_operations: step-by-step operations within a part routing
-- routing_cnc_operations: CNC-specific extension for routing operations

CREATE TABLE IF NOT EXISTS "routing_operations" (
  "id" serial PRIMARY KEY NOT NULL,
  "part_routing_id" uuid NOT NULL REFERENCES "part_routings"("id"),
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

CREATE TABLE IF NOT EXISTS "routing_cnc_operations" (
  "id" serial PRIMARY KEY NOT NULL,
  "routing_operation_id" integer NOT NULL REFERENCES "routing_operations"("id"),
  "machine_class" text,
  "preferred_machine_id" integer,
  "program_id" integer REFERENCES "cnc_programs"("id"),
  "fixture" text,
  "estimated_setup_minutes" integer,
  "estimated_cycle_minutes" integer,
  "prove_out_required" boolean DEFAULT false
);
