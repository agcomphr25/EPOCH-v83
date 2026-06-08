-- Repair P1 orders that were left in the retired customer-signature queue or
-- incorrectly moved into the fulfilled/shipping-management bucket.
--
-- This intentionally requires no shipment evidence so genuinely shipped orders
-- are not touched. When a reliable production department exists, keep it and
-- derive the status from that department instead of blindly resetting to P1.

CREATE TEMP TABLE tmp_customer_signature_fulfilled_repair AS
WITH bad_orders AS (
  SELECT
    ao.id,
    ao.order_id,
    ao.status AS old_status,
    ao.current_department AS old_department
  FROM all_orders ao
  WHERE (
      ao.status = 'PENDING_SIGNATURE'
      OR ao.current_department = 'Awaiting Customer Signature'
      OR (
        ao.status = 'FULFILLED'
        AND ao.current_department = 'Shipping Management'
      )
    )
    AND ao.is_cancelled IS DISTINCT FROM TRUE
    AND ao.shipped_date IS NULL
    AND ao.shipping_completed_at IS NULL
    AND NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NULL
),
department_candidates AS (
  SELECT
    bo.*,
    NULLIF(TRIM(production_state.production_department), '') AS production_department,
    NULLIF(TRIM(latest_event.event_department), '') AS event_department
  FROM bad_orders bo
  LEFT JOIN LATERAL (
    SELECT current_department AS production_department
    FROM production_orders po
    WHERE po.order_id = bo.order_id
      AND NULLIF(TRIM(po.current_department), '') IS NOT NULL
      AND po.current_department NOT IN (
        'Awaiting Customer Signature',
        'Shipping Management',
        'Fulfilled',
        'Shipped',
        'Cancelled'
      )
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ) production_state ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(department_to, department_from) AS event_department
    FROM order_activity_events oae
    WHERE oae.order_id = bo.order_id
      AND COALESCE(department_to, department_from) IS NOT NULL
      AND COALESCE(department_to, department_from) NOT IN (
        'Awaiting Customer Signature',
        'Shipping Management',
        'Fulfilled',
        'Shipped',
        'Cancelled'
      )
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1
  ) latest_event ON TRUE
),
resolved AS (
  SELECT
    id,
    order_id,
    old_status,
    old_department,
    CASE
      WHEN production_department IS NOT NULL
        THEN production_department
      WHEN event_department IS NOT NULL
        THEN event_department
      ELSE 'P1 Production Queue'
    END AS new_department,
    CASE
      WHEN production_department IS NOT NULL
        THEN 'production_orders'
      WHEN event_department IS NOT NULL
        THEN 'order_activity_events'
      ELSE 'fallback_p1'
    END AS department_source
  FROM department_candidates
)
SELECT
  id,
  order_id,
  old_status,
  old_department,
  CASE
    WHEN new_department = 'Shipping' THEN 'READY_TO_SHIP'
    WHEN new_department = 'P1 Production Queue' THEN 'FINALIZED'
    ELSE 'IN_PROGRESS'
  END AS new_status,
  new_department,
  department_source
FROM resolved;

INSERT INTO order_activity_events (
  order_id,
  event_type,
  event_category,
  occurred_at,
  actor_type,
  actor_display_name,
  source,
  source_route,
  reason_code,
  reason_text,
  status_from,
  status_to,
  department_from,
  department_to,
  field_diff,
  metadata
)
SELECT
  order_id,
  'STATUS_DEPARTMENT_REPAIRED',
  'admin',
  NOW(),
  'system',
  'migration 0167',
  'migration',
  'migrations/0167_repair_customer_signature_fulfilled_orders.sql',
  'CUSTOMER_SIGNATURE_FULFILLED_REPAIR',
  'Repaired unshipped P1 orders that were left in retired customer-signature or fulfilled/shipping-management states.',
  old_status,
  new_status,
  old_department,
  new_department,
  jsonb_build_object(
    'status', jsonb_build_object('before', old_status, 'after', new_status, 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', old_department, 'after', new_department, 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0167_repair_customer_signature_fulfilled_orders',
    'departmentSource', department_source
  )
FROM tmp_customer_signature_fulfilled_repair;

UPDATE all_orders ao
SET
  status = tmp.new_status,
  current_department = tmp.new_department,
  updated_at = NOW()
FROM tmp_customer_signature_fulfilled_repair tmp
WHERE ao.id = tmp.id;

UPDATE production_orders po
SET
  current_department = tmp.new_department,
  updated_at = NOW()
FROM tmp_customer_signature_fulfilled_repair tmp
WHERE po.order_id = tmp.order_id
  AND (
    po.current_department IS NULL
    OR po.current_department IN ('Awaiting Customer Signature', 'Shipping Management')
  );

DROP TABLE tmp_customer_signature_fulfilled_repair;
