-- Schema Governance: schema_change_log audit table
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS schema_change_log (
  id          SERIAL PRIMARY KEY,
  timestamp   TIMESTAMP NOT NULL DEFAULT NOW(),
  actor       TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'ADD_COLUMN',
    'DROP_COLUMN',
    'DROP_TABLE',
    'ALTER_COLUMN',
    'CREATE_TABLE',
    'RAW_SQL',
    'OVERRIDE',
    'BOOT_MIGRATION',
    'PRE_DEPLOY_MIGRATION'
  )),
  table_name  TEXT NOT NULL,
  column_name TEXT,
  before_state JSONB,
  after_state  JSONB,
  approved_by  TEXT,
  override_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_schema_change_log_timestamp ON schema_change_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_schema_change_log_table ON schema_change_log (table_name);

-- Idempotently expand the CHECK constraint if it exists with old values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'schema_change_log'
      AND constraint_type = 'CHECK'
  ) THEN
    -- Drop and recreate the CHECK constraint to allow the full action_type set
    ALTER TABLE schema_change_log
      DROP CONSTRAINT IF EXISTS schema_change_log_action_type_check;
    ALTER TABLE schema_change_log
      ADD CONSTRAINT schema_change_log_action_type_check
      CHECK (action_type IN (
        'ADD_COLUMN',
        'DROP_COLUMN',
        'DROP_TABLE',
        'ALTER_COLUMN',
        'CREATE_TABLE',
        'RAW_SQL',
        'OVERRIDE',
        'BOOT_MIGRATION',
        'PRE_DEPLOY_MIGRATION'
      ));
  END IF;
END $$;
