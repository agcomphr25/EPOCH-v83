CREATE TABLE IF NOT EXISTS rfq_risk_sessions (
  id text PRIMARY KEY,
  rfq_id text NOT NULL,
  customer_id text NOT NULL,
  customer_name text,
  status text NOT NULL DEFAULT 'draft',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_summary jsonb,
  conversation_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_id integer,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_risk_sessions_customer_idx
  ON rfq_risk_sessions(customer_id);

CREATE INDEX IF NOT EXISTS rfq_risk_sessions_status_idx
  ON rfq_risk_sessions(status);

CREATE INDEX IF NOT EXISTS rfq_risk_sessions_updated_idx
  ON rfq_risk_sessions(updated_at DESC);
