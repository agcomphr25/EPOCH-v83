-- Migration 0020: Anodize Jobs + routing_operations OSP extensions
-- Idempotent: safe to run multiple times

-- Extend routing_operations with outside-process fields
ALTER TABLE routing_operations ADD COLUMN IF NOT EXISTS outside_process_type text;
ALTER TABLE routing_operations ADD COLUMN IF NOT EXISTS expected_lead_days integer;
ALTER TABLE routing_operations ADD COLUMN IF NOT EXISTS certificate_required boolean DEFAULT false;
ALTER TABLE routing_operations ADD COLUMN IF NOT EXISTS receiving_inspection_required boolean DEFAULT false;

-- Create anodize_jobs table
CREATE TABLE IF NOT EXISTS "anodize_jobs" (
  "id" serial PRIMARY KEY,
  "routing_operation_id" integer NOT NULL REFERENCES "routing_operations"("id"),
  "traveler_id" varchar(255),
  "traveler_step_id" varchar(255),
  "part_routing_id" uuid,
  "part_number" text NOT NULL,
  "part_name" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "vendor_id" integer,
  "vendor_ref" text,
  "anodize_type" text,
  "finish_spec" text,
  "color" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "sent_at" timestamp,
  "sent_by" text,
  "vendor_po_number" text,
  "expected_return_date" date,
  "received_at" timestamp,
  "received_by" text,
  "cert_received" boolean DEFAULT false,
  "inspection_passed" boolean DEFAULT false,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "anodize_jobs_status_idx" ON "anodize_jobs" ("status");
CREATE INDEX IF NOT EXISTS "anodize_jobs_traveler_id_idx" ON "anodize_jobs" ("traveler_id");
CREATE INDEX IF NOT EXISTS "anodize_jobs_routing_operation_id_idx" ON "anodize_jobs" ("routing_operation_id");
CREATE INDEX IF NOT EXISTS "anodize_jobs_part_number_idx" ON "anodize_jobs" ("part_number");
CREATE INDEX IF NOT EXISTS "anodize_jobs_vendor_id_idx" ON "anodize_jobs" ("vendor_id");
