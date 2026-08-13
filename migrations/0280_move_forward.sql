CREATE TABLE IF NOT EXISTS move_forward_captures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  original_text TEXT NOT NULL,
  input_method TEXT NOT NULL DEFAULT 'typed',
  status TEXT NOT NULL DEFAULT 'draft',
  analysis_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS move_forward_captures_user_status_idx
  ON move_forward_captures (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS move_forward_items (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES move_forward_captures(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  due_date DATE,
  amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed',
  suggested_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  rundown_item_id INTEGER REFERENCES executive_rundown_items(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS move_forward_items_user_status_due_idx
  ON move_forward_items (user_id, status, due_date);
CREATE INDEX IF NOT EXISTS move_forward_items_capture_idx
  ON move_forward_items (capture_id);

CREATE TABLE IF NOT EXISTS move_forward_clarifications (
  id SERIAL PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES move_forward_captures(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  answer TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS move_forward_clarifications_capture_idx
  ON move_forward_clarifications (capture_id, status, sort_order);

CREATE TABLE IF NOT EXISTS move_forward_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  trigger_text TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  correction_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS move_forward_rules_user_status_idx
  ON move_forward_rules (user_id, status);
