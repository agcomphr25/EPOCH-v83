-- Migration: 0083_proteus_executions_cascade.sql
-- Purpose: Add ON DELETE CASCADE to proteus_prompt_executions.prompt_id FK
-- This prevents 500 errors when deleting a prompt that has execution history.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'proteus_prompt_executions'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'proteus_prompt_executions'::regclass
         AND attname = 'prompt_id')
    ]::smallint[];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE proteus_prompt_executions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE proteus_prompt_executions
  ADD CONSTRAINT proteus_prompt_executions_prompt_id_fkey
  FOREIGN KEY (prompt_id)
  REFERENCES proteus_prompts(id)
  ON DELETE CASCADE;
