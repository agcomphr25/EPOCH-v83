-- Add final assembly as a distinct manufactured inventory category.
ALTER TYPE inventory_manufactured_category ADD VALUE IF NOT EXISTS 'FINAL_ASSEMBLY';
