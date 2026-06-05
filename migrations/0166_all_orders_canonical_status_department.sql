-- Canonicalize All Orders status/department pairs.
-- Rules:
--   P1 Production Queue -> FINALIZED
--   Shipping -> READY_TO_SHIP
--   Other active production departments -> IN_PROGRESS
--   Cancelled -> CANCELLED / Cancelled
--   Fulfilled or shipped -> FULFILLED / Shipping Management

CREATE TEMP TABLE tmp_all_orders_canonical_status_department AS
WITH scoped AS (
  SELECT
    id,
    order_id,
    status AS old_status,
    current_department AS old_department,
    is_cancelled,
    UPPER(REGEXP_REPLACE(COALESCE(status, ''), '[\s-]+', '_', 'g')) AS normalized_status,
    COALESCE(NULLIF(TRIM(current_department), ''), 'P1 Production Queue') AS normalized_department
  FROM all_orders
  WHERE order_id NOT LIKE 'P1-%'
    AND order_id NOT LIKE 'PO%'
    AND order_id != 'AG1'
    AND order_id NOT LIKE '%PO%'
    AND (source = 'SALES' OR source = 'main_orders' OR source IS NULL)
),
proposed AS (
  SELECT
    id,
    order_id,
    old_status,
    old_department,
    CASE
      WHEN is_cancelled IS TRUE
        OR normalized_status IN ('CANCELLED', 'SCRAPPED')
        OR normalized_department = 'Cancelled'
        THEN 'CANCELLED'
      WHEN normalized_status IN ('FULFILLED', 'SHIPPED')
        OR normalized_department IN ('Shipping Management', 'Fulfilled')
        THEN 'FULFILLED'
      WHEN normalized_status = 'PENDING_SIGNATURE'
        OR normalized_department = 'Awaiting Customer Signature'
        THEN 'PENDING_SIGNATURE'
      WHEN normalized_department = 'Shipping'
        THEN 'READY_TO_SHIP'
      WHEN normalized_department = 'P1 Production Queue'
        THEN 'FINALIZED'
      ELSE 'IN_PROGRESS'
    END AS new_status,
    CASE
      WHEN is_cancelled IS TRUE
        OR normalized_status IN ('CANCELLED', 'SCRAPPED')
        OR normalized_department = 'Cancelled'
        THEN 'Cancelled'
      WHEN normalized_status IN ('FULFILLED', 'SHIPPED')
        OR normalized_department IN ('Shipping Management', 'Fulfilled')
        THEN 'Shipping Management'
      WHEN normalized_status = 'PENDING_SIGNATURE'
        OR normalized_department = 'Awaiting Customer Signature'
        THEN 'Awaiting Customer Signature'
      ELSE normalized_department
    END AS new_department
  FROM scoped
)
SELECT *
FROM proposed
WHERE COALESCE(old_status, '') <> new_status
   OR COALESCE(old_department, '') <> new_department;

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
  'STATUS_DEPARTMENT_CANONICALIZED',
  'admin',
  NOW(),
  'system',
  'migration 0163',
  'migration',
  'migrations/0166_all_orders_canonical_status_department.sql',
  'CANONICAL_STATUS_DEPARTMENT',
  'Canonicalized All Orders status and department according to the P1 order lifecycle policy.',
  old_status,
  new_status,
  old_department,
  new_department,
  jsonb_build_object(
    'status', jsonb_build_object('before', old_status, 'after', new_status, 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', old_department, 'after', new_department, 'label', 'Current Department')
  ),
  jsonb_build_object('migration', '0166_all_orders_canonical_status_department')
FROM tmp_all_orders_canonical_status_department;

UPDATE all_orders ao
SET
  status = tmp.new_status,
  current_department = tmp.new_department,
  updated_at = NOW()
FROM tmp_all_orders_canonical_status_department tmp
WHERE ao.id = tmp.id;

-- TEMP TABLE is session-scoped and auto-drops; no explicit DROP needed.
