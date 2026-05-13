-- Voice notes persistence tables.
-- Safe to run repeatedly; matches the Drizzle schema used by server/src/routes/voiceNotes.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription TEXT NOT NULL,
  linked_order_id TEXT,
  note_type TEXT NOT NULL DEFAULT 'order',
  category TEXT,
  tags TEXT[],
  recorded_by_id INTEGER REFERENCES employees(id),
  recorded_by_username TEXT NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW(),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by_id INTEGER REFERENCES employees(id),
  resolved_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_notes_linked_order_id_idx
  ON voice_notes(linked_order_id);

CREATE INDEX IF NOT EXISTS voice_notes_note_type_idx
  ON voice_notes(note_type);

CREATE INDEX IF NOT EXISTS voice_notes_recorded_by_id_idx
  ON voice_notes(recorded_by_id);

CREATE INDEX IF NOT EXISTS voice_notes_recorded_at_idx
  ON voice_notes(recorded_at);

CREATE INDEX IF NOT EXISTS voice_notes_category_idx
  ON voice_notes(category);

CREATE INDEX IF NOT EXISTS voice_notes_is_resolved_idx
  ON voice_notes(is_resolved);

CREATE TABLE IF NOT EXISTS voice_note_questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options JSONB,
  is_required BOOLEAN DEFAULT FALSE,
  category TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_note_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_note_id UUID NOT NULL REFERENCES voice_notes(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES voice_note_questions(id),
  response_value TEXT,
  employee_id INTEGER REFERENCES employees(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_note_responses_voice_note_id_idx
  ON voice_note_responses(voice_note_id);

CREATE INDEX IF NOT EXISTS voice_note_responses_question_id_idx
  ON voice_note_responses(question_id);
