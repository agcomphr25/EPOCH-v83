-- Retire the customer-signature hold queue without deleting any orders.
-- Existing affected P1 orders are released into the normal production queue.

UPDATE all_orders
SET
  status = 'FINALIZED',
  current_department = 'P1 Production Queue',
  barcode = CASE
    WHEN barcode IS NULL OR barcode = '' OR barcode LIKE 'PENDING-%'
      THEN 'P1-' || order_id
    ELSE barcode
  END,
  updated_at = NOW()
WHERE
  status = 'PENDING_SIGNATURE'
  OR current_department = 'Awaiting Customer Signature';

UPDATE production_orders po
SET
  current_department = 'P1 Production Queue',
  updated_at = NOW()
FROM all_orders ao
WHERE
  po.order_id = ao.order_id
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue'
  AND po.current_department = 'Awaiting Customer Signature';
