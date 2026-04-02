-- Migration 0022: Routing dependency enhancements
-- Adds routing_operation_id, must_be_issued, must_be_scanned_to_parent to routing_dependencies

ALTER TABLE routing_dependencies
  ADD COLUMN IF NOT EXISTS routing_operation_id INTEGER,
  ADD COLUMN IF NOT EXISTS must_be_issued BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS must_be_scanned_to_parent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS routing_dependencies_routing_operation_id_idx
  ON routing_dependencies (routing_operation_id);
