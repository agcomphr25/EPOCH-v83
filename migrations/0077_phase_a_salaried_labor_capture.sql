-- Migration 0077: Phase A Salaried Labor Capture hardening
-- Idempotent: safe to run on a fresh or existing database.

-- (a) Add AI/narrative columns to salaried_timesheet_lines (if not already present)
ALTER TABLE timekeeping.salaried_timesheet_lines
  ADD COLUMN IF NOT EXISTS original_narrative  TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score    NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS ai_source           BOOLEAN NOT NULL DEFAULT FALSE;

-- (b) Re-type traveler_id to TEXT if it is not already TEXT
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type
    INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'timekeeping'
     AND table_name   = 'salaried_timesheet_lines'
     AND column_name  = 'traveler_id';

  IF col_type IS NOT NULL AND col_type <> 'text' THEN
    EXECUTE 'ALTER TABLE timekeeping.salaried_timesheet_lines ALTER COLUMN traveler_id TYPE TEXT';
  END IF;
END;
$$;

-- (c) Insert MEETINGS, VENDOR_MGMT, CUSTOMER_SVC charge codes (idempotent)
INSERT INTO charge_codes (code, description, type, billable, requires_approval, active) VALUES
  ('IND-MEETINGS',     'Meetings — Overhead Pool',      'OVERHEAD', false, false, true),
  ('IND-VENDOR_MGMT',  'Vendor Management — G&A Pool',  'G_AND_A',  false, false, true),
  ('IND-CUSTOMER_SVC', 'Customer Service — G&A Pool',   'G_AND_A',  false, false, true)
ON CONFLICT (code) DO NOTHING;

-- Insert MEETINGS, VENDOR_MGMT, CUSTOMER_SVC indirect codes (idempotent)
INSERT INTO timekeeping.indirect_codes (code, label, sort_order, charge_code_id)
SELECT
  ic.code,
  ic.label,
  ic.sort_order,
  (SELECT cc.id FROM charge_codes cc WHERE cc.code = ic.cc_code)
FROM (VALUES
  ('MEETINGS',     'Meetings',          120, 'IND-MEETINGS'),
  ('VENDOR_MGMT',  'Vendor Management', 130, 'IND-VENDOR_MGMT'),
  ('CUSTOMER_SVC', 'Customer Service',  140, 'IND-CUSTOMER_SVC')
) AS ic(code, label, sort_order, cc_code)
ON CONFLICT (code) DO NOTHING;

-- (d) Update PROPOSAL label to 'Quoting & Proposals' (guard ensures idempotency)
UPDATE timekeeping.indirect_codes
   SET label = 'Quoting & Proposals'
 WHERE code  = 'PROPOSAL'
   AND label = 'Proposal/Estimating Support';
