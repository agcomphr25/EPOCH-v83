ALTER TABLE bom_definitions
  ADD COLUMN IF NOT EXISTS inventory_item_id integer REFERENCES inventory_items(id);

CREATE INDEX IF NOT EXISTS idx_bom_definitions_inventory_item_id
  ON bom_definitions(inventory_item_id);

UPDATE bom_definitions bd
SET inventory_item_id = ii.id
FROM inventory_items ii
WHERE bd.inventory_item_id IS NULL
  AND (
    ii.ag_part_number = bd.sku
    OR ii.ag_part_number = regexp_replace(COALESCE(bd.sku, ''), '[[:space:]]+Rev[[:space:]]+.+$', '', 'i')
  );
