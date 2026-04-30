-- Add project_id column to quotes table to track the linked project after acceptance
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
