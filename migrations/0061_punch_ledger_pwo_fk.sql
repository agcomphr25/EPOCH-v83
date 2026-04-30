-- Migration 0061: Add FK from punch_ledger.production_work_order_id → production_work_orders.id
-- The table was created in 0060 without this constraint; added here as a safe ALTER.
-- Idempotent: skips if constraint already exists.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_punch_ledger_pwo'
  ) THEN
    ALTER TABLE public.punch_ledger
      ADD CONSTRAINT fk_punch_ledger_pwo
      FOREIGN KEY (production_work_order_id)
      REFERENCES public.production_work_orders (id)
      ON DELETE SET NULL;
  END IF;
END $$;
