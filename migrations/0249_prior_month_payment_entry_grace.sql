-- Controlled grace window for routine prior-month customer payments entered
-- during the first few business days of the following month.

ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS payment_entry_grace_business_days integer NOT NULL DEFAULT 3;

ALTER TABLE accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_payment_grace_days_chk;

ALTER TABLE accounting_periods
  ADD CONSTRAINT accounting_periods_payment_grace_days_chk
  CHECK (payment_entry_grace_business_days BETWEEN 0 AND 10);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS late_entry_reason text;

COMMENT ON COLUMN accounting_periods.payment_entry_grace_business_days IS
  'Number of business days in the following month during which documented immediately-prior-month customer payments may post.';
COMMENT ON COLUMN payments.reference_number IS
  'Bank, deposit, processor, check, or other external payment reference.';
COMMENT ON COLUMN payments.late_entry_reason IS
  'Explanation required when a prior-month payment uses the controlled entry grace window.';
