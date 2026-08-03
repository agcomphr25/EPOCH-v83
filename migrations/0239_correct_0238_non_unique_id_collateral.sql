-- Correct collateral rows touched during the initial manual production run of
-- migration 0238. Production contains legacy duplicate all_orders.id values;
-- the reviewed migration now joins by order_id, but that first run joined by
-- id and also updated unrelated rows sharing those numeric identifiers.
--
-- Preserve collateral rows with shipment evidence as FULFILLED. For the
-- remaining exact transaction set, restore cancellation when the canonical
-- flag or audit ledger proves it; otherwise restore the P1 queue placement
-- captured immediately before the manual run.

CREATE TEMP TABLE tmp_correct_0238_collateral ON COMMIT DROP AS
WITH intended_orders AS (
  SELECT DISTINCT order_id
  FROM order_activity_events
  WHERE reason_code = 'REVERSE_0167_FULFILLED_RESTORE'
), collateral AS (
  SELECT ao.*
  FROM all_orders ao
  WHERE ao.updated_at = TIMESTAMP '2026-08-03 13:41:12.251739'
    AND ao.status = 'FULFILLED'
    AND ao.current_department = 'Shipping Management'
    AND NOT EXISTS (
      SELECT 1
      FROM intended_orders intended
      WHERE intended.order_id = ao.order_id
    )
    AND ao.shipped_date IS NULL
    AND ao.shipping_completed_at IS NULL
    AND NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM order_activity_events prior_correction
      WHERE prior_correction.order_id = ao.order_id
        AND prior_correction.reason_code = 'CORRECT_0238_NON_UNIQUE_ID_COLLATERAL'
    )
)
SELECT
  collateral.order_id,
  CASE
    WHEN collateral.is_cancelled IS TRUE
      OR EXISTS (
        SELECT 1
        FROM order_activity_events cancellation
        WHERE cancellation.order_id = collateral.order_id
          AND cancellation.occurred_at < TIMESTAMP '2026-08-03 13:41:12.251739'
          AND (
            cancellation.status_to = 'CANCELLED'
            OR cancellation.department_to = 'Cancelled'
          )
      )
      THEN 'CANCELLED'
    ELSE 'FINALIZED'
  END AS restored_status,
  CASE
    WHEN collateral.is_cancelled IS TRUE
      OR EXISTS (
        SELECT 1
        FROM order_activity_events cancellation
        WHERE cancellation.order_id = collateral.order_id
          AND cancellation.occurred_at < TIMESTAMP '2026-08-03 13:41:12.251739'
          AND (
            cancellation.status_to = 'CANCELLED'
            OR cancellation.department_to = 'Cancelled'
          )
      )
      THEN 'Cancelled'
    ELSE 'P1 Production Queue'
  END AS restored_department
FROM collateral;

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
  repair.order_id,
  'STATUS_DEPARTMENT_COLLATERAL_CORRECTED',
  'admin',
  NOW(),
  'system',
  'migration 0239',
  'migration',
  'migrations/0239_correct_0238_non_unique_id_collateral.sql',
  'CORRECT_0238_NON_UNIQUE_ID_COLLATERAL',
  'Corrected collateral from the initial manual migration 0238 run while preserving rows with shipment evidence.',
  'FULFILLED',
  repair.restored_status,
  'Shipping Management',
  repair.restored_department,
  jsonb_build_object(
    'status', jsonb_build_object('before', 'FULFILLED', 'after', repair.restored_status, 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', 'Shipping Management', 'after', repair.restored_department, 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0239_correct_0238_non_unique_id_collateral',
    'cause', 'non_unique_legacy_all_orders_id'
  )
FROM tmp_correct_0238_collateral repair;

UPDATE all_orders ao
SET
  status = repair.restored_status,
  current_department = repair.restored_department,
  updated_at = NOW()
FROM tmp_correct_0238_collateral repair
WHERE ao.order_id = repair.order_id
  AND ao.status = 'FULFILLED'
  AND ao.current_department = 'Shipping Management';
