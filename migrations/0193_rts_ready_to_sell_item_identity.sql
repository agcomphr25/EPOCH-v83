CREATE SEQUENCE IF NOT EXISTS rts_item_number_seq;

ALTER TABLE rts_inventory
  ADD COLUMN IF NOT EXISTS rts_number TEXT,
  ADD COLUMN IF NOT EXISTS last_department TEXT;

UPDATE rts_inventory
SET rts_number = 'RTS-I-LEGACY-' || upper(left(replace(id::text, '-', ''), 12))
WHERE rts_number IS NULL OR btrim(rts_number) = '';

ALTER TABLE rts_inventory
  ALTER COLUMN rts_number SET DEFAULT
    ('RTS-I-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('rts_item_number_seq')::text, 6, '0')),
  ALTER COLUMN rts_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rts_inventory_rts_number_unique
  ON rts_inventory (rts_number);
