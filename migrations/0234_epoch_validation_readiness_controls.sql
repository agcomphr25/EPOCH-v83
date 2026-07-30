-- Migration 0234: additive readiness controls for existing EPOCH validation packages.
-- Existing values, package numbers, owners, evidence, approvals, and statuses are preserved.
ALTER TABLE qms_epoch_validation_packages
  ADD COLUMN IF NOT EXISTS deployment_date_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deployment_date_confirmed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS deployment_date_confirmed_by_display_name text,
  ADD COLUMN IF NOT EXISTS deployment_date_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS environment_separation_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment_separation_confirmed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS environment_separation_confirmed_by_display_name text,
  ADD COLUMN IF NOT EXISTS environment_separation_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS environment_differences text,
  ADD COLUMN IF NOT EXISTS audit_readiness_not_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_readiness_na_justification text,
  ADD COLUMN IF NOT EXISTS audit_readiness_na_approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS audit_readiness_na_approved_by_display_name text,
  ADD COLUMN IF NOT EXISTS audit_readiness_na_approved_at timestamptz;

CREATE INDEX IF NOT EXISTS qms_esv_audit_readiness_link_idx
  ON qms_epoch_validation_packages(audit_readiness_assessment_id)
  WHERE audit_readiness_assessment_id IS NOT NULL;

COMMENT ON COLUMN qms_epoch_validation_packages.deployment_date_confirmed IS
  'Authenticated confirmation that production_deployment_date belongs to the exact identified production build.';
COMMENT ON COLUMN qms_epoch_validation_packages.environment_separation_confirmed IS
  'Authenticated confirmation that validation uses controlled non-production data and does not intentionally modify production QMS records.';
COMMENT ON COLUMN qms_epoch_validation_packages.audit_readiness_not_applicable IS
  'Quality-approved determination used only when no applicable Audit Readiness assessment exists.';
