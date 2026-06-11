-- Ensure newly created All Orders no longer remain in retired initial states.
-- Existing downstream production departments are intentionally left untouched.

UPDATE all_orders
SET
  status = 'FINALIZED',
  current_department = 'P1 Production Queue',
  barcode = CASE
    WHEN barcode IS NULL OR barcode = '' OR barcode LIKE 'NOSTOCK-%' OR barcode LIKE 'PENDING-%'
      THEN 'P1-' || order_id
    ELSE barcode
  END,
  updated_at = NOW()
WHERE
  current_department IN ('Awaiting Customer Signature', 'P1 Production Queue', 'Shipping QC')
  AND status IN ('PENDING_SIGNATURE', 'IN_PROGRESS');

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
