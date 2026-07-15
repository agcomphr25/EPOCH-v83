-- Add check constraints to punch_ledger for source and labor_class columns.
-- Enforces DB-level enum domains matching live punch flow values.
-- NOT VALID skips validation of existing rows (legacy data may have other values)
-- and only enforces the constraint on new inserts/updates going forward.
ALTER TABLE public.punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_source_check,
  DROP CONSTRAINT IF EXISTS punch_ledger_labor_class_check;

ALTER TABLE public.punch_ledger
  ADD CONSTRAINT punch_ledger_source_check
    CHECK (source IN ('KIOSK', 'PORTAL', 'TRAVELER', 'SALARIED_ENTRY')) NOT VALID,
  ADD CONSTRAINT punch_ledger_labor_class_check
    CHECK (labor_class IN ('REGULAR', 'OVERTIME', 'DOUBLE_TIME', 'BREAK')) NOT VALID;
