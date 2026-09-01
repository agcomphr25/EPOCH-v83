-- Reconcile routings that retained the historical COMPOSITE default even
-- though their authoritative inventory item is classified as MACHINED_PART.
--
-- Limit the repair to the default value and a stable inventory identity so
-- deliberately classified non-CNC routings and unlinked legacy rows remain
-- unchanged. Replay is idempotent.
UPDATE part_routings routing
SET routing_type = 'CNC'::routing_type,
    updated_at = NOW()
FROM inventory_items item
WHERE routing.routing_type = 'COMPOSITE'::routing_type
  AND item.manufactured_category = 'MACHINED_PART'::inventory_manufactured_category
  AND (
    routing.inventory_item_fk = item.id
    OR (
      routing.inventory_item_fk IS NULL
      AND routing.inventory_item_id ~ '^[0-9]+$'
      AND routing.inventory_item_id::bigint = item.id
    )
  );
