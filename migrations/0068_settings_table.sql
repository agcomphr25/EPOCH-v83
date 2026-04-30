-- Migration: Create the settings table used by the EDRI scoring engine
-- The EDRI timekeeping scorer reads kiosk_require_pin from this table during
-- startup. Without it, safeQuery throws "relation settings does not exist".
-- This migration is idempotent — safe to run on databases that already have
-- the table or any of its columns.

CREATE TABLE IF NOT EXISTS settings (
  id                 serial PRIMARY KEY,
  kiosk_require_pin  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed a single default row if the table is empty so queries always return a row.
INSERT INTO settings (kiosk_require_pin)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM settings);
