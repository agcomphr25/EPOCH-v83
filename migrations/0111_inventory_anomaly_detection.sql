-- Task #146 — Inventory Anomaly Detection (Phase 3)

CREATE TABLE IF NOT EXISTS inventory_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detector_key text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  detected_at timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz,
  window_end timestamptz,
  dedup_key text NOT NULL,
  summary text NOT NULL,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ledger_entry_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ag_part_number text,
  lot_id uuid,
  performed_by_user_id integer,
  performed_by_display_name text,
  approved_by_user_id integer,
  approved_by_display_name text,
  assigned_to_user_id integer REFERENCES users(id),
  assigned_to_display_name text,
  acknowledged_at timestamptz,
  acknowledged_by_user_id integer REFERENCES users(id),
  acknowledged_by_display_name text,
  acknowledgment_note text,
  dismissed_at timestamptz,
  dismissed_by_user_id integer REFERENCES users(id),
  dismissed_by_display_name text,
  dismissal_reason text,
  escalated_at timestamptz,
  escalated_by_user_id integer REFERENCES users(id),
  escalated_by_display_name text,
  escalation_note text,
  resolved_at timestamptz,
  resolution_notes text,
  notification_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_anomalies_severity_chk
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT inventory_anomalies_status_chk
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ESCALATED'))
);

CREATE INDEX IF NOT EXISTS inventory_anomalies_detector_key_idx ON inventory_anomalies(detector_key);
CREATE INDEX IF NOT EXISTS inventory_anomalies_status_idx ON inventory_anomalies(status);
CREATE INDEX IF NOT EXISTS inventory_anomalies_severity_idx ON inventory_anomalies(severity);
CREATE INDEX IF NOT EXISTS inventory_anomalies_detected_at_idx ON inventory_anomalies(detected_at);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_anomalies_dedup_open_uniq
  ON inventory_anomalies(detector_key, dedup_key) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS anomaly_detector_config (
  id serial PRIMARY KEY,
  detector_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_recipient_user_ids integer[] NOT NULL DEFAULT ARRAY[]::int[],
  notify_on_high boolean NOT NULL DEFAULT true,
  updated_by_user_id integer,
  updated_by_display_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
