-- Vendor-level default order method used by consolidated needs when a part has no override.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS default_order_method text;
