CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS epoch_copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  username text NOT NULL,
  title text NOT NULL DEFAULT 'New Copilot conversation',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epoch_copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES epoch_copilot_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  payload jsonb,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epoch_copilot_draft_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  prompt text,
  guide jsonb NOT NULL,
  created_by_user_id text,
  created_by_username text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epoch_copilot_conversations_username_updated
  ON epoch_copilot_conversations (username, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_epoch_copilot_messages_conversation_created
  ON epoch_copilot_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_epoch_copilot_draft_guides_creator_created
  ON epoch_copilot_draft_guides (created_by_username, created_at DESC);
