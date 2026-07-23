-- Idempotent repair for environments where the freezer UI deployed before its tables.
CREATE TABLE IF NOT EXISTS "freezer_temperature_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "freezer_temperature_locations_name_not_blank"
    CHECK (btrim("name") <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS "freezer_temperature_locations_name_unique"
  ON "freezer_temperature_locations" (lower("name"));
CREATE INDEX IF NOT EXISTS "freezer_temperature_locations_active_sort_idx"
  ON "freezer_temperature_locations" ("is_active", "sort_order");

CREATE TABLE IF NOT EXISTS "freezer_temperature_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "notes" text,
  "recorded_by_user_id" integer NOT NULL,
  "recorded_by_display_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "freezer_temperature_logs_recorded_by_user_id_users_id_fk"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "freezer_temperature_logs_recorded_at_idx"
  ON "freezer_temperature_logs" ("recorded_at");
CREATE INDEX IF NOT EXISTS "freezer_temperature_logs_recorded_by_user_idx"
  ON "freezer_temperature_logs" ("recorded_by_user_id");

CREATE TABLE IF NOT EXISTS "freezer_temperature_readings" (
  "id" serial PRIMARY KEY NOT NULL,
  "log_id" integer NOT NULL,
  "location_id" uuid NOT NULL,
  "location_name_snapshot" text NOT NULL,
  "location_sort_order_snapshot" integer NOT NULL,
  "temperature" numeric(6, 2) NOT NULL,
  CONSTRAINT "freezer_temperature_readings_log_id_logs_id_fk"
    FOREIGN KEY ("log_id") REFERENCES "public"."freezer_temperature_logs"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "freezer_temperature_readings_location_id_locations_id_fk"
    FOREIGN KEY ("location_id") REFERENCES "public"."freezer_temperature_locations"("id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "freezer_temperature_readings_log_location_unique"
    UNIQUE ("log_id", "location_id")
);

CREATE INDEX IF NOT EXISTS "freezer_temperature_readings_location_idx"
  ON "freezer_temperature_readings" ("location_id");

INSERT INTO "freezer_temperature_locations" ("name", "sort_order") VALUES
  ('Freezer 1', 10),
  ('Freezer 2', 20),
  ('Freezer 3', 30),
  ('Freezer 4', 40),
  ('Lay-Up Room', 50),
  ('Refrigerator Container', 60)
ON CONFLICT DO NOTHING;
