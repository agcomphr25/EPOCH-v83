-- Migration: 0081_proteus_labs.sql
-- Purpose: Create Proteus Labs Prompt Library tables (fully additive — no existing tables modified)
-- Tables: proteus_prompts, proteus_prompt_variables, proteus_prompt_executions, proteus_prompt_results, proteus_prompt_tags
-- Identity Standard: createdByUserId (integer FK) + createdByName (text snapshot) on prompts/executions

-- Enum types
DO $$ BEGIN
  CREATE TYPE proteus_prompt_category AS ENUM (
    'small', 'feature', 'large_architecture', 'audit', 'emergency', 'deployment', 'skill_builder'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE proteus_execution_status AS ENUM (
    'pending', 'success', 'failure', 'noted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Core prompt library
CREATE TABLE IF NOT EXISTS proteus_prompts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  category      proteus_prompt_category NOT NULL,
  body          TEXT NOT NULL,
  description   TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMP,
  created_by_user_id      INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Variable definitions per prompt
CREATE TABLE IF NOT EXISTS proteus_prompt_variables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id     UUID NOT NULL REFERENCES proteus_prompts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  label         TEXT NOT NULL,
  default_value TEXT,
  required      BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0
);

-- Execution history: every time a prompt is filled and copied/run
CREATE TABLE IF NOT EXISTS proteus_prompt_executions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id        UUID NOT NULL REFERENCES proteus_prompts(id),
  prompt_title     TEXT NOT NULL,
  resolved_body    TEXT NOT NULL,
  variable_values  JSONB,
  executed_by_user_id     INTEGER NOT NULL,
  executed_by_display_name TEXT NOT NULL,
  executed_at      TIMESTAMP DEFAULT NOW(),
  status           proteus_execution_status DEFAULT 'pending',
  notes            TEXT
);

-- Stored LLM/Replit output for a specific execution (1:1 with execution)
CREATE TABLE IF NOT EXISTS proteus_prompt_results (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id         UUID NOT NULL UNIQUE REFERENCES proteus_prompt_executions(id) ON DELETE CASCADE,
  output               TEXT NOT NULL,
  implementation_notes TEXT,
  created_at           TIMESTAMP DEFAULT NOW()
);

-- Free-form tags per prompt
CREATE TABLE IF NOT EXISTS proteus_prompt_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id  UUID NOT NULL REFERENCES proteus_prompts(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_proteus_prompts_category ON proteus_prompts(category);
CREATE INDEX IF NOT EXISTS idx_proteus_prompts_usage ON proteus_prompts(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_proteus_prompts_created ON proteus_prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proteus_variables_prompt ON proteus_prompt_variables(prompt_id);
CREATE INDEX IF NOT EXISTS idx_proteus_executions_prompt ON proteus_prompt_executions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_proteus_executions_status ON proteus_prompt_executions(status);
CREATE INDEX IF NOT EXISTS idx_proteus_executions_at ON proteus_prompt_executions(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_proteus_results_execution ON proteus_prompt_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_proteus_tags_prompt ON proteus_prompt_tags(prompt_id);
