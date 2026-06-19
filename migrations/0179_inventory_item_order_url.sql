ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS order_url text;
