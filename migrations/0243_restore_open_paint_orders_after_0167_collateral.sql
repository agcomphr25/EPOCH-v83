-- Restore four P1 orders whose canonical current_department was reset by the
-- 0238 duplicate-ID collateral followed by the 0167 safe-boot replay on
-- 2026-08-03. Their append-only transition rows remained open in Paint.

CREATE TEMP TABLE tmp_restore_open_paint_orders ON COMMIT DROP AS
SELECT ao.order_id
FROM all_orders ao
WHERE ao.order_id IN ('FC1696', 'FE280', 'FD717', 'FE033')
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue'
  AND EXISTS (
    SELECT 1
    FROM order_department_transitions transition
    WHERE transition.entity_type = 'p1_order'
      AND transition.entity_id = ao.order_id
      AND transition.department = 'Paint'
      AND transition.exited_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM order_activity_events replay
    WHERE replay.order_id = ao.order_id
      AND replay.source_route = 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'
      AND replay.reason_code = 'CUSTOMER_SIGNATURE_FULFILLED_REPAIR'
      AND replay.department_to = 'P1 Production Queue'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events prior_repair
    WHERE prior_repair.order_id = ao.order_id
      AND prior_repair.reason_code = 'RESTORE_OPEN_PAINT_AFTER_0167_COLLATERAL'
  );

INSERT INTO order_activity_events (
  order_id, event_type, event_category, occurred_at, actor_type,
  actor_display_name, source, source_route, reason_code, reason_text,
  status_from, status_to, department_from, department_to, field_diff, metadata
)
SELECT
  repair.order_id,
  'DEPARTMENT_RESTORED',
  'admin',
  NOW(),
  'system',
  'migration 0243',
  'migration',
  'migrations/0243_restore_open_paint_orders_after_0167_collateral.sql',
  'RESTORE_OPEN_PAINT_AFTER_0167_COLLATERAL',
  'Restored the open Paint transition after duplicate-ID collateral caused migration 0167 to reset the queue field.',
  'FINALIZED',
  'FINALIZED',
  'P1 Production Queue',
  'Paint',
  jsonb_build_object(
    'currentDepartment', jsonb_build_object(
      'before', 'P1 Production Queue',
      'after', 'Paint',
      'label', 'Current Department'
    )
  ),
  jsonb_build_object(
    'migration', '0243_restore_open_paint_orders_after_0167_collateral',
    'cause', '0238_non_unique_id_collateral_then_0167_replay'
  )
FROM tmp_restore_open_paint_orders repair;

UPDATE all_orders ao
SET
  current_department = 'Paint',
  updated_at = NOW()
FROM tmp_restore_open_paint_orders repair
WHERE ao.order_id = repair.order_id
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue';
