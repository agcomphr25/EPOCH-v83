-- Migration: Seed timekeeping.labor_charge_codes from timekeeping.cost_codes.
--
-- The labor_charge_codes table was created in 0052_dcaa_missing_tables.sql with
-- no data.  Because TK-008 flags every punch whose cost_code is not found in
-- labor_charge_codes, an empty registry causes every existing punch that carries
-- a cost_code to appear as a high-severity DCAA violation in EDRI.
--
-- This migration promotes all rows from cost_codes into labor_charge_codes with
-- safe defaults for the DCAA-required extra columns.  ON CONFLICT DO NOTHING
-- makes it fully idempotent — re-running this migration is safe.

INSERT INTO timekeeping.labor_charge_codes (code, description, type, active)
SELECT
  cc.code,
  cc.description,
  'direct'   AS type,
  cc.active
FROM timekeeping.cost_codes cc
ON CONFLICT (code) DO NOTHING;
