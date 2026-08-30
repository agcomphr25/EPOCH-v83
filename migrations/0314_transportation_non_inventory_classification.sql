-- Transportation is a non-inventory service/charge item. Preserve its AG
-- identity and history while removing manufacturing-only classifications.
UPDATE inventory_items
SET utilized_in_non_inventory = true,
    item_type = 'PURCHASED',
    type = 'Purchased',
    manufactured_category = NULL,
    manufacturing_level = NULL,
    updated_at = NOW()
WHERE ag_part_number = '26435'
  AND lower(trim(name)) = 'transportation';
