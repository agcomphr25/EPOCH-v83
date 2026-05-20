-- Section 9 Quality System controls: NCR lifecycle, CAPA, and calibration lockout.

ALTER TABLE nonconformance_records
  ADD COLUMN IF NOT EXISTS containment_action text,
  ADD COLUMN IF NOT EXISTS containment_owner text,
  ADD COLUMN IF NOT EXISTS containment_due_date date,
  ADD COLUMN IF NOT EXISTS containment_completed_at timestamp,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS root_cause_method text,
  ADD COLUMN IF NOT EXISTS corrective_action text,
  ADD COLUMN IF NOT EXISTS preventive_action text,
  ADD COLUMN IF NOT EXISTS capa_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS capa_id uuid,
  ADD COLUMN IF NOT EXISTS disposition_rationale text,
  ADD COLUMN IF NOT EXISTS disposition_approved_by_user_id integer,
  ADD COLUMN IF NOT EXISTS disposition_approved_by_display_name text,
  ADD COLUMN IF NOT EXISTS disposition_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS effectiveness_review text,
  ADD COLUMN IF NOT EXISTS effectiveness_status text DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS effectiveness_reviewed_by_user_id integer,
  ADD COLUMN IF NOT EXISTS effectiveness_reviewed_by_display_name text,
  ADD COLUMN IF NOT EXISTS effectiveness_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS recurrence_detected boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS capa_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_number text NOT NULL UNIQUE,
  source_type text NOT NULL DEFAULT 'NCR',
  source_id text,
  nonconformance_id integer REFERENCES nonconformance_records(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS capa_records_source_idx ON capa_records(source_type, source_id);
CREATE INDEX IF NOT EXISTS capa_records_ncr_idx ON capa_records(nonconformance_id);
CREATE INDEX IF NOT EXISTS capa_records_status_idx ON capa_records(status);
CREATE INDEX IF NOT EXISTS capa_records_effectiveness_idx ON capa_records(effectiveness_status);

CREATE TABLE IF NOT EXISTS calibration_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag text NOT NULL UNIQUE,
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'gage',
  serial_number text,
  location text,
  owner_department text,
  status text NOT NULL DEFAULT 'active',
  calibration_interval_days integer NOT NULL DEFAULT 365,
  last_calibration_date date,
  calibration_due_date date,
  evidence_url text,
  lockout_reason text,
  locked_out_at timestamp,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_assets_asset_tag_idx ON calibration_assets(asset_tag);
CREATE INDEX IF NOT EXISTS calibration_assets_status_idx ON calibration_assets(status);
CREATE INDEX IF NOT EXISTS calibration_assets_due_date_idx ON calibration_assets(calibration_due_date);

CREATE TABLE IF NOT EXISTS calibration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES calibration_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'calibration',
  event_date date NOT NULL,
  result text NOT NULL DEFAULT 'pass',
  performed_by text,
  vendor_name text,
  certificate_number text,
  evidence_url text,
  next_due_date date,
  notes text,
  created_by_user_id integer,
  created_by_display_name text,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_events_asset_idx ON calibration_events(asset_id);
CREATE INDEX IF NOT EXISTS calibration_events_date_idx ON calibration_events(event_date);

CREATE TABLE IF NOT EXISTS calibration_use_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES calibration_assets(id) ON DELETE SET NULL,
  asset_tag text NOT NULL,
  traveler_id varchar(255),
  traveler_step_id varchar(255),
  routing_operation_id integer,
  order_id text,
  used_by_user_id integer,
  used_by_display_name text,
  use_status text NOT NULL DEFAULT 'accepted',
  gate_message text,
  used_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_use_logs_asset_tag_idx ON calibration_use_logs(asset_tag);
CREATE INDEX IF NOT EXISTS calibration_use_logs_traveler_idx ON calibration_use_logs(traveler_id);
CREATE INDEX IF NOT EXISTS calibration_use_logs_status_idx ON calibration_use_logs(use_status);

ALTER TABLE routing_operations
  ADD COLUMN IF NOT EXISTS required_calibration_asset_tags text[] NOT NULL DEFAULT ARRAY[]::text[];

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('quality.manage_capa', 'Create and close CAPA records and effectiveness reviews', 'quality'),
  ('quality.manage_calibration', 'Manage calibration assets, evidence, and lockout state', 'quality')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE pr.name IN ('ADMIN', 'OWNER', 'MANAGER')
  AND pc.key IN ('quality.manage_capa', 'quality.manage_calibration')
ON CONFLICT (role_id, capability_id) DO NOTHING;
