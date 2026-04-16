-- Add certification_id to routing_operations so each operation can reference
-- the specific certification required, enabling real training coverage checks.
ALTER TABLE routing_operations
  ADD COLUMN IF NOT EXISTS certification_id INTEGER REFERENCES certifications(id);
