-- Add approval fields to project_closings table
-- Enables the manager-approval gate before a project can be marked as COMPLETED.

ALTER TABLE project_closings
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
