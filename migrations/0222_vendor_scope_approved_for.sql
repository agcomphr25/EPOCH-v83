-- Add scope_approved_for column to vendors table
-- This column was referenced in storage queries but never formally migrated.
-- IF NOT EXISTS makes this a no-op on production if the column already exists.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS scope_approved_for TEXT;
