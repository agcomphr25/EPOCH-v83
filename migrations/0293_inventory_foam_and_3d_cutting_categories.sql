-- Add dedicated cutting categories for manufactured inventory items.
ALTER TYPE inventory_manufactured_category ADD VALUE IF NOT EXISTS 'FOAM_CUTTING';
ALTER TYPE inventory_manufactured_category ADD VALUE IF NOT EXISTS 'THREE_D_PRINTING_CUTTING';
