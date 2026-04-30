CREATE TABLE IF NOT EXISTS dcaa_scheduler_state (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  ran_at       TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'scheduled',
  summary      JSONB NOT NULL DEFAULT '{}'
);
