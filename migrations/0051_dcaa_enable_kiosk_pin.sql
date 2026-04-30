-- DCAA remediation: PIN is mandatory on the kiosk per FAR 52.215-2(d).
-- Ensure the settings row exists and has kiosk_require_pin = true.
-- This migration is idempotent: safe to re-run on every boot.

INSERT INTO timekeeping.settings (kiosk_require_pin)
VALUES (true)
ON CONFLICT DO NOTHING;

UPDATE timekeeping.settings SET kiosk_require_pin = true;
