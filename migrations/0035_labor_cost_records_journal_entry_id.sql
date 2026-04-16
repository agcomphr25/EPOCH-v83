-- Add journal_entry_id back-link to labor_cost_records
ALTER TABLE labor_cost_records ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);
