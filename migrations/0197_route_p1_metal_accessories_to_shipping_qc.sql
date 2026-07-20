-- P1 metal accessories do not require the manufacturing department sequence.
-- Route existing active rows that are still at the initial P1 queue directly to
-- Shipping QC. The SKU checks cover both compact and hyphenated formats and the
-- WHERE clauses make this migration idempotent and safe on an empty database.

UPDATE production_orders
SET item_id = COALESCE(NULLIF(TRIM(poi.item_id), ''), NULLIF(TRIM(poi.item_name), ''), production_orders.item_id),
    item_name = COALESCE(NULLIF(TRIM(poi.item_name), ''), NULLIF(TRIM(poi.item_id), ''), production_orders.item_name),
    current_department = 'Shipping QC',
    production_status = 'IN_PROGRESS',
    material_canonical = 'Metal Accessory',
    updated_at = NOW()
FROM purchase_order_items poi
WHERE production_orders.po_item_id = poi.id
  AND production_orders.current_department = 'P1 Production Queue'
  AND UPPER(COALESCE(production_orders.production_status, '')) IN ('PENDING', 'IN_PROGRESS', 'ACTIVE')
  AND (
    REGEXP_REPLACE(UPPER(COALESCE(poi.item_id, '')), '[-_]', '', 'g') LIKE ANY (ARRAY[
      'AGM5%', 'AGMS5%', 'AGBDL%', 'AGBM%', 'AGPIC%', 'AGARCA%'
    ])
    OR REGEXP_REPLACE(UPPER(COALESCE(poi.item_name, '')), '[-_]', '', 'g') LIKE ANY (ARRAY[
      'AGM5%', 'AGMS5%', 'AGBDL%', 'AGBM%', 'AGPIC%', 'AGARCA%'
    ])
  );

UPDATE all_orders ao
SET current_department = 'Shipping QC',
    status = 'IN_PROGRESS',
    updated_at = NOW()
WHERE ao.current_department = 'P1 Production Queue'
  AND UPPER(COALESCE(ao.status, '')) NOT IN ('CANCELLED', 'SHIPPED', 'COMPLETED')
  AND (
    REGEXP_REPLACE(UPPER(COALESCE(ao.model_id, '')), '[-_]', '', 'g') LIKE ANY (ARRAY[
      'AGM5%', 'AGMS5%', 'AGBDL%', 'AGBM%', 'AGPIC%', 'AGARCA%'
    ])
    OR EXISTS (
      SELECT 1
      FROM production_orders po
      WHERE po.order_id = ao.order_id
        AND po.current_department = 'Shipping QC'
        AND po.material_canonical = 'Metal Accessory'
    )
  );
