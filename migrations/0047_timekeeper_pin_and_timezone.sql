-- Migration: Add timekeeperPin and timezone columns to public.employees
-- These columns make public.employees the canonical source of PIN and timezone
-- for the standalone Timekeeping module (Phase 1 identity consolidation).
--
-- timekeeperPin: bcrypt-hashed PIN used by the kiosk punch clock.
--   Nullable so existing rows are unaffected; backfill runs separately.
-- timezone: IANA timezone for accurate punch-time calculations.
--   NOT NULL with default 'UTC'; backfilled from timekeeping.employees where linked.

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "timekeeper_pin" text,
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';

-- Backfill from timekeeping.employees only if that table exists (standalone module installed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'timekeeping' AND table_name = 'employees'
  ) THEN
    UPDATE "employees" AS pub
    SET timekeeper_pin = tk.pin
    FROM timekeeping.employees AS tk
    WHERE tk.epoch_employee_id = pub.id
      AND pub.timekeeper_pin IS NULL
      AND tk.pin IS NOT NULL;

    UPDATE "employees" AS pub
    SET timezone = tk.timezone
    FROM timekeeping.employees AS tk
    WHERE tk.epoch_employee_id = pub.id
      AND pub.timezone = 'UTC'
      AND tk.timezone IS NOT NULL
      AND tk.timezone <> 'UTC';
  END IF;
END;
$$;
