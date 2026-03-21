#!/bin/bash
set -e
npm install

# Create any new tables directly via SQL instead of using db:push (which is interactive)
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS quick_notes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'text',
  tags TEXT[],
  created_by_user_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quick_note_shares (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES quick_notes(id) ON DELETE CASCADE,
  shared_with_user_id INTEGER NOT NULL,
  shared_with_display_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
SQL

echo "Post-merge setup complete."
