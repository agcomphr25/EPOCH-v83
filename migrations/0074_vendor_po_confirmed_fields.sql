ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS vendor_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS vendor_confirmed_action TEXT;
