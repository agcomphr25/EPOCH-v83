import { pool } from '../../db';

let productionWorkflowReadinessPromise: Promise<void> | null = null;

export async function ensureProductionWorkflowReadSchema(): Promise<void> {
  if (productionWorkflowReadinessPromise) return productionWorkflowReadinessPromise;

  productionWorkflowReadinessPromise = (async () => {
    await pool.query(`SELECT pg_advisory_lock(hashtext('epoch_production_workflow_readiness'))`);
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF to_regclass('public.projects') IS NOT NULL THEN
            ALTER TABLE public.projects
              ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'rfq_received',
              ADD COLUMN IF NOT EXISTS stage_updated_at timestamp DEFAULT now(),
              ADD COLUMN IF NOT EXISTS po_id integer,
              ADD COLUMN IF NOT EXISTS project_manager_id integer,
              ADD COLUMN IF NOT EXISTS reminder_days integer DEFAULT 3,
              ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp,
              ADD COLUMN IF NOT EXISTS notes text,
              ADD COLUMN IF NOT EXISTS default_charge_code_id integer,
              ADD COLUMN IF NOT EXISTS created_by integer,
              ADD COLUMN IF NOT EXISTS customers_integer_id integer,
              ADD COLUMN IF NOT EXISTS customer_name_snapshot text;
          END IF;

          IF to_regclass('public.project_steps') IS NOT NULL THEN
            ALTER TABLE public.project_steps
              ADD COLUMN IF NOT EXISTS linked_rfq_id integer,
              ADD COLUMN IF NOT EXISTS linked_quote_id uuid,
              ADD COLUMN IF NOT EXISTS linked_purchase_review_id integer,
              ADD COLUMN IF NOT EXISTS linked_preproduction_checklist_id uuid,
              ADD COLUMN IF NOT EXISTS linked_p2_order_id integer,
              ADD COLUMN IF NOT EXISTS completed_by_display_name text;
          END IF;

          IF to_regclass('public.production_work_orders') IS NOT NULL THEN
            ALTER TABLE public.production_work_orders
              ADD COLUMN IF NOT EXISTS department_budgets jsonb DEFAULT '{}'::jsonb,
              ADD COLUMN IF NOT EXISTS total_budget_hours numeric,
              ADD COLUMN IF NOT EXISTS start_date date,
              ADD COLUMN IF NOT EXISTS due_date date,
              ADD COLUMN IF NOT EXISTS warning_threshold numeric,
              ADD COLUMN IF NOT EXISTS blocked_threshold numeric,
              ADD COLUMN IF NOT EXISTS default_charge_code_id integer,
              ADD COLUMN IF NOT EXISTS wad_status text NOT NULL DEFAULT 'DRAFT',
              ADD COLUMN IF NOT EXISTS wizard_data jsonb,
              ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
          END IF;

          IF to_regclass('public.travelers') IS NOT NULL THEN
            ALTER TABLE public.travelers
              ADD COLUMN IF NOT EXISTS traveler_revision integer NOT NULL DEFAULT 1,
              ADD COLUMN IF NOT EXISTS production_work_order_id uuid,
              ADD COLUMN IF NOT EXISTS project_id uuid,
              ADD COLUMN IF NOT EXISTS default_charge_code_id integer,
              ADD COLUMN IF NOT EXISTS created_from_template_id uuid,
              ADD COLUMN IF NOT EXISTS created_from_template_version integer,
              ADD COLUMN IF NOT EXISTS off_system_completion_link text;
          END IF;

          IF to_regclass('public.traveler_steps') IS NOT NULL THEN
            ALTER TABLE public.traveler_steps
              ADD COLUMN IF NOT EXISTS blocked_reason text,
              ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone;
          END IF;

          IF to_regclass('public.traveler_tasks') IS NOT NULL THEN
            ALTER TABLE public.traveler_tasks
              ADD COLUMN IF NOT EXISTS task_phase text NOT NULL DEFAULT 'WORK',
              ADD COLUMN IF NOT EXISTS time_policy varchar(50) DEFAULT 'AUTO_ON_COMPLETE',
              ADD COLUMN IF NOT EXISTS requires_signature boolean DEFAULT false,
              ADD COLUMN IF NOT EXISTS signature_role varchar(50),
              ADD COLUMN IF NOT EXISTS requires_certification boolean DEFAULT false,
              ADD COLUMN IF NOT EXISTS instruction_pack jsonb,
              ADD COLUMN IF NOT EXISTS template_source_id uuid;
          END IF;

          IF to_regclass('public.traveler_task_fields') IS NOT NULL THEN
            ALTER TABLE public.traveler_task_fields
              ADD COLUMN IF NOT EXISTS validation jsonb;
          END IF;

          IF to_regclass('public.traveler_signatures') IS NOT NULL THEN
            ALTER TABLE public.traveler_signatures
              ADD COLUMN IF NOT EXISTS traveler_task_id varchar(255),
              ADD COLUMN IF NOT EXISTS signed_by_name varchar(255),
              ADD COLUMN IF NOT EXISTS signature_role varchar(50),
              ADD COLUMN IF NOT EXISTS badge_scan varchar(255),
              ADD COLUMN IF NOT EXISTS signature_hash text,
              ADD COLUMN IF NOT EXISTS signature_data text;
          END IF;

          IF to_regclass('public.punch_ledger') IS NOT NULL THEN
            ALTER TABLE public.punch_ledger
              ADD COLUMN IF NOT EXISTS traveler_id text,
              ADD COLUMN IF NOT EXISTS production_work_order_id uuid,
              ADD COLUMN IF NOT EXISTS charge_code_id integer,
              ADD COLUMN IF NOT EXISTS charge_code text,
              ADD COLUMN IF NOT EXISTS department text,
              ADD COLUMN IF NOT EXISTS operation text,
              ADD COLUMN IF NOT EXISTS labor_class text DEFAULT 'REGULAR',
              ADD COLUMN IF NOT EXISTS project_id uuid,
              ADD COLUMN IF NOT EXISTS traveler_step_id varchar(255),
              ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'PENDING_APPROVAL';
          END IF;

          IF to_regclass('public.labor_budget_overrides') IS NOT NULL THEN
            ALTER TABLE public.labor_budget_overrides
              ADD COLUMN IF NOT EXISTS production_work_order_id uuid,
              ADD COLUMN IF NOT EXISTS requested_hours numeric,
              ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
          END IF;

          IF to_regclass('public.work_orders') IS NOT NULL THEN
            ALTER TABLE public.work_orders
              ADD COLUMN IF NOT EXISTS downtime_start timestamp,
              ADD COLUMN IF NOT EXISTS downtime_end timestamp,
              ADD COLUMN IF NOT EXISTS closed_by integer,
              ADD COLUMN IF NOT EXISTS maintenance_schedule_id integer;
          END IF;

          IF to_regclass('public.parts_requests') IS NOT NULL THEN
            ALTER TABLE public.parts_requests
              ADD COLUMN IF NOT EXISTS project_id uuid,
              ADD COLUMN IF NOT EXISTS estimated_cost real,
              ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
          END IF;

          IF to_regclass('public.material_lot_reservations') IS NOT NULL THEN
            ALTER TABLE public.material_lot_reservations
              ADD COLUMN IF NOT EXISTS traveler_id uuid,
              ADD COLUMN IF NOT EXISTS quantity_reserved numeric,
              ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
          END IF;

          IF to_regclass('public.traveler_material_consumption') IS NOT NULL THEN
            ALTER TABLE public.traveler_material_consumption
              ADD COLUMN IF NOT EXISTS qty_used numeric,
              ADD COLUMN IF NOT EXISTS quantity_used numeric;

            UPDATE public.traveler_material_consumption
            SET qty_used = quantity_used
            WHERE qty_used IS NULL AND quantity_used IS NOT NULL;

            UPDATE public.traveler_material_consumption
            SET quantity_used = qty_used
            WHERE quantity_used IS NULL AND qty_used IS NOT NULL;
          END IF;

          IF to_regclass('public.routing_operations') IS NOT NULL THEN
            ALTER TABLE public.routing_operations
              ADD COLUMN IF NOT EXISTS required_calibration_asset_tags text[] NOT NULL DEFAULT ARRAY[]::text[];
          END IF;

          IF to_regclass('public.wad_production_controls') IS NULL
             AND to_regclass('public.production_work_orders') IS NOT NULL THEN
            CREATE TABLE public.wad_production_controls (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              work_order_id uuid NOT NULL,
              part_type text NOT NULL,
              production_type text NOT NULL,
              routing_required boolean NOT NULL DEFAULT false,
              traveler_required boolean NOT NULL DEFAULT false,
              work_instruction_required boolean NOT NULL DEFAULT false,
              spec_sheet_required boolean NOT NULL DEFAULT false,
              final_qc_only boolean NOT NULL DEFAULT false,
              in_process_inspection_required boolean NOT NULL DEFAULT false,
              spot_check_plan_required boolean NOT NULL DEFAULT false,
              cert_required boolean NOT NULL DEFAULT false,
              ai_reason text,
              ai_confidence_score numeric(3,2),
              ai_risk_level text,
              selected_template_ids jsonb,
              provisioned_at timestamp with time zone,
              provision_summary jsonb,
              created_at timestamp with time zone DEFAULT now(),
              CONSTRAINT wad_production_controls_work_order_unique UNIQUE (work_order_id)
            );
          END IF;

          IF to_regclass('public.wad_document_links') IS NULL
             AND to_regclass('public.production_work_orders') IS NOT NULL THEN
            CREATE TABLE public.wad_document_links (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              work_order_id uuid NOT NULL,
              template_id uuid NOT NULL,
              template_version integer NOT NULL DEFAULT 1,
              template_type text NOT NULL,
              template_name text NOT NULL,
              file_url text,
              linked_at timestamp with time zone DEFAULT now()
            );
          END IF;
        END $$;
      `);
    } finally {
      await pool.query(`SELECT pg_advisory_unlock(hashtext('epoch_production_workflow_readiness'))`);
    }
  })().catch((error) => {
    productionWorkflowReadinessPromise = null;
    throw error;
  });

  return productionWorkflowReadinessPromise;
}
