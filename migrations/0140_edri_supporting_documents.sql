CREATE TABLE IF NOT EXISTS edri_supporting_documents (
  id SERIAL PRIMARY KEY,
  folder_label TEXT NOT NULL DEFAULT 'Supporting Docs',
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  notes TEXT,
  uploaded_by_user_id INTEGER REFERENCES users(id),
  uploaded_by_display_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS edri_supporting_documents_folder_uploaded_idx
  ON edri_supporting_documents(folder_label, uploaded_at DESC);
