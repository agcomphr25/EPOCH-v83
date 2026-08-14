-- READ ONLY: shipped orders currently assigned to an active P1 manufacturing
-- department. Run against the authoritative production application database.

SELECT DISTINCT ON (ao.order_id)
  ao.order_id,
  ao.customer_id,
  ao.customer_po,
  ao.model_id,
  ao.due_date,
  ao.status AS current_status,
  ao.current_department,
  ao.tracking_number,
  ao.shipped_date,
  ao.shipping_completed_at,
  ao.updated_at AS last_floor_update_at,
  'REMOVE FROM PRODUCTION FLOOR - ALREADY SHIPPED' AS required_floor_action
FROM all_orders ao
WHERE ao.current_department IN (
    'P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC',
    'Gunsmith', 'Finish', 'Finish QC', 'Paint', 'Shipping QC'
  )
  AND ao.is_cancelled IS DISTINCT FROM TRUE
  AND ao.status NOT IN ('CANCELLED', 'CANCELED', 'SCRAPPED')
  AND (
    ao.shipped_date IS NOT NULL
    OR ao.shipping_completed_at IS NOT NULL
    OR NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NOT NULL
    OR UPPER(COALESCE(ao.status, '')) IN ('FULFILLED', 'SHIPPED')
  )
ORDER BY ao.order_id, ao.updated_at DESC NULLS LAST;
