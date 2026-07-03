CREATE TABLE IF NOT EXISTS non_conforming_items (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  p1_or_p2 TEXT NOT NULL,
  customer TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  issue_cause TEXT NOT NULL,
  manufacturer_defect BOOLEAN NOT NULL DEFAULT FALSE,
  disposition TEXT NOT NULL,
  "authorization" TEXT NOT NULL,
  serial_tag_number TEXT,
  disposition_date DATE,
  corrective_action_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS non_conforming_items_date_idx
  ON non_conforming_items (date DESC);

CREATE INDEX IF NOT EXISTS non_conforming_items_p1_or_p2_idx
  ON non_conforming_items (p1_or_p2);
