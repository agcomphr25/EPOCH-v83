CREATE TABLE IF NOT EXISTS "freezer_temperature_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "freezer_1_temperature" numeric(6, 2) NOT NULL,
  "freezer_2_temperature" numeric(6, 2) NOT NULL,
  "freezer_3_temperature" numeric(6, 2) NOT NULL,
  "freezer_4_temperature" numeric(6, 2) NOT NULL,
  "layup_room_temperature" numeric(6, 2) NOT NULL,
  "refrigerator_container_temperature" numeric(6, 2) NOT NULL,
  "notes" text,
  "recorded_by_user_id" integer NOT NULL,
  "recorded_by_display_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "freezer_temperature_logs_recorded_by_user_id_users_id_fk"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "freezer_temperature_logs_recorded_at_idx"
  ON "freezer_temperature_logs" USING btree ("recorded_at");
