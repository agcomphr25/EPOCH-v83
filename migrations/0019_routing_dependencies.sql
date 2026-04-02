-- Migration 0019: Routing Dependencies for Assembly Gating
-- Adds structured dependency tracking for SUB_ASSEMBLY and ASSEMBLY routings

CREATE TABLE IF NOT EXISTS "routing_dependencies" (
  "id" serial PRIMARY KEY NOT NULL,
  "part_routing_id" uuid NOT NULL REFERENCES "part_routings"("id"),
  "dependency_type" text NOT NULL,
  "required_item_id" integer,
  "required_part_number" text,
  "required_description" text,
  "required_qty" integer,
  "is_serialized" boolean DEFAULT false,
  "must_be_completed" boolean DEFAULT true,
  "must_be_allocated" boolean DEFAULT false,
  "must_be_scanned" boolean DEFAULT false,
  "blocking_scope" text DEFAULT 'TRAVELER_START' NOT NULL,
  "applies_to_department" text,
  "applies_to_operation_id" integer,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "routing_dependencies_part_routing_id_idx" ON "routing_dependencies" ("part_routing_id");
CREATE INDEX IF NOT EXISTS "routing_dependencies_dependency_type_idx" ON "routing_dependencies" ("dependency_type");
CREATE INDEX IF NOT EXISTS "routing_dependencies_required_item_id_idx" ON "routing_dependencies" ("required_item_id");
CREATE INDEX IF NOT EXISTS "routing_dependencies_applies_to_department_idx" ON "routing_dependencies" ("applies_to_department");
