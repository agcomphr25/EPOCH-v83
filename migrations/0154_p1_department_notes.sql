ALTER TABLE all_orders
ADD COLUMN IF NOT EXISTS department_notes jsonb DEFAULT '[]'::jsonb;

ALTER TABLE order_drafts
ADD COLUMN IF NOT EXISTS department_notes jsonb DEFAULT '[]'::jsonb;

UPDATE all_orders
SET department_notes = '[]'::jsonb
WHERE department_notes IS NULL;

UPDATE order_drafts
SET department_notes = '[]'::jsonb
WHERE department_notes IS NULL;
