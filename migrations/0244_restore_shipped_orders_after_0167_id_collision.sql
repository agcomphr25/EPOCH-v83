-- Restore shipped orders that migration 0167 moved to the P1 queue through a
-- legacy duplicate all_orders.id collision. Scope is explicit, and every row
-- must retain independent shipment evidence before it can be changed.

CREATE TEMP TABLE tmp_restore_shipped_0167_collision ON COMMIT DROP AS
SELECT
  ao.order_id,
  ao.status AS old_status,
  ao.current_department AS old_department,
  ao.shipped_date,
  ao.tracking_number
FROM all_orders ao
WHERE ao.order_id IN (
    'EI145', 'EI156', 'AG060', 'EI150', 'EI151', 'EI153',
    'EI155', 'EI165', 'EI007', 'EI142', 'EI148', 'EI209'
  )
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue'
  AND (
    ao.shipped_date IS NOT NULL
    OR ao.shipping_completed_at IS NOT NULL
    OR NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NOT NULL
  )
  AND EXISTS (
    SELECT 1
    FROM all_orders collision
    WHERE collision.id = ao.id
      AND collision.order_id <> ao.order_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events prior
    WHERE prior.order_id = ao.order_id
      AND prior.reason_code = 'RESTORE_SHIPPED_AFTER_0167_ID_COLLISION'
  );

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
  'migration 0244',
  'migration',
  'migrations/0244_restore_shipped_orders_after_0167_id_collision.sql',
  'RESTORE_SHIPPED_AFTER_0167_ID_COLLISION',
  'Restored a shipped order moved to the P1 queue by migration 0167 through a duplicate legacy numeric ID.',
  repair.old_status,
  'FULFILLED',
  repair.old_department,
  'Shipping Management',
  jsonb_build_object(
    'status', jsonb_build_object('before', repair.old_status, 'after', 'FULFILLED', 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', repair.old_department, 'after', 'Shipping Management', 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0244_restore_shipped_orders_after_0167_id_collision',
    'rootCause', 'duplicate_all_orders_id_join',
    'shippedDate', repair.shipped_date,
    'trackingNumber', repair.tracking_number
  )
FROM tmp_restore_shipped_0167_collision repair;

UPDATE order_department_transitions transition
SET
  exited_at = GREATEST(transition.entered_at, COALESCE(repair.shipped_date, NOW())),
  exit_reason = 'historical shipment reconciliation',
  metadata = COALESCE(transition.metadata, '{}'::jsonb) || jsonb_build_object(
    'closedByMigration', '0244_restore_shipped_orders_after_0167_id_collision',
    'reconciledAt', NOW()
  )
FROM tmp_restore_shipped_0167_collision repair
WHERE transition.entity_type = 'p1_order'
  AND transition.entity_id = repair.order_id
  AND transition.exited_at IS NULL;

UPDATE all_orders ao
SET
  status = 'FULFILLED',
  current_department = 'Shipping Management',
  updated_at = NOW()
FROM tmp_restore_shipped_0167_collision repair
WHERE ao.order_id = repair.order_id
  AND ao.status = repair.old_status
  AND ao.current_department = repair.old_department;
