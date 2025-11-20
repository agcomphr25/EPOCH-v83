CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"annual_budget" real,
	"monthly_budget" real,
	"manager_id" integer,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "p2_serialized_item_custom_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serialized_item_id" uuid NOT NULL,
	"department" text NOT NULL,
	"custom_data" jsonb NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_serialized_item_custom_data" ADD CONSTRAINT "p2_serialized_item_custom_data_serialized_item_id_p2_serialized_items_id_fk" FOREIGN KEY ("serialized_item_id") REFERENCES "public"."p2_serialized_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "p2_serialized_item_custom_data_item_id_idx" ON "p2_serialized_item_custom_data" USING btree ("serialized_item_id");--> statement-breakpoint
CREATE INDEX "p2_serialized_item_custom_data_department_idx" ON "p2_serialized_item_custom_data" USING btree ("department");