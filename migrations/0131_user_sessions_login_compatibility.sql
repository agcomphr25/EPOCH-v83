-- Ensure deployed databases have the session columns used by login and
-- authenticated route middleware.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS security_policy_version text DEFAULT 'cmmc-itar-v1',
  ADD COLUMN IF NOT EXISTS last_credential_verified_at timestamptz;
