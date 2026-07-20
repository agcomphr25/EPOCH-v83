-- Repair P1 PO production rows whose bottom-metal SKU was previously
-- classified from a fiberglass stock-model fallback. This is intentionally
-- idempotent: once the material and routing are correct, reruns are no-ops.

UPDATE production_orders
SET
  material_canonical = 'Metal Accessory',
  current_department = CASE
    WHEN current_department = 'P1 Production Queue'
      AND UPPER(COALESCE(production_status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
      THEN 'Shipping QC'
    ELSE current_department
  END,
  production_status = CASE
    WHEN current_department = 'P1 Production Queue'
      AND UPPER(COALESCE(production_status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
      THEN 'IN_PROGRESS'
    ELSE production_status
  END,
  updated_at = NOW()
WHERE REGEXP_REPLACE(
  UPPER(COALESCE(NULLIF(item_id, ''), item_name, '')),
  '[-_[:space:]]',
  '',
  'g'
) ~ '^(AGBDL|AGARCA|AGBM|AGM5|AGPIC)'
AND (
  material_canonical IS DISTINCT FROM 'Metal Accessory'
  OR (
    current_department = 'P1 Production Queue'
    AND UPPER(COALESCE(production_status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
  )
  OR (
    current_department = 'Shipping QC'
    AND UPPER(COALESCE(production_status, '')) IN ('PENDING', 'ACTIVE')
  )
);

-- Keep the general order read model aligned with the repaired production row.
-- Matching by order_id is required because model_id may contain the incorrect
-- fiberglass stock-model fallback rather than the metal accessory SKU.
UPDATE all_orders AS orders
SET
  current_department = 'Shipping QC',
  status = CASE
    WHEN UPPER(COALESCE(orders.status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
      THEN 'IN_PROGRESS'
    ELSE orders.status
  END,
  updated_at = NOW()
WHERE orders.current_department = 'P1 Production Queue'
  AND UPPER(COALESCE(orders.status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
  AND EXISTS (
    SELECT 1
    FROM production_orders AS production
    WHERE production.order_id = orders.order_id
      AND production.material_canonical = 'Metal Accessory'
  );
