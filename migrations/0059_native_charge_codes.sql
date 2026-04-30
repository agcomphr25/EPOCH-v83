-- Migration: Native charge code authority (Phase 1 excision)
--
-- Creates public.charge_codes as the single authoritative charge code registry,
-- migrates all rows from timekeeping.labor_charge_codes preserving source IDs,
-- and adds FK constraints to projects, production_work_orders, and travelers.
--
-- Idempotent: ON CONFLICT (code) DO NOTHING for INSERT; DO blocks for FK constraints.

CREATE TABLE IF NOT EXISTS public.charge_codes (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text,
  type text NOT NULL DEFAULT 'DIRECT',
  contract_reference text,
  department text,
  requires_approval boolean NOT NULL DEFAULT false,
  max_hours_per_day double precision,
  billable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Migrate rows from timekeeping.labor_charge_codes preserving source IDs.
-- contract_reference is handled conditionally because it was added in a later
-- standalone module migration (0004_dcaa_charge_code_discipline) and may not exist.
DO $$
DECLARE
  has_contract_reference boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'timekeeping'
      AND table_name = 'labor_charge_codes'
      AND column_name = 'contract_reference'
  ) INTO has_contract_reference;

  IF has_contract_reference THEN
    INSERT INTO public.charge_codes (
      id, code, description, type, contract_reference, department,
      requires_approval, max_hours_per_day, billable, active, created_at, updated_at
    )
    OVERRIDING SYSTEM VALUE
    SELECT
      id, code, description, UPPER(COALESCE(type, 'DIRECT')), contract_reference, department,
      requires_approval, max_hours_per_day, billable, active, created_at, updated_at
    FROM timekeeping.labor_charge_codes
    ON CONFLICT (code) DO NOTHING;
  ELSE
    INSERT INTO public.charge_codes (
      id, code, description, type, department,
      requires_approval, max_hours_per_day, billable, active, created_at, updated_at
    )
    OVERRIDING SYSTEM VALUE
    SELECT
      id, code, description, UPPER(COALESCE(type, 'DIRECT')), department,
      requires_approval, max_hours_per_day, billable, active, created_at, updated_at
    FROM timekeeping.labor_charge_codes
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- Reset the sequence so new inserts get IDs above the migrated max
SELECT setval(
  'public.charge_codes_id_seq',
  COALESCE((SELECT MAX(id) FROM public.charge_codes), 0) + 1,
  false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_projects_charge_code'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT fk_projects_charge_code
      FOREIGN KEY (default_charge_code_id) REFERENCES public.charge_codes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_production_work_orders_charge_code'
      AND table_name = 'production_work_orders'
  ) THEN
    ALTER TABLE public.production_work_orders
      ADD CONSTRAINT fk_production_work_orders_charge_code
      FOREIGN KEY (default_charge_code_id) REFERENCES public.charge_codes(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_travelers_charge_code'
      AND table_name = 'travelers'
  ) THEN
    ALTER TABLE public.travelers
      ADD CONSTRAINT fk_travelers_charge_code
      FOREIGN KEY (default_charge_code_id) REFERENCES public.charge_codes(id) ON DELETE SET NULL;
  END IF;
END $$;
