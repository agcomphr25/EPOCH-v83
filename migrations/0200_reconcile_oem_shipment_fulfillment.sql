-- Reconcile persisted P1 OEM shipment items with their production-order and
-- purchase-order completion state. Returned-to-QC shipments are deleted by the
-- return workflow, so only currently persisted shipment records are authoritative.

UPDATE production_orders AS production
SET production_status = 'SHIPPED',
    current_department = 'Shipped',
    shipped_at = COALESCE(production.shipped_at, shipment.shipped_at, shipment.created_at, NOW()),
    is_fulfilled = true,
    fulfilled_date = COALESCE(
      production.fulfilled_date,
      production.shipped_at,
      shipment.shipped_at,
      shipment.created_at,
      NOW()
    ),
    updated_at = NOW()
FROM shipment_items AS item
JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
WHERE production.order_id = item.order_id
  AND UPPER(COALESCE(production.production_status, '')) NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
  AND (
    UPPER(COALESCE(production.production_status, '')) <> 'SHIPPED'
    OR production.current_department IS DISTINCT FROM 'Shipped'
    OR production.shipped_at IS NULL
    OR COALESCE(production.is_fulfilled, false) = false
    OR production.fulfilled_date IS NULL
  );

UPDATE all_orders AS orders
SET current_department = 'Shipped',
    status = 'SHIPPED',
    updated_at = NOW()
FROM shipment_items AS item
JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
WHERE orders.order_id = item.order_id
  AND UPPER(COALESCE(orders.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
  AND (
    orders.current_department IS DISTINCT FROM 'Shipped'
    OR UPPER(COALESCE(orders.status, '')) <> 'SHIPPED'
  );

UPDATE purchase_orders AS purchase
SET status = 'CLOSED',
    updated_at = NOW()
WHERE UPPER(COALESCE(purchase.status, '')) = 'OPEN'
  AND EXISTS (
    SELECT 1 FROM production_orders AS production
    WHERE production.po_id = purchase.id
      AND UPPER(COALESCE(production.production_status, ''))
        NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM production_orders AS production
    WHERE production.po_id = purchase.id
      AND UPPER(COALESCE(production.production_status, ''))
        NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')
  );
