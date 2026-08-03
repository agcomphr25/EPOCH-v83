-- Restore the exact orders that migration 0167 incorrectly reopened on
-- 2026-07-31. The append-only activity ledger is the authoritative scope:
-- every candidate was FULFILLED / Shipping Management immediately before
-- 0167 changed it to FINALIZED / P1 Production Queue.
--
-- This repair is idempotent. It records one compensating event per original
-- migration event and never infers additional fulfilled orders from dates,
-- customer data, or missing shipment fields.

CREATE TEMP TABLE tmp_reverse_0167_fulfilled_orders ON COMMIT DROP AS
WITH original_events AS (
  SELECT DISTINCT ON (oae.order_id)
    oae.id AS original_event_id,
    oae.order_id,
    oae.occurred_at AS original_occurred_at,
    oae.status_from,
    oae.status_to,
    oae.department_from,
    oae.department_to
  FROM order_activity_events oae
  WHERE oae.source_route = 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'
    AND oae.reason_code = 'CUSTOMER_SIGNATURE_FULFILLED_REPAIR'
    AND oae.occurred_at >= TIMESTAMP '2026-07-31 14:18:47'
    AND oae.occurred_at < TIMESTAMP '2026-07-31 14:18:48'
    AND oae.status_from = 'FULFILLED'
    AND oae.department_from = 'Shipping Management'
    AND oae.status_to = 'FINALIZED'
    AND oae.department_to = 'P1 Production Queue'
  ORDER BY oae.order_id, oae.id DESC
)
SELECT
  ao.order_id,
  ao.status AS current_status,
  ao.current_department AS current_department,
  oe.original_event_id,
  oe.original_occurred_at
FROM original_events oe
JOIN all_orders ao ON ao.order_id = oe.order_id
WHERE ao.status IN ('FINALIZED', 'IN_PROGRESS')
  AND ao.current_department IN ('P1 Production Queue', 'Barcode')
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events reversal
    WHERE reversal.order_id = oe.order_id
      AND reversal.reason_code = 'REVERSE_0167_FULFILLED_RESTORE'
      AND reversal.metadata->>'originalMigrationEventId' = oe.original_event_id::text
  );

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
  'STATUS_DEPARTMENT_RESTORED',
  'admin',
  NOW(),
  'system',
  'migration 0238',
  'migration',
  'migrations/0238_reverse_0167_fulfilled_orders.sql',
  'REVERSE_0167_FULFILLED_RESTORE',
  'Restored the fulfilled state recorded immediately before the erroneous July 31 execution of migration 0167.',
  repair.current_status,
  'FULFILLED',
  repair.current_department,
  'Shipping Management',
  jsonb_build_object(
    'status', jsonb_build_object('before', repair.current_status, 'after', 'FULFILLED', 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', repair.current_department, 'after', 'Shipping Management', 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0238_reverse_0167_fulfilled_orders',
    'originalMigration', '0167_repair_customer_signature_fulfilled_orders',
    'originalMigrationEventId', repair.original_event_id,
    'originalMigrationOccurredAt', repair.original_occurred_at
  )
FROM tmp_reverse_0167_fulfilled_orders repair;

UPDATE all_orders ao
SET
  status = 'FULFILLED',
  current_department = 'Shipping Management',
  updated_at = NOW()
FROM tmp_reverse_0167_fulfilled_orders repair
WHERE ao.order_id = repair.order_id
  AND ao.status = repair.current_status
  AND ao.current_department = repair.current_department;
