CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'CONFIRMED', 'FINALIZED', 'CANCELLED', 'RESERVED');--> statement-breakpoint
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
	"notes" text,
	"custom_discount_type" text DEFAULT 'percent',
	"custom_discount_value" real DEFAULT 0,
	"show_custom_discount" boolean DEFAULT false,
	"price_override" real,
	"shipping" real DEFAULT 0,
	"tikka_option" text,
	"status" text DEFAULT 'FINALIZED',
	"barcode" text,
	"current_department" text DEFAULT 'Layup',
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
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "all_orders_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "all_orders_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "bom_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
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
	"id" serial PRIMARY KEY NOT NULL,
	"bom_id" integer NOT NULL,
	"part_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"first_dept" text DEFAULT 'Layup' NOT NULL,
	"item_type" text DEFAULT 'manufactured' NOT NULL,
	"reference_bom_id" integer,
	"assembly_level" integer DEFAULT 0,
	"quantity_multiplier" integer DEFAULT 1,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cancelled_orders" (
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
	"notes" text,
	"custom_discount_type" text DEFAULT 'percent',
	"custom_discount_value" real DEFAULT 0,
	"show_custom_discount" boolean DEFAULT false,
	"price_override" real,
	"shipping" real DEFAULT 0,
	"tikka_option" text,
	"status" text DEFAULT 'CANCELLED',
	"barcode" text,
	"current_department" text,
	"department_history" jsonb DEFAULT '[]',
	"scrapped_quantity" integer DEFAULT 0,
	"total_produced" integer DEFAULT 0,
	"is_paid" boolean DEFAULT false,
	"payment_type" text,
	"payment_amount" real,
	"payment_date" timestamp,
	"payment_timestamp" timestamp,
	"cancelled_at" timestamp NOT NULL,
	"cancel_reason" text NOT NULL,
	"cancelled_by" text,
	"original_created_at" timestamp,
	"original_updated_at" timestamp,
	"archived_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cancelled_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"issuing_organization" text,
	"validity_period" integer,
	"category" text,
	"requirements" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"response_time_seconds" integer,
	"ip_address" text,
	"user_agent" text,
	"csr_name" text,
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
	"created_by" integer,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_collection_relations" (
	"collection_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"relationship_type" text DEFAULT 'primary',
	"display_order" integer DEFAULT 0,
	"added_at" timestamp DEFAULT now(),
	"added_by" integer
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
	"created_by" integer,
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
	"uploaded_by" integer,
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
CREATE TABLE "employee_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"date_obtained" date NOT NULL,
	"expiry_date" date,
	"certificate_number" text,
	"document_url" text,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"uploaded_by" integer,
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
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_code" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text NOT NULL,
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
CREATE TABLE "inventory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"ag_part_number" text NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"supplier_part_number" text,
	"cost_per" real,
	"order_date" date,
	"department" text,
	"secondary_source" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
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
	"impacted_departments" text[] DEFAULT '{"?"}',
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
	"updated_at" timestamp DEFAULT now()
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
	"id" serial PRIMARY KEY NOT NULL,
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
CREATE TABLE "order_drafts" (
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
	"notes" text,
	"custom_discount_type" text DEFAULT 'percent',
	"custom_discount_value" real DEFAULT 0,
	"show_custom_discount" boolean DEFAULT false,
	"price_override" real,
	"shipping" real DEFAULT 0,
	"tikka_option" text,
	"status" text DEFAULT 'DRAFT',
	"barcode" text,
	"current_department" text DEFAULT 'Layup',
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
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "order_drafts_barcode_unique" UNIQUE("barcode")
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
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer" text NOT NULL,
	"product" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" text NOT NULL,
	"date" timestamp NOT NULL,
	"order_date" timestamp,
	"current_department" text DEFAULT 'Layup' NOT NULL,
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
	"id" serial PRIMARY KEY NOT NULL,
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
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "p2_customers_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "p2_production_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"p2_po_id" integer NOT NULL,
	"p2_po_item_id" integer NOT NULL,
	"bom_definition_id" integer NOT NULL,
	"bom_item_id" integer NOT NULL,
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
CREATE TABLE "parts_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number" text NOT NULL,
	"part_name" text NOT NULL,
	"requested_by" text NOT NULL,
	"department" text,
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
CREATE TABLE "po_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"product_name" text NOT NULL,
	"product_type" text,
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
	"flat_top" boolean DEFAULT false,
	"price" real,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	"laid_up_at" timestamp,
	"shipped_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
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
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" real DEFAULT 0,
	"total_price" real DEFAULT 0,
	"specifications" jsonb,
	"notes" text,
	"order_count" integer DEFAULT 0,
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
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_token" text NOT NULL,
	"employee_id" integer,
	"user_type" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'EMPLOYEE' NOT NULL,
	"can_override_prices" boolean DEFAULT false,
	"employee_id" integer,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"password_changed_at" timestamp DEFAULT now(),
	"failed_login_attempts" integer DEFAULT 0,
	"account_locked_until" timestamp,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bom_id_bom_definitions_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_reference_bom_id_bom_definitions_id_fk" FOREIGN KEY ("reference_bom_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_communications" ADD CONSTRAINT "customer_communications_communication_log_id_communication_logs_id_fk" FOREIGN KEY ("communication_log_id") REFERENCES "public"."communication_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_satisfaction_responses" ADD CONSTRAINT "customer_satisfaction_responses_survey_id_customer_satisfaction_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."customer_satisfaction_surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_satisfaction_responses" ADD CONSTRAINT "customer_satisfaction_responses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_satisfaction_surveys" ADD CONSTRAINT "customer_satisfaction_surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_model_prices" ADD CONSTRAINT "customer_stock_model_prices_stock_model_id_stock_models_id_fk" FOREIGN KEY ("stock_model_id") REFERENCES "public"."stock_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection_relations" ADD CONSTRAINT "document_collection_relations_collection_id_document_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."document_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection_relations" ADD CONSTRAINT "document_collection_relations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection_relations" ADD CONSTRAINT "document_collection_relations_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collections" ADD CONSTRAINT "document_collections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_relations" ADD CONSTRAINT "document_tag_relations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_relations" ADD CONSTRAINT "document_tag_relations_tag_id_document_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."document_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_log" ADD CONSTRAINT "employee_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_layup_settings" ADD CONSTRAINT "employee_layup_settings_employee_id_employees_employee_code_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("employee_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_form_submissions" ADD CONSTRAINT "enhanced_form_submissions_form_id_enhanced_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."enhanced_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_form_versions" ADD CONSTRAINT "enhanced_form_versions_form_id_enhanced_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."enhanced_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_forms" ADD CONSTRAINT "enhanced_forms_category_id_enhanced_form_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."enhanced_form_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_employees_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_sub_categories" ADD CONSTRAINT "feature_sub_categories_category_id_feature_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."feature_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_category_feature_categories_id_fk" FOREIGN KEY ("category") REFERENCES "public"."feature_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_sub_category_feature_sub_categories_id_fk" FOREIGN KEY ("sub_category") REFERENCES "public"."feature_sub_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layup_schedule" ADD CONSTRAINT "layup_schedule_order_id_production_queue_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_queue"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layup_schedule" ADD CONSTRAINT "layup_schedule_mold_id_molds_mold_id_fk" FOREIGN KEY ("mold_id") REFERENCES "public"."molds"("mold_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_p2_po_id_p2_purchase_orders_id_fk" FOREIGN KEY ("p2_po_id") REFERENCES "public"."p2_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_p2_po_item_id_p2_purchase_order_items_id_fk" FOREIGN KEY ("p2_po_item_id") REFERENCES "public"."p2_purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_bom_definition_id_bom_definitions_id_fk" FOREIGN KEY ("bom_definition_id") REFERENCES "public"."bom_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_production_orders" ADD CONSTRAINT "p2_production_orders_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_purchase_order_items" ADD CONSTRAINT "p2_purchase_order_items_po_id_p2_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."p2_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "p2_purchase_orders" ADD CONSTRAINT "p2_purchase_orders_customer_id_p2_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."p2_customers"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_order_drafts_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_drafts"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persistent_discounts" ADD CONSTRAINT "persistent_discounts_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;