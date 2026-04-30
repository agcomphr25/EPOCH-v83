CREATE TABLE IF NOT EXISTS cutting_documents (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
