ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS production_line TEXT;

UPDATE vendor_pos
   SET production_line = 'GENERAL'
 WHERE production_line IS NULL;

