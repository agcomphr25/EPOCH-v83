CREATE TABLE IF NOT EXISTS product_teardowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  model_number TEXT,
  product_part_number TEXT,
  revision TEXT,
  customer TEXT,
  notes TEXT,
  created_by_user_id INTEGER,
  created_by_display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_teardown_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teardown_id UUID NOT NULL REFERENCES product_teardowns(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  entered_part_number TEXT,
  quantity NUMERIC(18, 6) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  assembly_name TEXT,
  parent_assembly_name TEXT,
  physical_location TEXT,
  thread_size TEXT,
  length TEXT,
  head_style TEXT,
  drive_style TEXT,
  material_finish TEXT,
  additional_details TEXT,
  notes TEXT,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  inventory_part_number TEXT,
  inventory_match_state TEXT NOT NULL DEFAULT 'not_found'
    CHECK (inventory_match_state IN ('found', 'possible', 'not_found')),
  inventory_match_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_teardown_items_teardown_idx
  ON product_teardown_items(teardown_id);
CREATE INDEX IF NOT EXISTS product_teardown_items_inventory_idx
  ON product_teardown_items(inventory_item_id);

CREATE TABLE IF NOT EXISTS product_teardown_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teardown_id UUID NOT NULL REFERENCES product_teardowns(id) ON DELETE CASCADE,
  teardown_item_id UUID REFERENCES product_teardown_items(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  original_name TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_teardown_photos_teardown_idx
  ON product_teardown_photos(teardown_id);
