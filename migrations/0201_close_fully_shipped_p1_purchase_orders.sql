-- Move open P1 purchase orders to Completed POs when every non-cancelled
-- production unit has shipped. Cancelled rows remain as audit history and do
-- not prevent completion.

UPDATE purchase_orders AS purchase
SET status = 'CLOSED',
    updated_at = NOW()
WHERE UPPER(COALESCE(purchase.status, '')) = 'OPEN'
  AND EXISTS (
    SELECT 1
    FROM production_orders AS production
    WHERE production.po_id = purchase.id
      AND UPPER(COALESCE(production.production_status, ''))
        NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM production_orders AS production
    WHERE production.po_id = purchase.id
      AND UPPER(COALESCE(production.production_status, ''))
        NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')
  );
