-- Backfill production_orders item_id and item_name for PO-prefixed orders
-- that were created with numeric item codes instead of the real item code strings.
--
-- Root cause: older order creation code set item_name = purchase_order_items.item_id
-- (a numeric text value like "32") instead of purchase_order_items.item_name
-- (the actual item code like "AG-FG-AHV105-SR"). Both item_id and item_name were
-- set to the same numeric string.
--
-- This migration joins production_orders to purchase_order_items on po_item_id
-- and updates item_id and item_name where item_id is a purely numeric string or empty.
-- Idempotent: re-running is safe because the WHERE clause targets only affected rows.

UPDATE production_orders po
SET
  item_id   = poi.item_id,
  item_name = poi.item_name,
  updated_at = NOW()
FROM purchase_order_items poi
WHERE po.po_item_id = poi.id
  AND po.order_id LIKE 'PO-%'
  AND poi.item_name IS NOT NULL
  AND poi.item_name != ''
  AND (
    po.item_id ~ '^[0-9]+$'
    OR po.item_id IS NULL
    OR po.item_id = ''
    OR po.item_name ~ '^[0-9]+$'
    OR po.item_name IS NULL
    OR po.item_name = ''
  );
