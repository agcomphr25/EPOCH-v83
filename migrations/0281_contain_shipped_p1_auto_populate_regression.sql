-- Remove shipped P1 orders from every active manufacturing department and
-- restore the canonical completed state: FULFILLED / Shipping Management.
--
-- Durable shipment evidence is authoritative. The affected row is captured
-- before repair so the physical floor-removal population remains auditable.

CREATE TABLE IF NOT EXISTS p1_shipped_order_containment_audit (
  order_id text PRIMARY KEY,
  detected_at timestamp NOT NULL DEFAULT NOW(),
  last_floor_update_at timestamp,
  status_before text,
  department_before text NOT NULL,
  shipped_date timestamp,
  shipping_completed_at timestamp,
  tracking_number text,
  restored_at timestamp,
  floor_removal_required boolean NOT NULL DEFAULT TRUE,
  containment_reason text NOT NULL DEFAULT 'SHIPPED_ORDER_FOUND_IN_MANUFACTURING'
);

CREATE TEMP TABLE tmp_shipped_manufacturing_containment ON COMMIT DROP AS
SELECT DISTINCT ON (ao.order_id)
  ao.order_id,
  ao.status AS status_before,
  ao.current_department AS department_before,
  ao.shipped_date,
  ao.shipping_completed_at,
  ao.tracking_number,
  ao.updated_at AS last_floor_update_at
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
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events repaired
    WHERE repaired.order_id = ao.order_id
      AND repaired.reason_code = 'CONTAIN_SHIPPED_MANUFACTURING_ORDER'
  )
ORDER BY ao.order_id, ao.updated_at DESC NULLS LAST;

INSERT INTO p1_shipped_order_containment_audit (
  order_id, last_floor_update_at, status_before, department_before,
  shipped_date, shipping_completed_at, tracking_number
)
SELECT
  order_id, last_floor_update_at, status_before, department_before,
  shipped_date, shipping_completed_at, tracking_number
FROM tmp_shipped_manufacturing_containment
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO order_activity_events (
  order_id, event_type, event_category, occurred_at, actor_type,
  actor_display_name, source, source_route, reason_code, reason_text,
  status_from, status_to, department_from, department_to, field_diff, metadata
)
SELECT
  repair.order_id,
  'STATUS_DEPARTMENT_RESTORED',
  'admin',
  NOW(),
  'system',
  'migration 0281',
  'migration',
  'migrations/0281_contain_shipped_p1_auto_populate_regression.sql',
  'CONTAIN_SHIPPED_MANUFACTURING_ORDER',
  'Removed a shipped order from manufacturing and restored Shipping Management.',
  repair.status_before,
  'FULFILLED',
  repair.department_before,
  'Shipping Management',
  jsonb_build_object(
    'status', jsonb_build_object('before', repair.status_before, 'after', 'FULFILLED', 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', repair.department_before, 'after', 'Shipping Management', 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0281_contain_shipped_p1_auto_populate_regression',
    'cause', 'shipped_order_in_active_manufacturing_department',
    'lastFloorUpdateAt', repair.last_floor_update_at,
    'shippedDate', repair.shipped_date,
    'shippingCompletedAt', repair.shipping_completed_at,
    'trackingNumber', repair.tracking_number,
    'floorRemovalRequired', true
  )
FROM tmp_shipped_manufacturing_containment repair;

UPDATE all_orders ao
SET
  status = 'FULFILLED',
  current_department = 'Shipping Management',
  updated_at = NOW()
FROM tmp_shipped_manufacturing_containment repair
WHERE ao.order_id = repair.order_id
  AND ao.current_department = repair.department_before;

UPDATE production_orders po
SET
  current_department = 'Shipping Management',
  production_status = 'SHIPPED',
  is_fulfilled = true,
  shipped_at = COALESCE(po.shipped_at, repair.shipped_date, repair.shipping_completed_at, NOW()),
  fulfilled_date = COALESCE(po.fulfilled_date, po.shipped_at, repair.shipped_date, repair.shipping_completed_at, NOW()),
  updated_at = NOW()
FROM tmp_shipped_manufacturing_containment repair
WHERE po.order_id = repair.order_id
  AND po.current_department IN (
    'P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC',
    'Gunsmith', 'Finish', 'Finish QC', 'Paint', 'Shipping QC'
  );

UPDATE p1_shipped_order_containment_audit audit
SET restored_at = NOW()
FROM tmp_shipped_manufacturing_containment repair
WHERE audit.order_id = repair.order_id
  AND audit.restored_at IS NULL;
