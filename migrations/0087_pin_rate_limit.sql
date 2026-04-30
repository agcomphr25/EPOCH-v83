-- Migration 0087: Persist kiosk PIN rate-limit state across server restarts.
-- An in-memory Map is wiped on every restart, allowing an attacker to bypass
-- a lockout simply by triggering a redeploy. This table gives the rate-limiter
-- durable backing so a locked-out IP stays locked out for its full window.

CREATE TABLE IF NOT EXISTS kiosk_pin_rate_limits (
  ip           TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ
);

-- Index for efficient cleanup queries that sweep expired rows.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'kiosk_pin_rate_limits'
      AND indexname  = 'kiosk_pin_rate_limits_locked_until_idx'
  ) THEN
    CREATE INDEX kiosk_pin_rate_limits_locked_until_idx
      ON kiosk_pin_rate_limits (locked_until)
      WHERE locked_until IS NOT NULL;
  END IF;
END $$;
