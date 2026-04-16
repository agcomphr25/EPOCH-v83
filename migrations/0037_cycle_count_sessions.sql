-- Cycle Count Sessions — AS9100 Physical Inventory Verification Workflow
CREATE TABLE IF NOT EXISTS cycle_count_sessions (
  id SERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  part_filter TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  posted_at TIMESTAMP,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cycle_count_lines (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES cycle_count_sessions(id) ON DELETE CASCADE,
  ag_part_number TEXT NOT NULL,
  material_name TEXT,
  expected_qty NUMERIC NOT NULL,
  counted_qty NUMERIC,
  variance_qty NUMERIC,
  notes TEXT
);
