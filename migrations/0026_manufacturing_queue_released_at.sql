-- Add released_at column to manufacturing_queue for the RELEASED status gate
ALTER TABLE manufacturing_queue ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;
