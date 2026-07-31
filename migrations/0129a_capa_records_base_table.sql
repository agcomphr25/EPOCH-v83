-- Additive production repair for deployments that received the quality-action
-- change-control routes without the capa_records base table.
-- (0129_quality_section9_ncr_capa_calibration.sql is skipped on Neon production
-- because its first statement alters nonconformance_records, which does not exist
-- there.  This file creates the tables 0235_quality_action_change_control.sql
-- depends on, using IF NOT EXISTS so it is safe to re-run.)
--
-- This must run before 0235_quality_action_change_control.sql.

CREATE TABLE IF NOT EXISTS capa_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_number text NOT NULL UNIQUE,
  source_type text NOT NULL DEFAULT 'NCR',
  source_id text,
  -- nonconformance_id omits the REFERENCES constraint intentionally: the
  -- nonconformance_records table may not exist in all deployment environments.
  nonconformance_id integer,
  title text NOT NULL,
  problem_statement text NOT NULL,
  containment_action text,
  root_cause text,
  corrective_action text,
  preventive_action text,
  recurrence_check_plan text,
  recurrence_detected boolean NOT NULL DEFAULT false,
  effectiveness_criteria text,
  effectiveness_review text,
  effectiveness_status text NOT NULL DEFAULT 'not_started',
  status text NOT NULL DEFAULT 'open',
  owner_user_id integer,
  owner_display_name text,
  due_date date,
  closed_by_user_id integer,
  closed_by_display_name text,
  closed_at timestamp,
  evidence_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by_user_id integer,
  created_by_display_name text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS capa_number text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'NCR';
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS nonconformance_id integer;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS problem_statement text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS containment_action text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS root_cause text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS corrective_action text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS preventive_action text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS recurrence_check_plan text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS recurrence_detected boolean DEFAULT false;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS effectiveness_criteria text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS effectiveness_review text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS effectiveness_status text DEFAULT 'not_started';
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS owner_user_id integer;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS owner_display_name text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS closed_by_user_id integer;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS closed_by_display_name text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS closed_at timestamp;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS evidence_urls text[] DEFAULT ARRAY[]::text[];
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS created_by_user_id integer;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS created_by_display_name text;
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT NOW();
ALTER TABLE capa_records ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW();

CREATE INDEX IF NOT EXISTS capa_records_source_idx ON capa_records(source_type, source_id);
CREATE INDEX IF NOT EXISTS capa_records_ncr_idx ON capa_records(nonconformance_id);
CREATE INDEX IF NOT EXISTS capa_records_status_idx ON capa_records(status);
CREATE INDEX IF NOT EXISTS capa_records_effectiveness_idx ON capa_records(effectiveness_status);
