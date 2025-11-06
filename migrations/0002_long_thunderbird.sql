ALTER TABLE "all_orders" ADD COLUMN "bom_definition_id" integer;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "is_optional" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "labor_hours" real;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "hourly_rate" real;--> statement-breakpoint
ALTER TABLE "all_orders" ADD CONSTRAINT "all_orders_bom_definition_id_bom_definitions_id_fk" FOREIGN KEY ("bom_definition_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;