-- Migration 0093: Timekeeping policy settings table
--
-- Creates timekeeping.policy_settings to replace hardcoded compliance rules
-- in service files. A single company-wide row is seeded with defaults that
-- match the previous hardcoded behavior so existing deployments see no change.
--
-- Rules centralized:
--   certification_required         — employee attestation gate on submit
--   correction_approval_required   — multi-step correction approval workflow
--   minimum_hours_per_week         — optional minimum hours threshold (nullable)
--   late_submission_grace_days     — optional grace window before late warning/block (nullable)
--   late_submission_block          — block (vs warn) when past the grace window
--   certification_statement        — exact text stored on the timesheet at attestation
--   certification_version          — version integer recorded alongside the statement

CREATE TABLE IF NOT EXISTS timekeeping.policy_settings (
  id                           serial PRIMARY KEY,
  certification_required       boolean NOT NULL DEFAULT true,
  correction_approval_required boolean NOT NULL DEFAULT true,
  minimum_hours_per_week       double precision,
  late_submission_grace_days   integer,
  late_submission_block        boolean NOT NULL DEFAULT false,
  certification_statement      text NOT NULL DEFAULT 'I certify that the time recorded for this period is complete, accurate, and represents work I actually performed.',
  certification_version        integer NOT NULL DEFAULT 1,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

-- Seed a single default row that mirrors the old hardcoded behavior.
-- Only insert when the table is empty so re-runs are idempotent.
INSERT INTO timekeeping.policy_settings (
  certification_required,
  correction_approval_required,
  minimum_hours_per_week,
  late_submission_grace_days,
  late_submission_block,
  certification_statement,
  certification_version
)
SELECT
  true,
  true,
  NULL,
  NULL,
  false,
  'I certify that the time recorded for this period is complete, accurate, and represents work I actually performed.',
  1
WHERE NOT EXISTS (SELECT 1 FROM timekeeping.policy_settings);
