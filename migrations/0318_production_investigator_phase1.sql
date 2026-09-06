CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS production_investigator_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  username text NOT NULL,
  title text NOT NULL DEFAULT 'New production investigation',
  retention_until timestamp NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_investigator_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES production_investigator_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  payload jsonb,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_investigator_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES production_investigator_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES production_investigator_messages(id) ON DELETE CASCADE,
  trace_id uuid NOT NULL,
  sequence integer NOT NULL,
  tool_name text NOT NULL,
  sanitized_arguments jsonb NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL,
  result_summary text,
  duration_ms integer,
  error_code text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_investigator_conversations_username_updated_idx
  ON production_investigator_conversations (username, updated_at);

CREATE INDEX IF NOT EXISTS production_investigator_messages_conversation_created_idx
  ON production_investigator_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS production_investigator_activity_conversation_sequence_idx
  ON production_investigator_activity (conversation_id, sequence);

CREATE INDEX IF NOT EXISTS production_investigator_activity_trace_idx
  ON production_investigator_activity (trace_id);
