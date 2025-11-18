CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'CONFIRMED', 'FINALIZED', 'CANCELLED', 'RESERVED');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"field_name" text NOT NULL,
	"field_label" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"changed_by" text NOT NULL,
	"user_role" text NOT NULL,
	"change_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "all_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"order_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"customer_id" text,
	"customer_po" text,
	"fb_order_number" text,
	"agr_order_details" text,
	"is_flattop" boolean DEFAULT false,
	"is_custom_order" text,
	"model_id" text,
	"handedness" text,
	"shank_length" text,
	"features" jsonb,
	"feature_quantities" jsonb,
	"discount_code" text,
	"discount_type" text,
	"discount_value" numeric,
	"discount_applies_to" text,
	"notes" text,
	"custom_discount_type" text DEFAULT 'percent',
	"custom_discount_value" real DEFAULT 0,
	"show_custom_discount" boolean DEFAULT false,
	"price_override" real,
	"flattop_price_override" real,
	"shipping" real DEFAULT 0,
	"tikka_option" text,
	"status" text DEFAULT 'FINALIZED',
	"status_id" integer,
	"barcode" text,
	"current_department" text DEFAULT 'P1 Production Queue',
	"current_department_id" integer,
	"department_history" jsonb DEFAULT '[]',
	"scrapped_quantity" integer DEFAULT 0,
	"total_produced" integer DEFAULT 0,
	"layup_completed_at" timestamp,
	"plugging_completed_at" timestamp,
	"cnc_completed_at" timestamp,
	"finish_completed_at" timestamp,
	"gunsmith_completed_at" timestamp,
	"paint_completed_at" timestamp,
	"qc_completed_at" timestamp,
	"shipping_completed_at" timestamp,
	"scrap_date" timestamp,
	"scrap_reason" text,
	"scrap_disposition" text,
	"scrap_authorization" text,
	"is_replacement" boolean DEFAULT false,
	"replaced_order_id" text,
	"is_paid" boolean DEFAULT false,
	"payment_type" text,
	"payment_amount" real,
	"payment_date" timestamp,
	"payment_timestamp" timestamp,
	"tracking_number" text,
	"shipping_carrier" text DEFAULT 'UPS',
	"shipping_method" text DEFAULT 'Ground',
	"shipped_date" timestamp,
	"estimated_delivery" timestamp,
	"shipping_label_generated" boolean DEFAULT false,
	"customer_notified" boolean DEFAULT false,
	"notification_method" text,
	"notification_sent_at" timestamp,
	"delivery_confirmed" boolean DEFAULT false,
	"delivery_confirmed_at" timestamp,
	"is_cancelled" boolean DEFAULT false,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"is_verified" boolean DEFAULT false,
	"is_manual_due_date" boolean DEFAULT false,
	"is_manual_order_date" boolean DEFAULT false,
	"has_alt_ship_to" boolean DEFAULT false,
	"alt_ship_to_customer_id" text,
	"alt_ship_to_name" text,
	"alt_ship_to_company" text,
	"alt_ship_to_email" text,
	"alt_ship_to_phone" text,
	"alt_ship_to_address" jsonb,
	"special_shipping_international" boolean DEFAULT false,
	"special_shipping_next_day_air" boolean DEFAULT false,
	"special_shipping_bill_to_receiver" boolean DEFAULT false,
	"assigned_technician" text,
	"urgency" text DEFAULT 'low',
	"priority_score" integer DEFAULT 50,
	"is_manual_urgency" boolean DEFAULT false,
	"signature_data" text,
	"signed_at" timestamp,
	"is_rts_order" boolean DEFAULT false,
	"rts_sale_id" uuid,
	"bom_definition_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "all_orders_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "all_orders_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "bom_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text,
	"model_name" text NOT NULL,
	"revision" text DEFAULT 'A' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bom_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"part_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"first_dept" text DEFAULT 'Layup' NOT NULL,
	"item_type" text DEFAULT 'manufactured' NOT NULL,
	"reference_bom_id" uuid,
	"assembly_level" integer DEFAULT 0,
	"quantity_multiplier" integer DEFAULT 1,
	"notes" text,
	"is_optional" boolean DEFAULT false,
	"labor_hours" real,
	"hourly_rate" real,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"child_part_ag_number" text NOT NULL,
	"qty_per" numeric(18, 6) DEFAULT '1' NOT NULL,
	"scrap_pct" numeric(6, 3) DEFAULT '0' NOT NULL,
	"reference" text DEFAULT '',
	"operation_seq" integer DEFAULT 10,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bom_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"rev_code" text NOT NULL,
	"notes" text DEFAULT '',
	"is_released" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_part_ag_number" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "capabilities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "certifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar NOT NULL,
	"description" text,
	"category" varchar,
	"validity_period_months" integer,
	"is_required" boolean,
	"created_at" timestamp,
	"updated_at" timestamp,
	"issuing_organization" varchar,
	"validity_period" integer,
	"requirements" text,
	"is_active" boolean,
	"requirements_data" jsonb,
	"work_instructions" text
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" json,
	"value" text,
	"required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "communication_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text,
	"message_type" text DEFAULT 'transactional' NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"method" text NOT NULL,
	"recipient" text NOT NULL,
	"sender" text,
	"subject" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"direction" text DEFAULT 'outbound',
	"external_id" text,
	"is_read" boolean DEFAULT false,
	"sent_at" timestamp,
	"received_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "controlled_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" text NOT NULL,
	"document_name" text NOT NULL,
	"document_type" text NOT NULL,
	"department" text NOT NULL,
	"category" text,
	"description" text,
	"current_version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_date" date,
	"expiration_date" date,
	"retention_length" text,
	"document_owner" text,
	"file_path" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "controlled_documents_document_number_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "credit_card_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"order_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"auth_code" text,
	"response_code" text,
	"response_reason_code" text,
	"response_reason_text" text,
	"avs_result" text,
	"cvv_result" text,
	"card_type" text,
	"last_four_digits" text,
	"amount" real NOT NULL,
	"tax_amount" real DEFAULT 0,
	"shipping_amount" real DEFAULT 0,
	"customer_email" text,
	"billing_first_name" text,
	"billing_last_name" text,
	"billing_address" text,
	"billing_city" text,
	"billing_state" text,
	"billing_zip" text,
	"billing_country" text DEFAULT 'US',
	"is_test" boolean DEFAULT false,
	"raw_response" jsonb,
	"status" text DEFAULT 'pending',
	"refunded_amount" real DEFAULT 0,
	"voided_at" timestamp,
	"refunded_at" timestamp,
	"processed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "credit_card_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "csv_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"data" jsonb NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"street" text NOT NULL,
	"street2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"country" text DEFAULT 'United States' NOT NULL,
	"type" text DEFAULT 'shipping' NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_validated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"communication_log_id" integer,
	"thread_id" text,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to" text,
	"status" text DEFAULT 'open' NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_satisfaction_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" text,
	"responses" jsonb DEFAULT '{}' NOT NULL,
	"overall_satisfaction" integer,
	"nps_score" integer,
	"aggregate_score" integer,
	"response_time_seconds" integer,
	"ip_address" text,
	"user_agent" text,
	"csr_name" text,
	"survey_date" timestamp,
	"is_complete" boolean DEFAULT false,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_satisfaction_surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"questions" jsonb DEFAULT '[]' NOT NULL,
	"settings" jsonb DEFAULT '{}',
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_stock_model_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"stock_model_id" text NOT NULL,
	"custom_price" real NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"contact" text,
	"customer_type" text DEFAULT 'standard',
	"preferred_communication_method" json,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"is_international" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutting_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_name" text NOT NULL,
	"material_id" uuid,
	"inventory_item_id" integer,
	"yield_per_cut" integer,
	"fabric_type" text,
	"thickness" text,
	"waste_factor" real DEFAULT 0.05,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_cut_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_date" date NOT NULL,
	"work_date" date NOT NULL,
	"material_id" uuid,
	"production_line_id" uuid,
	"product_category_id" uuid,
	"component_id" uuid,
	"cuts_completed" integer DEFAULT 0,
	"cuts_required" integer NOT NULL,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_cut_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_date" text NOT NULL,
	"product_category_id" uuid,
	"pieces_yielded" integer NOT NULL,
	"fabric_square_meters_used" numeric(10, 2) NOT NULL,
	"fabric_type" text,
	"part_number" text,
	"item_description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_fabric_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid,
	"production_line_id" uuid,
	"source" text,
	"fabric" text,
	"batch_number" text,
	"internal_control_number" text,
	"manufacture_date" date,
	"received_date" date,
	"expiration_date" date,
	"location" text,
	"conformance_document_link" text,
	"quantity_in_stock" integer DEFAULT 0 NOT NULL,
	"square_meters" numeric(10, 2),
	"low_stock_threshold" integer DEFAULT 10,
	"barcode" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cutting_fabric_inventory_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "cutting_fabric_inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fabric_inventory_id" uuid NOT NULL,
	"session_lot_id" uuid,
	"change_type" text NOT NULL,
	"quantity_delta" integer NOT NULL,
	"notes" text,
	"performed_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_name" text NOT NULL,
	"material_type" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cutting_materials_material_name_unique" UNIQUE("material_name")
);
--> statement-breakpoint
CREATE TABLE "cutting_packet_compositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_category_id" uuid,
	"component_id" uuid,
	"inventory_item_id" integer,
	"quantity_needed" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_packet_session_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"fabric_inventory_id" uuid NOT NULL,
	"cuts_planned" integer NOT NULL,
	"quantity_used" integer NOT NULL,
	"waste_factor_applied" real DEFAULT 0.05,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_packet_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_category_id" uuid NOT NULL,
	"week_date" date,
	"work_date" date,
	"packets_target" integer NOT NULL,
	"created_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_line_id" uuid,
	"category_name" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_production_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_name" text NOT NULL,
	"line_number" integer NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cutting_production_lines_line_name_unique" UNIQUE("line_name")
);
--> statement-breakpoint
CREATE TABLE "cutting_weekly_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_date" date NOT NULL,
	"production_line_id" uuid,
	"product_category_id" uuid,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "department_consumption_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text NOT NULL,
	"department_id" integer NOT NULL,
	"consumption_rate" real NOT NULL,
	"rate_period" text DEFAULT 'weekly',
	"usage_unit" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "department_consumption_rates_ag_part_number_department_id_unique" UNIQUE("ag_part_number","department_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"description" text,
	"location_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "document_collection_relations" (
	"collection_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"relationship_type" text DEFAULT 'primary',
	"display_order" integer DEFAULT 0,
	"added_at" timestamp DEFAULT now(),
	"added_by" text
);
--> statement-breakpoint
CREATE TABLE "document_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"collection_type" text NOT NULL,
	"primary_identifier" text,
	"status" text DEFAULT 'active',
	"metadata" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_tag_relations" (
	"document_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"color" text DEFAULT '#3B82F6',
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "document_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "document_version_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" text NOT NULL,
	"change_description" text,
	"change_type" text,
	"file_path" text,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"approved_by" text,
	"approved_at" timestamp,
	"effective_date" date,
	"expiration_date" date
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"original_file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"document_type" text NOT NULL,
	"upload_date" timestamp DEFAULT now(),
	"uploaded_by" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"capability_id" integer NOT NULL,
	"granted_by" text,
	"is_hardcoded" boolean DEFAULT false,
	"use_hardcoded_value" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_capabilities_employee_id_capability_id_unique" UNIQUE("employee_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "employee_certifications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "employee_certifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"employee_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"date_obtained" date NOT NULL,
	"expiry_date" date,
	"certificate_number" varchar,
	"issuing_authority" varchar,
	"status" varchar,
	"created_at" timestamp,
	"updated_at" timestamp,
	"date_expiry" date,
	"document_url" text,
	"is_active" boolean,
	"notes" text,
	"trainer_name" varchar,
	"trainer_signature" varchar,
	"training_date" date,
	"critical_points_completed" jsonb,
	"completed_by_user_id" integer,
	"form_completed_at" timestamp,
	"work_instructions_completed" jsonb,
	"uploaded_files" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"original_file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"file_path" text NOT NULL,
	"uploaded_by" text,
	"is_confidential" boolean DEFAULT false,
	"tags" text[],
	"description" text,
	"expiry_date" date,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_layup_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"rate" real DEFAULT 1 NOT NULL,
	"hours" real DEFAULT 8 NOT NULL,
	"department" text DEFAULT 'Layup' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_record_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"attempt_number" integer NOT NULL,
	"answers" jsonb,
	"score" integer,
	"passed" boolean DEFAULT false,
	"time_spent_seconds" integer,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_training_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"score" integer,
	"attempts" integer DEFAULT 0,
	"certificate_issued" boolean DEFAULT false,
	"certificate_number" text,
	"certificate_url" text,
	"expiry_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_code" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"user_role" text DEFAULT 'EMPLOYEE' NOT NULL,
	"department" text,
	"hire_date" date,
	"date_of_birth" date,
	"address" text,
	"emergency_contact" text,
	"emergency_phone" text,
	"gate_card_number" text,
	"vehicle_type" text,
	"building_key_access" boolean DEFAULT false,
	"tci_access" boolean DEFAULT false,
	"employment_type" text DEFAULT 'FULL_TIME',
	"portal_token" text,
	"portal_token_expiry" timestamp,
	"is_finish_technician" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employees_email_unique" UNIQUE("email"),
	CONSTRAINT "employees_portal_token_unique" UNIQUE("portal_token")
);
--> statement-breakpoint
CREATE TABLE "enhanced_form_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enhanced_form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enhanced_form_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"version" integer NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enhanced_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" integer,
	"table_name" text,
	"layout" jsonb NOT NULL,
	"version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"evaluator_id" integer NOT NULL,
	"evaluation_type" text NOT NULL,
	"evaluation_period_start" date NOT NULL,
	"evaluation_period_end" date NOT NULL,
	"overall_rating" integer,
	"performance_goals" jsonb,
	"achievements" text,
	"areas_for_improvement" text,
	"development_plan" text,
	"comments" text,
	"employee_comments" text,
	"status" text DEFAULT 'DRAFT',
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_name" text NOT NULL,
	"option_value" text NOT NULL,
	"option_label" text NOT NULL,
	"selection_count" integer DEFAULT 0 NOT NULL,
	"last_selected_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_sub_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"category_id" text,
	"price" real DEFAULT 0,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false,
	"placeholder" text,
	"options" json,
	"validation" json,
	"category" text,
	"sub_category" text,
	"price" real DEFAULT 0,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "followup_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_email" text NOT NULL,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp,
	"email_error" text,
	"pdf_generated" boolean DEFAULT false,
	"pdf_path" text,
	"pdf_generated_at" timestamp,
	"signature_token" text,
	"signature_signed" boolean DEFAULT false,
	"signature_data" text,
	"signed_at" timestamp,
	"signed_pdf_path" text,
	"moved_to_production" boolean DEFAULT false,
	"moved_to_production_at" timestamp,
	"reminder_sent" boolean DEFAULT false,
	"reminder_sent_at" timestamp,
	"order_summary" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "followup_orders_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "followup_orders_signature_token_unique" UNIQUE("signature_token")
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "internal_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_name" text NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_user_id" integer,
	"recipient_department_id" integer,
	"recipient_name" text NOT NULL,
	"is_urgent" boolean DEFAULT false,
	"has_reminder" boolean DEFAULT false,
	"reminder_date" timestamp,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text NOT NULL,
	"location_id" text NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_allocated" integer DEFAULT 0 NOT NULL,
	"quantity_available" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0,
	"last_counted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_ag_part_number_location_id_unique" UNIQUE("ag_part_number","location_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_item_cost_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_item_id" integer NOT NULL,
	"vendor_id" integer,
	"received_date" timestamp NOT NULL,
	"purchase_unit_cost" real NOT NULL,
	"usage_unit_cost" real NOT NULL,
	"currency" text DEFAULT 'USD',
	"po_line_item_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "inventory_item_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "inventory_item_groups_item_id_group_id_unique" UNIQUE("item_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "inventory_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ag_part_number" text NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"supplier_part_number" text,
	"cost_per" real,
	"order_date" date,
	"notes" text,
	"department" text,
	"assigned_departments" jsonb DEFAULT '[]'::jsonb,
	"secondary_source" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"code" text,
	"description" text,
	"category" text,
	"quantity_in_stock" integer,
	"unit_cost" real,
	"supplier" text,
	"status" text,
	"on_hand" integer,
	"location" text,
	"minimum_stock" integer,
	"last_updated" timestamp,
	"committed" integer,
	"available" integer,
	"reorder_point" integer,
	"sku" text,
	"secondary_supplier_part_number" text,
	"vendor_unit" text,
	"purchase_unit_label" text,
	"purchase_unit" text,
	"purchase_quantity" real,
	"consumption_rate" real,
	"usage_unit" text,
	"cogs_per_unit" real,
	"latest_cost" real,
	"allow_manual_cost_override" boolean DEFAULT false,
	"lead_time_days" integer,
	"is_stock_item" boolean DEFAULT false,
	"utilized_in_pl1" boolean DEFAULT false,
	"utilized_in_pl2" boolean DEFAULT false,
	"traceability_required" boolean DEFAULT false,
	"utilized_in_facilities" boolean DEFAULT false,
	"utilized_in_admin" boolean DEFAULT false,
	"utilized_in_services" boolean DEFAULT false,
	"is_packet_part" boolean DEFAULT false,
	"is_fabric" boolean DEFAULT false,
	"type" text,
	"vendor_id" integer,
	"has_sds" boolean DEFAULT false,
	"sds_file_path" text,
	"has_tds" boolean DEFAULT false,
	"tds_file_path" text,
	"has_other_docs" boolean DEFAULT false,
	"other_docs_file_path" text,
	CONSTRAINT "inventory_items_ag_part_number_unique" UNIQUE("ag_part_number")
);
--> statement-breakpoint
CREATE TABLE "inventory_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_code" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"expiration_date" date,
	"manufacture_date" date,
	"lot_number" text,
	"batch_number" text,
	"aluminum_heat_number" text,
	"barcode" text,
	"receiving_date" date,
	"technician_id" text,
	"scanned_at" timestamp DEFAULT now(),
	CONSTRAINT "inventory_scans_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" real NOT NULL,
	"unit_of_measure" text,
	"from_location" text,
	"to_location" text,
	"reference_type" text,
	"reference_id" text,
	"cost_per_unit" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"notes" text,
	"performed_by" text NOT NULL,
	"metadata" jsonb,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_code" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 199 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "item_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "item_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "kickbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"kickback_dept" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_text" text,
	"kickback_date" timestamp NOT NULL,
	"reported_by" text NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"resolution_notes" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"impacted_departments" text[],
	"root_cause" text,
	"corrective_action" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "layup_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"mold_id" text NOT NULL,
	"employee_assignments" jsonb DEFAULT '[]' NOT NULL,
	"is_override" boolean DEFAULT false,
	"overridden_at" timestamp,
	"overridden_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"layup_day" date,
	"week_locked" boolean DEFAULT false,
	"customer_name" text,
	"stock_model" text,
	"material_type" text,
	"action_length" text,
	"lop_value" text,
	"fb_order_number" text,
	"schedule_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "linked_order_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"requires_approval_to_separate" boolean DEFAULT true,
	"approval_code" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "linked_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_group_id" integer NOT NULL,
	"order_id" text NOT NULL,
	"added_at" timestamp DEFAULT now(),
	CONSTRAINT "linked_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"completed_at" timestamp NOT NULL,
	"completed_by" text,
	"notes" text,
	"next_due_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment" text NOT NULL,
	"frequency" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manufacturers_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text,
	"customer_name" text,
	"customer_address" text,
	"po_number" text,
	"part_number" text,
	"lot_number" text,
	"form_data" jsonb NOT NULL,
	"created_by" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_url" text NOT NULL,
	"attachment_type" text,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"is_accomplished" boolean DEFAULT false,
	"accomplished_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "metal_accessories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"inventory" integer DEFAULT 0 NOT NULL,
	"minimum_threshold" integer DEFAULT 0 NOT NULL,
	"machined" integer DEFAULT 0 NOT NULL,
	"at_anodizer" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "molds" (
	"id" serial PRIMARY KEY NOT NULL,
	"mold_id" text NOT NULL,
	"model_name" text NOT NULL,
	"stock_models" text[] DEFAULT '{}',
	"instance_number" integer NOT NULL,
	"enabled" boolean DEFAULT true,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "molds_mold_id_unique" UNIQUE("mold_id")
);
--> statement-breakpoint
CREATE TABLE "nonconformance_records" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "nonconformance_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" text,
	"serial_number" text,
	"customer_name" text,
	"po_number" text,
	"stock_model" text,
	"quantity" integer DEFAULT 1,
	"issue_cause" text NOT NULL,
	"manufacturer_defect" boolean DEFAULT false,
	"disposition" text NOT NULL,
	"auth_person" text NOT NULL,
	"disposition_date" date NOT NULL,
	"notes" text,
	"status" text DEFAULT 'Open',
	"resolved_at" timestamp,
	"repair_department" text,
	"repair_notes" text,
	"has_customer_parts_to_return" boolean DEFAULT false,
	"added_to_rts" boolean DEFAULT false,
	"rts_added_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"user_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "oem_priority_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"vendor_name" text NOT NULL,
	"po_id" integer NOT NULL,
	"po_number" text NOT NULL,
	"selection_mode" text NOT NULL,
	"stock_item_ids" json,
	"manual_quantities" json,
	"priority_level" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"signed" boolean DEFAULT false,
	"signature_data_url" text,
	"signed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"file_name" text NOT NULL,
	"original_file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"file_path" text NOT NULL,
	"uploaded_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_department_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "order_department_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "order_filter_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filters" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"is_shared" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_id_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"year_month_prefix" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"reserved_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false,
	"used_at" timestamp,
	"session_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "order_id_reservations_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "order_id_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"year_month_prefix" text NOT NULL,
	"current_sequence" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_id_sequences_year_month_prefix_unique" UNIQUE("year_month_prefix")
);
--> statement-breakpoint
CREATE TABLE "order_status_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "order_status_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer" text NOT NULL,
	"product" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"status_id" integer,
	"date" timestamp NOT NULL,
	"order_date" timestamp,
	"current_department" text DEFAULT 'P1 Production Queue' NOT NULL,
	"current_department_id" integer,
	"is_on_schedule" boolean DEFAULT true,
	"priority_score" integer DEFAULT 50,
	"rush_tier" text,
	"po_id" integer,
	"item_id" text,
	"stock_model_id" text,
	"customer_id" text,
	"notes" text,
	"shipped_at" timestamp,
	"due_date" timestamp,
	"layup_completed_at" timestamp,
	"plugging_completed_at" timestamp,
	"cnc_completed_at" timestamp,
	"finish_completed_at" timestamp,
	"gunsmith_completed_at" timestamp,
	"paint_completed_at" timestamp,
	"qc_completed_at" timestamp,
	"shipping_completed_at" timestamp,
	"scrap_date" timestamp,
	"scrap_reason" text,
	"scrap_disposition" text,
	"scrap_authorization" text,
	"is_replacement" boolean DEFAULT false,
	"replaced_order_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "p2_customers" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "p2_customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"billing_address" text,
	"shipping_address" text,
	"ship_to_address" text,
	"payment_terms" text DEFAULT 'NET_30',
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"rfq_prefix" text,
	"rfq_sequences" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "p2_customers_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "p2_employee_part_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_certification_id" integer NOT NULL,
	"part_number" text NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_name" text,
	"department" text NOT NULL,
	"drawing_knowledge" boolean DEFAULT false,
	"spec_sheet_understanding" boolean DEFAULT false,
	"procedure_completion" boolean DEFAULT false,
	"certified_date" timestamp,
	"certified_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "p2_part_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number" text NOT NULL,
	"part_name" text,
	"departments" text[] NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "p2_production_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"p2_po_id" integer NOT NULL,
	"p2_po_item_id" integer NOT NULL,
	"bom_definition_id" uuid NOT NULL,
	"bom_item_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"part_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"department" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"priority" integer DEFAULT 50,
	"due_date" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "p2_production_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "p2_purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"part_number" text NOT NULL,
	"part_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" real DEFAULT 0,
	"total_price" real DEFAULT 0,
	"specifications" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "p2_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"po_date" date NOT NULL,
	"expected_delivery" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "p2_purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "p2_serialized_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serialized_item_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"event_type" text NOT NULL,
	"from_department" text,
	"to_department" text,
	"from_stage_index" integer,
	"to_stage_index" integer,
	"performed_by" text NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "p2_serialized_item_traceability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serialized_item_id" uuid NOT NULL,
	"department" text NOT NULL,
	"inventory_part_id" text,
	"inventory_part_number" text,
	"traceability_type" text NOT NULL,
	"traceability_label" text NOT NULL,
	"traceability_value" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "p2_serialized_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"barcode" text NOT NULL,
	"po_id" integer NOT NULL,
	"po_item_id" integer NOT NULL,
	"po_number" text NOT NULL,
	"part_number" text NOT NULL,
	"part_name" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"current_department" text DEFAULT 'Layup' NOT NULL,
	"current_stage_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"department_history" jsonb DEFAULT '[]',
	"metadata" jsonb,
	"layup_completed_at" timestamp,
	"assemble_disassembly_completed_at" timestamp,
	"cnc_completed_at" timestamp,
	"finish_completed_at" timestamp,
	"paint_completed_at" timestamp,
	"final_qc_completed_at" timestamp,
	"completed_at" timestamp,
	"hold_reason" text,
	"hold_by" text,
	"hold_at" timestamp,
	"scrap_reason" text,
	"scrap_by" text,
	"scrap_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "p2_serialized_items_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "p2_serialized_items_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "part_routings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" text NOT NULL,
	"part_number" text NOT NULL,
	"part_name" text NOT NULL,
	"department_sequence" jsonb NOT NULL,
	"traceability_config" jsonb NOT NULL,
	"department_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"uom" text DEFAULT 'EA' NOT NULL,
	"std_cost" numeric(18, 6) DEFAULT '0' NOT NULL,
	"weight" numeric(18, 6) DEFAULT '0' NOT NULL,
	"is_make" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parts_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text,
	"part_number" text NOT NULL,
	"part_name" text NOT NULL,
	"requested_by" text NOT NULL,
	"department" text,
	"department_id" integer,
	"quantity" integer NOT NULL,
	"urgency" text NOT NULL,
	"supplier" text,
	"estimated_cost" real,
	"reason" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_date" timestamp DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_date" timestamp,
	"order_date" timestamp,
	"expected_delivery" date,
	"actual_delivery" date,
	"delivered_to_department" timestamp,
	"received_by_department" text,
	"vendor_po_id" integer,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"payment_type" text NOT NULL,
	"payment_amount" real NOT NULL,
	"payment_date" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pdf_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"type" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"is_generated" boolean DEFAULT false,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"template_json" jsonb NOT NULL,
	"base_pdf_url" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "persistent_discounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_type_id" integer NOT NULL,
	"name" text NOT NULL,
	"percent" integer,
	"fixed_amount" integer,
	"description" text,
	"applies_to" text DEFAULT 'stock_model' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_product_selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_product_id" integer NOT NULL,
	"selection_batch_id" text NOT NULL,
	"quantity_selected" integer DEFAULT 1 NOT NULL,
	"selection_source" text DEFAULT 'p1',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "po_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"product_name" text NOT NULL,
	"material" text,
	"handedness" text,
	"stock_model" text,
	"action_length" text,
	"action_inlet" text,
	"bottom_metal" text,
	"barrel_inlet" text,
	"qds" text,
	"swivel_studs" text,
	"paint_options" text,
	"texture" text,
	"price" real DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"flat_top" boolean DEFAULT false,
	"notes" text,
	"product_type" text,
	"po_number" text,
	"due_date" date,
	"quantity" integer DEFAULT 1,
	"customer_po_line" text,
	"target_week" text,
	"linked_order_id" text,
	"status" text DEFAULT 'pending',
	"priority_note" text,
	"other_options" text[]
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"po_id" integer NOT NULL,
	"po_item_id" integer NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"po_number" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"specifications" jsonb,
	"order_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"production_status" text DEFAULT 'PENDING' NOT NULL,
	"current_department" text DEFAULT 'Barcode',
	"department_history" jsonb DEFAULT '[]',
	"barcode_completed_at" timestamp,
	"layup_completed_at" timestamp,
	"cnc_completed_at" timestamp,
	"finish_completed_at" timestamp,
	"gunsmith_completed_at" timestamp,
	"paint_completed_at" timestamp,
	"qc_completed_at" timestamp,
	"shipping_completed_at" timestamp,
	"laid_up_at" timestamp,
	"shipped_at" timestamp,
	"is_fulfilled" boolean DEFAULT false NOT NULL,
	"fulfilled_date" timestamp,
	"fulfilled_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"priority_score" integer,
	"current_pipeline_config" jsonb,
	"has_p1_priority" boolean DEFAULT false,
	CONSTRAINT "production_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "production_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"order_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"priority_score" integer NOT NULL,
	"department" text DEFAULT 'Layup' NOT NULL,
	"status" text DEFAULT 'FINALIZED' NOT NULL,
	"customer" text NOT NULL,
	"product" text NOT NULL,
	"needs_lop_adjustment" boolean DEFAULT false,
	"priority" integer DEFAULT 50,
	"priority_changed_at" timestamp,
	"last_scheduled_lop_adjustment_date" timestamp,
	"scheduled_lop_adjustment_date" timestamp,
	"lop_adjustment_override_reason" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "production_queue_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"stock_model_id" text,
	"stock_model_name" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric DEFAULT '0',
	"total_price" numeric DEFAULT '0',
	"handedness" text,
	"features" jsonb,
	"custom_options" jsonb,
	"due_date" date,
	"production_notes" text,
	"item_type" text,
	"item_id" text,
	"item_name" text,
	"specifications" jsonb,
	"notes" text,
	"order_count" integer DEFAULT 0,
	"override_p1_priority" boolean,
	"item_pipeline_config" jsonb,
	"stock_status" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"item_type" text DEFAULT 'single' NOT NULL,
	"po_date" date NOT NULL,
	"expected_delivery" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "purchase_review_checklist_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text,
	"quote_id" text,
	"existing_customer" text,
	"significant_changes" text,
	"company_name" text,
	"address" text,
	"contracting_officer" text,
	"phone" text,
	"email" text,
	"ffl" text,
	"ffl_copy_on_hand" text,
	"credit_check_auth" text,
	"credit_approval" text,
	"po_number" text,
	"contract_number" text,
	"invoice_remittance" text,
	"payment_terms" text,
	"early_pay_discount" text,
	"payment_method" text,
	"payment_method_other" text,
	"outside_services" text,
	"quantity_requested" text,
	"unit_of_measure" text,
	"unit_price" text,
	"tooling_price" text,
	"additional_items" text,
	"additional_cost" text,
	"amount" text,
	"disbursement_schedule" text,
	"level1_item_number" text,
	"level1_parts_kits" text,
	"level1_exhibits" text,
	"level2_item_number" text,
	"level2_parts_kits" text,
	"level2_programming" text,
	"level3_item_number" text,
	"level3_parts_kits" text,
	"level3_exhibits" text,
	"critical_safety_items" text,
	"quality_requirements" text,
	"acceptance_rejection_criteria" text,
	"verification_operations" text,
	"verification_requirements" text,
	"verification_sequence" text,
	"measurement_results" text,
	"measurement_equipment" text,
	"special_instructions" text,
	"material_sourcing" text,
	"optional_design_elements" text,
	"tolerances_provided" text,
	"first_article_quantity" text,
	"first_article_due_date" text,
	"inspection_location" text,
	"acceptance_timeframe" text,
	"special_packaging" text,
	"special_marking" text,
	"fob_type" text,
	"shipping_company" text,
	"client_account_number" text,
	"shipping_type" text,
	"delivery_schedule" text,
	"ship_to_information" text,
	"certifications" text[],
	"retention_requirements" text,
	"dpas_rating" text,
	"reviewer_name" text,
	"reviewer_title" text,
	"acceptance" text,
	"signature" text,
	"date" text,
	"submitted_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_review_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text,
	"form_data" jsonb NOT NULL,
	"created_by" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qc_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"line" text NOT NULL,
	"department" text NOT NULL,
	"final" boolean DEFAULT false,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qc_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"line" text NOT NULL,
	"department" text NOT NULL,
	"sku" text NOT NULL,
	"final" boolean DEFAULT false,
	"data" jsonb NOT NULL,
	"signature" text,
	"summary" text,
	"status" text DEFAULT 'pending',
	"due_date" timestamp,
	"submitted_at" timestamp DEFAULT now(),
	"submitted_by" text
);
--> statement-breakpoint
CREATE TABLE "quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"quantity" real DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"total_price" real DEFAULT 0 NOT NULL,
	"inventory_item_id" integer,
	"ag_part_number" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"description" text,
	"total_amount" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"valid_until" timestamp,
	"quoted_by" text,
	"notes" text,
	"attachments" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"refund_type" text,
	"amount" real,
	"reason" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp DEFAULT now(),
	"approved_by" text,
	"approved_at" timestamp,
	"processed_by" text,
	"processed_at" timestamp,
	"transaction_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"customer_id" text,
	"refund_amount" real,
	"rejection_reason" text,
	"auth_net_transaction_id" text,
	"auth_net_refund_id" text,
	"original_transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "rfq_risk_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"description" text,
	"form_data" jsonb NOT NULL,
	"total_overall_points" integer DEFAULT 0,
	"adjusted_risk_level" integer DEFAULT 0,
	"risk_determination" text,
	"bid_decision" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp,
	"attachments" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rfq_risk_assessments_rfq_number_unique" UNIQUE("rfq_number")
);
--> statement-breakpoint
CREATE TABLE "rts_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_model" text NOT NULL,
	"action_length" text,
	"action" text,
	"barrel" text,
	"bottom_metal" text,
	"color" text,
	"extras" text,
	"price" real,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"current_department" text,
	"return_reason" text,
	"return_notes" text,
	"shipped_date" timestamp,
	"shipped_by" text,
	"returned_to_production_date" timestamp,
	"returned_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rts_inventory_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rts_inventory_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"department" text,
	"reason" text,
	"notes" text,
	"performed_by" text NOT NULL,
	"performed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rts_sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rts_sale_id" uuid NOT NULL,
	"rts_inventory_id" uuid NOT NULL,
	"stock_model" text NOT NULL,
	"action_length" text,
	"action" text,
	"barrel" text,
	"bottom_metal" text,
	"color" text,
	"extras" text,
	"unit_price" real NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"line_total" real NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rts_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text,
	"tracking_number" text,
	"shipping_carrier" text DEFAULT 'UPS',
	"shipping_method" text,
	"shipping_cost" real,
	"shipping_label_url" text,
	"ship_to_name" text,
	"ship_to_company" text,
	"ship_to_street" text,
	"ship_to_street2" text,
	"ship_to_city" text,
	"ship_to_state" text,
	"ship_to_zip_code" text,
	"ship_to_country" text DEFAULT 'US',
	"ship_to_phone" text,
	"is_residential" boolean DEFAULT true,
	"subtotal" real,
	"tax" real,
	"total_amount" real,
	"payment_status" text DEFAULT 'UNPAID',
	"amount_paid" real DEFAULT 0,
	"balance_due" real,
	"status" text DEFAULT 'PENDING',
	"sale_date" timestamp DEFAULT now(),
	"shipped_date" timestamp,
	"delivered_date" timestamp,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rts_sales_sale_number_unique" UNIQUE("sale_number")
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"po_item_id" integer NOT NULL,
	"order_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"weight_lbs" numeric(10, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_items_shipment_id_order_id_unique" UNIQUE("shipment_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "shipment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"po_numbers" text NOT NULL,
	"carrier" text DEFAULT 'UPS' NOT NULL,
	"service_level" text NOT NULL,
	"bill_type" text DEFAULT 'SENDER' NOT NULL,
	"third_party_account" text,
	"master_tracking_number" text NOT NULL,
	"package_count" integer DEFAULT 1 NOT NULL,
	"total_weight_lbs" numeric(10, 2) NOT NULL,
	"shipped_at" timestamp DEFAULT now() NOT NULL,
	"estimated_delivery" timestamp,
	"ship_from_snapshot" jsonb NOT NULL,
	"ship_to_snapshot" jsonb NOT NULL,
	"notification_metadata" jsonb DEFAULT '{}'::jsonb,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_term_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"percent" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"applies_to" text DEFAULT 'total' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price" real NOT NULL,
	"description" text,
	"handedness" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"due_date" timestamp,
	"gj_status" boolean DEFAULT false NOT NULL,
	"tm_status" boolean DEFAULT false NOT NULL,
	"finished_status" boolean DEFAULT false NOT NULL,
	"assigned_to" text,
	"created_by" text NOT NULL,
	"gj_completed_by" text,
	"gj_completed_at" timestamp,
	"tm_completed_by" text,
	"tm_completed_at" timestamp,
	"finished_completed_by" text,
	"finished_completed_at" timestamp,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_clock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"clock_in" timestamp,
	"clock_out" timestamp,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer,
	"employee_name" text,
	"job_title" text,
	"department" text,
	"training_name" text NOT NULL,
	"required_by" text,
	"frequency" text,
	"last_completed" timestamp,
	"last_score" integer,
	"next_due" timestamp,
	"status" text DEFAULT 'PENDING',
	"documentation_url" text,
	"notes" text,
	"is_legacy" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" text,
	"content_html" text,
	"category" text,
	"estimated_minutes" integer DEFAULT 30,
	"passing_score" integer DEFAULT 80,
	"requires_certification" boolean DEFAULT false,
	"certification_id" integer,
	"pdf_source" text,
	"version" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_question_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"question_text" text NOT NULL,
	"question_type" text DEFAULT 'MULTIPLE_CHOICE' NOT NULL,
	"correct_answer" text,
	"explanation" text,
	"points" integer DEFAULT 1,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"capability_id" integer NOT NULL,
	"granted_by" text,
	"is_hardcoded" boolean DEFAULT false,
	"use_hardcoded_value" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_capabilities_user_id_capability_id_unique" UNIQUE("user_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "user_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"is_connected" boolean DEFAULT false,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"account_email" text,
	"account_name" text,
	"last_synced_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_activity_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'EMPLOYEE' NOT NULL,
	"employee_id" integer,
	"first_name" text,
	"last_name" text,
	"email" text,
	"can_override_prices" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_login" timestamp,
	"failed_login_attempts" integer DEFAULT 0,
	"account_locked_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vendor_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_monthly_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"quality_score" integer,
	"cost_score" integer,
	"delivery_score" integer,
	"response_score" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_monthly_evaluations_vendor_id_month_year_unique" UNIQUE("vendor_id","month","year")
);
--> statement-breakpoint
CREATE TABLE "vendor_po_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_po_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"ag_part_number" text,
	"description" text,
	"quantity" integer NOT NULL,
	"unit_price" real NOT NULL,
	"line_total" real NOT NULL,
	"received_quantity" integer DEFAULT 0,
	"received_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_po_items_vendor_po_id_line_number_unique" UNIQUE("vendor_po_id","line_number")
);
--> statement-breakpoint
CREATE TABLE "vendor_po_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"terms_and_conditions" text,
	"payment_terms" text,
	"shipping_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_pos" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" integer NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"order_date" date,
	"expected_delivery_date" date,
	"actual_delivery_date" date,
	"ship_via" text,
	"barcode" text,
	"subtotal" real DEFAULT 0,
	"tax" real DEFAULT 0,
	"shipping_cost" real DEFAULT 0,
	"total_cost" real DEFAULT 0,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_pos_po_number_unique" UNIQUE("po_number"),
	CONSTRAINT "vendor_pos_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "vendor_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_part_number" text,
	"unit_price" real,
	"lead_time_days" integer,
	"minimum_order_qty" integer DEFAULT 1,
	"is_preferred" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_parts_ag_part_number_vendor_id_unique" UNIQUE("ag_part_number","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_scope_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "vendor_scope_groups_vendor_id_group_id_unique" UNIQUE("vendor_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_scope_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "vendor_scope_items_vendor_id_item_id_unique" UNIQUE("vendor_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"additional_email" text,
	"phone" text,
	"address" text,
	"street" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text DEFAULT 'United States',
	"scope" text,
	"approval_level" text,
	"approval_source" text,
	"approval_pdf_url" text,
	"start_renewal_date" date,
	"approval_expiration" date,
	"approved" boolean DEFAULT false NOT NULL,
	"evaluated" boolean DEFAULT false NOT NULL,
	"evaluation_date" date,
	"quality_score" integer,
	"cost_score" integer,
	"delivery_score" integer,
	"response_score" integer,
	"notes" text,
	"terms_and_conditions" text,
	"payment_terms" text,
	"shipping_instructions" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_schedule_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start_date" date NOT NULL,
	"day_of_week" text NOT NULL,
	"item_type" text NOT NULL,
	"order_id" text,
	"po_product_id" integer,
	"mold_count" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "all_orders" ADD CONSTRAINT "all_orders_status_id_order_status_types_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."order_status_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_orders" ADD CONSTRAINT "all_orders_current_department_id_order_department_types_id_fk" FOREIGN KEY ("current_department_id") REFERENCES "public"."order_department_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_orders" ADD CONSTRAINT "all_orders_bom_definition_id_bom_definitions_id_fk" FOREIGN KEY ("bom_definition_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bom_id_bom_definitions_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_reference_bom_id_bom_definitions_id_fk" FOREIGN KEY ("reference_bom_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_revision_id_bom_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bom_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_child_part_ag_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("child_part_ag_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revisions" ADD CONSTRAINT "bom_revisions_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_parent_part_ag_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("parent_part_ag_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_communication_log_id_communication_logs_id_fk" FOREIGN KEY ("communication_log_id") REFERENCES "public"."communication_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_satisfaction_responses" ADD CONSTRAINT "customer_satisfaction_responses_survey_id_customer_satisfaction_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."customer_satisfaction_surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_satisfaction_responses" ADD CONSTRAINT "customer_satisfaction_responses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_model_prices" ADD CONSTRAINT "customer_stock_model_prices_stock_model_id_stock_models_id_fk" FOREIGN KEY ("stock_model_id") REFERENCES "public"."stock_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_components" ADD CONSTRAINT "cutting_components_material_id_cutting_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."cutting_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_components" ADD CONSTRAINT "cutting_components_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_cut_progress" ADD CONSTRAINT "cutting_cut_progress_material_id_cutting_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."cutting_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_cut_progress" ADD CONSTRAINT "cutting_cut_progress_production_line_id_cutting_production_lines_id_fk" FOREIGN KEY ("production_line_id") REFERENCES "public"."cutting_production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_cut_progress" ADD CONSTRAINT "cutting_cut_progress_product_category_id_cutting_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."cutting_product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_cut_progress" ADD CONSTRAINT "cutting_cut_progress_component_id_cutting_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."cutting_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_cut_records" ADD CONSTRAINT "cutting_cut_records_product_category_id_cutting_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."cutting_product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_fabric_inventory" ADD CONSTRAINT "cutting_fabric_inventory_material_id_cutting_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."cutting_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_fabric_inventory" ADD CONSTRAINT "cutting_fabric_inventory_production_line_id_cutting_production_lines_id_fk" FOREIGN KEY ("production_line_id") REFERENCES "public"."cutting_production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_fabric_inventory_transactions" ADD CONSTRAINT "cutting_fabric_inventory_transactions_fabric_inventory_id_cutting_fabric_inventory_id_fk" FOREIGN KEY ("fabric_inventory_id") REFERENCES "public"."cutting_fabric_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_fabric_inventory_transactions" ADD CONSTRAINT "cutting_fabric_inventory_transactions_session_lot_id_cutting_packet_session_lots_id_fk" FOREIGN KEY ("session_lot_id") REFERENCES "public"."cutting_packet_session_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_compositions" ADD CONSTRAINT "cutting_packet_compositions_product_category_id_cutting_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."cutting_product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_compositions" ADD CONSTRAINT "cutting_packet_compositions_component_id_cutting_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."cutting_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_compositions" ADD CONSTRAINT "cutting_packet_compositions_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_session_lots" ADD CONSTRAINT "cutting_packet_session_lots_session_id_cutting_packet_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cutting_packet_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_session_lots" ADD CONSTRAINT "cutting_packet_session_lots_component_id_cutting_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."cutting_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_session_lots" ADD CONSTRAINT "cutting_packet_session_lots_fabric_inventory_id_cutting_fabric_inventory_id_fk" FOREIGN KEY ("fabric_inventory_id") REFERENCES "public"."cutting_fabric_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_packet_sessions" ADD CONSTRAINT "cutting_packet_sessions_product_category_id_cutting_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."cutting_product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_product_categories" ADD CONSTRAINT "cutting_product_categories_production_line_id_cutting_production_lines_id_fk" FOREIGN KEY ("production_line_id") REFERENCES "public"."cutting_production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_weekly_data" ADD CONSTRAINT "cutting_weekly_data_production_line_id_cutting_production_lines_id_fk" FOREIGN KEY ("production_line_id") REFERENCES "public"."cutting_production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_weekly_data" ADD CONSTRAINT "cutting_weekly_data_product_category_id_cutting_product_categories_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."cutting_product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_consumption_rates" ADD CONSTRAINT "department_consumption_rates_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_consumption_rates" ADD CONSTRAINT "department_consumption_rates_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection_relations" ADD CONSTRAINT "document_collection_relations_collection_id_document_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."document_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection_relations" ADD CONSTRAINT "document_collection_relations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_relations" ADD CONSTRAINT "document_tag_relations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_relations" ADD CONSTRAINT "document_tag_relations_tag_id_document_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."document_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version_history" ADD CONSTRAINT "document_version_history_document_id_controlled_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."controlled_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_log" ADD CONSTRAINT "employee_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_capabilities" ADD CONSTRAINT "employee_capabilities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_capabilities" ADD CONSTRAINT "employee_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_layup_settings" ADD CONSTRAINT "employee_layup_settings_employee_id_employees_employee_code_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("employee_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_quiz_attempts" ADD CONSTRAINT "employee_quiz_attempts_training_record_id_employee_training_records_id_fk" FOREIGN KEY ("training_record_id") REFERENCES "public"."employee_training_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_quiz_attempts" ADD CONSTRAINT "employee_quiz_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_quiz_attempts" ADD CONSTRAINT "employee_quiz_attempts_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_training_records" ADD CONSTRAINT "employee_training_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_training_records" ADD CONSTRAINT "employee_training_records_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_form_submissions" ADD CONSTRAINT "enhanced_form_submissions_form_id_enhanced_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."enhanced_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_form_versions" ADD CONSTRAINT "enhanced_form_versions_form_id_enhanced_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."enhanced_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_forms" ADD CONSTRAINT "enhanced_forms_category_id_enhanced_form_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."enhanced_form_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_employees_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_sub_categories" ADD CONSTRAINT "feature_sub_categories_category_id_feature_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."feature_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_category_feature_categories_id_fk" FOREIGN KEY ("category") REFERENCES "public"."feature_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_sub_category_feature_sub_categories_id_fk" FOREIGN KEY ("sub_category") REFERENCES "public"."feature_sub_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_cost_history" ADD CONSTRAINT "inventory_item_cost_history_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_cost_history" ADD CONSTRAINT "inventory_item_cost_history_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_cost_history" ADD CONSTRAINT "inventory_item_cost_history_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_groups" ADD CONSTRAINT "inventory_item_groups_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item_groups" ADD CONSTRAINT "inventory_item_groups_group_id_item_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layup_schedule" ADD CONSTRAINT "layup_schedule_order_id_production_queue_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_queue"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layup_schedule" ADD CONSTRAINT "layup_schedule_mold_id_molds_mold_id_fk" FOREIGN KEY ("mold_id") REFERENCES "public"."molds"("mold_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_orders" ADD CONSTRAINT "linked_orders_link_group_id_linked_order_groups_id_fk" FOREIGN KEY ("link_group_id") REFERENCES "public"."linked_order_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_id_order_status_types_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."order_status_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_current_department_id_order_department_types_id_fk" FOREIGN KEY ("current_department_id") REFERENCES "public"."order_department_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_employee_part_certifications" ADD CONSTRAINT "p2_employee_part_certifications_part_certification_id_p2_part_certifications_id_fk" FOREIGN KEY ("part_certification_id") REFERENCES "public"."p2_part_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_employee_part_certifications" ADD CONSTRAINT "p2_employee_part_certifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_p2_po_id_p2_purchase_orders_id_fk" FOREIGN KEY ("p2_po_id") REFERENCES "public"."p2_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_p2_po_item_id_p2_purchase_order_items_id_fk" FOREIGN KEY ("p2_po_item_id") REFERENCES "public"."p2_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_bom_definition_id_bom_definitions_id_fk" FOREIGN KEY ("bom_definition_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_purchase_order_items" ADD CONSTRAINT "p2_purchase_order_items_po_id_p2_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."p2_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_purchase_orders" ADD CONSTRAINT "p2_purchase_orders_customer_id_p2_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."p2_customers"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_serialized_item_events" ADD CONSTRAINT "p2_serialized_item_events_serialized_item_id_p2_serialized_items_id_fk" FOREIGN KEY ("serialized_item_id") REFERENCES "public"."p2_serialized_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_serialized_item_traceability" ADD CONSTRAINT "p2_serialized_item_traceability_serialized_item_id_p2_serialized_items_id_fk" FOREIGN KEY ("serialized_item_id") REFERENCES "public"."p2_serialized_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_serialized_items" ADD CONSTRAINT "p2_serialized_items_po_id_p2_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."p2_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_serialized_items" ADD CONSTRAINT "p2_serialized_items_po_item_id_p2_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."p2_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_requests" ADD CONSTRAINT "parts_requests_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_requests" ADD CONSTRAINT "parts_requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_requests" ADD CONSTRAINT "parts_requests_vendor_po_id_vendor_pos_id_fk" FOREIGN KEY ("vendor_po_id") REFERENCES "public"."vendor_pos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_all_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."all_orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persistent_discounts" ADD CONSTRAINT "persistent_discounts_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_product_selections" ADD CONSTRAINT "po_product_selections_po_product_id_po_products_id_fk" FOREIGN KEY ("po_product_id") REFERENCES "public"."po_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_risk_assessments" ADD CONSTRAINT "rfq_risk_assessments_customer_id_p2_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."p2_customers"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rts_inventory_history" ADD CONSTRAINT "rts_inventory_history_rts_inventory_id_rts_inventory_id_fk" FOREIGN KEY ("rts_inventory_id") REFERENCES "public"."rts_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rts_sale_items" ADD CONSTRAINT "rts_sale_items_rts_sale_id_rts_sales_id_fk" FOREIGN KEY ("rts_sale_id") REFERENCES "public"."rts_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rts_sale_items" ADD CONSTRAINT "rts_sale_items_rts_inventory_id_rts_inventory_id_fk" FOREIGN KEY ("rts_inventory_id") REFERENCES "public"."rts_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipment_records_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_matrix" ADD CONSTRAINT "training_matrix_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_question_options" ADD CONSTRAINT "training_question_options_question_id_training_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."training_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_module_id_training_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."training_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_monthly_evaluations" ADD CONSTRAINT "vendor_monthly_evaluations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_po_items" ADD CONSTRAINT "vendor_po_items_vendor_po_id_vendor_pos_id_fk" FOREIGN KEY ("vendor_po_id") REFERENCES "public"."vendor_pos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_po_items" ADD CONSTRAINT "vendor_po_items_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_pos" ADD CONSTRAINT "vendor_pos_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_ag_part_number_inventory_items_ag_part_number_fk" FOREIGN KEY ("ag_part_number") REFERENCES "public"."inventory_items"("ag_part_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_scope_groups" ADD CONSTRAINT "vendor_scope_groups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_scope_groups" ADD CONSTRAINT "vendor_scope_groups_group_id_item_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_scope_items" ADD CONSTRAINT "vendor_scope_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_scope_items" ADD CONSTRAINT "vendor_scope_items_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_schedule_assignments" ADD CONSTRAINT "weekly_schedule_assignments_po_product_id_po_products_id_fk" FOREIGN KEY ("po_product_id") REFERENCES "public"."po_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_order_id_idx" ON "admin_audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "admin_audit_changed_by_idx" ON "admin_audit_log" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "admin_audit_timestamp_idx" ON "admin_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "admin_audit_order_time_idx" ON "admin_audit_log" USING btree ("order_id","timestamp");--> statement-breakpoint
CREATE INDEX "bom_lines_rev_idx" ON "bom_lines" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "bom_lines_child_idx" ON "bom_lines" USING btree ("child_part_ag_number");--> statement-breakpoint
CREATE INDEX "bom_rev_unique" ON "bom_revisions" USING btree ("bom_id","rev_code");--> statement-breakpoint
CREATE INDEX "boms_parent_idx" ON "boms" USING btree ("parent_part_ag_number");--> statement-breakpoint
CREATE INDEX "boms_code_idx" ON "boms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cutting_cut_records_work_date_idx" ON "cutting_cut_records" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "cutting_cut_records_category_idx" ON "cutting_cut_records" USING btree ("product_category_id");--> statement-breakpoint
CREATE INDEX "cutting_fabric_inventory_expiration_idx" ON "cutting_fabric_inventory" USING btree ("expiration_date");--> statement-breakpoint
CREATE INDEX "p2_serialized_item_events_barcode_idx" ON "p2_serialized_item_events" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "p2_serialized_item_events_item_id_idx" ON "p2_serialized_item_events" USING btree ("serialized_item_id");--> statement-breakpoint
CREATE INDEX "p2_serialized_item_traceability_item_id_idx" ON "p2_serialized_item_traceability" USING btree ("serialized_item_id");--> statement-breakpoint
CREATE INDEX "p2_serialized_item_traceability_department_idx" ON "p2_serialized_item_traceability" USING btree ("department");--> statement-breakpoint
CREATE INDEX "part_routings_inventory_item_idx" ON "part_routings" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "parts_sku_idx" ON "parts" USING btree ("sku");