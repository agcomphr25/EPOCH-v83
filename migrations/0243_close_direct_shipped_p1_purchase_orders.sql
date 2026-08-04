-- Close OPEN P1 purchase orders whose active demand is fully represented by
-- persisted shipment items, including lines that intentionally bypassed
-- production_orders (for example, direct-shipped metal accessories).

WITH line_fulfillment AS (
  SELECT
    poi.po_id,
    GREATEST(
      poi.quantity - COALESCE(adjustments.canceled_quantity, 0),
      0
    ) AS active_quantity,
    COALESCE(shipments.shipped_quantity, 0) AS shipped_quantity,
    COALESCE(production.unresolved_quantity, 0) AS unresolved_quantity
  FROM purchase_order_items AS poi
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
      CASE adjustment.adjustment_type
        WHEN 'CANCEL_QUANTITY' THEN adjustment.quantity
        WHEN 'RESTORE_QUANTITY' THEN -adjustment.quantity
        ELSE 0
      END
    ), 0)::integer AS canceled_quantity
    FROM purchase_order_item_quantity_adjustments AS adjustment
    WHERE adjustment.purchase_order_item_id = poi.id
  ) AS adjustments ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(item.quantity), 0)::integer AS shipped_quantity
    FROM shipment_items AS item
    JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
    WHERE item.po_item_id = poi.id
  ) AS shipments ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS unresolved_quantity
    FROM production_orders AS production_order
    WHERE production_order.po_item_id = poi.id
      AND UPPER(COALESCE(production_order.production_status, ''))
        NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
      AND COALESCE(production_order.is_fulfilled, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM shipment_items AS shipped_item
        JOIN shipment_records AS shipped_record
          ON shipped_record.id = shipped_item.shipment_id
        WHERE shipped_item.order_id = production_order.order_id
      )
  ) AS production ON TRUE
), eligible_purchase_orders AS (
  SELECT fulfillment.po_id
  FROM line_fulfillment AS fulfillment
  GROUP BY fulfillment.po_id
  HAVING SUM(fulfillment.active_quantity) > 0
     AND BOOL_AND(
       fulfillment.active_quantity = 0
       OR (
         fulfillment.shipped_quantity >= fulfillment.active_quantity
         AND fulfillment.unresolved_quantity = 0
       )
     )
)
UPDATE purchase_orders AS purchase
SET status = 'CLOSED',
    updated_at = NOW()
FROM eligible_purchase_orders AS eligible
WHERE purchase.id = eligible.po_id
  AND UPPER(COALESCE(purchase.status, '')) = 'OPEN';
