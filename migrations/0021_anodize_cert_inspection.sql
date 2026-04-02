-- Migration 0021: Anodize job documents and receiving inspections
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS "anodize_job_documents" (
  "id" serial PRIMARY KEY,
  "anodize_job_id" integer NOT NULL REFERENCES "anodize_jobs"("id") ON DELETE CASCADE,
  "document_type" text DEFAULT 'OTHER' NOT NULL,
  "file_name" text NOT NULL,
  "file_url" text,
  "uploaded_at" timestamp DEFAULT now(),
  "uploaded_by" text,
  "notes" text,
  "is_required" boolean DEFAULT false NOT NULL,
  "is_accepted" boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS "anodize_job_documents_job_id_idx" ON "anodize_job_documents" ("anodize_job_id");

CREATE TABLE IF NOT EXISTS "anodize_job_receiving_inspections" (
  "id" serial PRIMARY KEY,
  "anodize_job_id" integer NOT NULL UNIQUE REFERENCES "anodize_jobs"("id") ON DELETE CASCADE,
  "inspection_status" text DEFAULT 'PENDING' NOT NULL,
  "inspected_at" timestamp,
  "inspected_by" text,
  "notes" text,
  "thickness_verified" boolean DEFAULT false NOT NULL,
  "color_verified" boolean DEFAULT false NOT NULL,
  "damage_free" boolean DEFAULT false NOT NULL,
  "quantity_verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "anodize_job_receiving_inspections_job_id_idx" ON "anodize_job_receiving_inspections" ("anodize_job_id");
