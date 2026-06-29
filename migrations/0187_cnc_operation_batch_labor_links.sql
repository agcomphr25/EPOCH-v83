ALTER TABLE time_clock_entries
  ADD COLUMN IF NOT EXISTS traveler_step_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS operation_batch_id INTEGER,
  ADD COLUMN IF NOT EXISTS machine_id INTEGER,
  ADD COLUMN IF NOT EXISTS machine_name TEXT;

CREATE INDEX IF NOT EXISTS time_clock_entries_operation_batch_id_idx
  ON time_clock_entries (operation_batch_id);

CREATE INDEX IF NOT EXISTS time_clock_entries_traveler_step_id_idx
  ON time_clock_entries (traveler_step_id);
