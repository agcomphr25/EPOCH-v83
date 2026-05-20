CREATE TABLE IF NOT EXISTS p1_fulfillment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS',
  current_step text NOT NULL DEFAULT 'READINESS',
  failed_step text,
  failure_code text,
  failure_message text,
  remediation_hint text,
  source text NOT NULL DEFAULT 'shipping',
  source_route text,
  tracking_number text,
  shipment_record_id uuid,
  journal_entry_id integer REFERENCES journal_entries(id),
  notification_status text DEFAULT 'NOT_ATTEMPTED',
  actor_user_id integer,
  actor_display_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS p1_fulfillment_attempts_order_id_idx
  ON p1_fulfillment_attempts(order_id);

CREATE INDEX IF NOT EXISTS p1_fulfillment_attempts_status_idx
  ON p1_fulfillment_attempts(status);

CREATE INDEX IF NOT EXISTS p1_fulfillment_attempts_failed_step_idx
  ON p1_fulfillment_attempts(failed_step);

CREATE INDEX IF NOT EXISTS p1_fulfillment_attempts_updated_at_idx
  ON p1_fulfillment_attempts(updated_at);
