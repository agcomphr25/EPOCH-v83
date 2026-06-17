ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS primary_image_media_id uuid;

