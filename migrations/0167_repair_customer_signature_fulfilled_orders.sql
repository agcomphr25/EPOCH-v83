-- Repair P1 orders that were left in the retired customer-signature queue or
-- incorrectly moved into the fulfilled/shipping-management bucket.
--
-- This intentionally requires no shipment evidence so genuinely shipped orders
-- are not touched.

CREATE TEMP TABLE tmp_customer_signature_fulfilled_repair AS
SELECT
  ao.id,
  ao.order_id,
  ao.status AS old_status,
  ao.current_department AS old_department
FROM all_orders ao
WHERE (
    ao.status = 'PENDING_' || 'SIGNATURE'
    OR ao.current_department = 'Awaiting Customer ' || 'Signature'
    OR (
      ao.status = 'FULFILLED'
      AND ao.current_department = 'Shipping Management'
    )
  )
  AND ao.is_cancelled IS DISTINCT FROM TRUE
  AND ao.shipped_date IS NULL
  AND ao.shipping_completed_at IS NULL
  AND NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NULL;

DO $$
BEGIN
  IF to_regclass('public.order_activity_events') IS NOT NULL THEN
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
      'FINALIZED',
      old_department,
      'P1 Production Queue',
      jsonb_build_object(
        'status', jsonb_build_object('before', old_status, 'after', 'FINALIZED', 'label', 'Order Status'),
        'currentDepartment', jsonb_build_object('before', old_department, 'after', 'P1 Production Queue', 'label', 'Current Department')
      ),
      jsonb_build_object('migration', '0167_repair_customer_signature_fulfilled_orders')
    FROM tmp_customer_signature_fulfilled_repair;
  END IF;
END $$;

UPDATE all_orders ao
SET
  status = 'FINALIZED',
  current_department = 'P1 Production Queue',
  updated_at = NOW()
FROM tmp_customer_signature_fulfilled_repair tmp
WHERE ao.id = tmp.id;

UPDATE production_orders po
SET
  current_department = 'P1 Production Queue',
  updated_at = NOW()
FROM tmp_customer_signature_fulfilled_repair tmp
WHERE po.order_id = tmp.order_id
  AND po.current_department IN ('Awaiting Customer ' || 'Signature', 'Shipping Management');

DROP TABLE tmp_customer_signature_fulfilled_repair;
