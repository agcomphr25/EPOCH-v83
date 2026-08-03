-- Restore only the orders that migration 0167 replayed after migration 0238
-- had already returned them to FULFILLED / Shipping Management.
--
-- The paired audit events provide exact provenance: an order must have a
-- 0238 reversal and then a later 0167 repair event. No other P1 queue order is
-- inferred from dates, shipping fields, or department alone.

CREATE TEMP TABLE tmp_restore_0167_replay_orders ON COMMIT DROP AS
SELECT DISTINCT ON (ao.order_id)
  ao.order_id,
  replay.id AS replay_event_id,
  replay.occurred_at AS replay_occurred_at
FROM all_orders ao
JOIN order_activity_events reversal
  ON reversal.order_id = ao.order_id
 AND reversal.reason_code = 'REVERSE_0167_FULFILLED_RESTORE'
JOIN order_activity_events replay
  ON replay.order_id = ao.order_id
 AND replay.source_route = 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'
 AND replay.reason_code = 'CUSTOMER_SIGNATURE_FULFILLED_REPAIR'
 AND replay.occurred_at > reversal.occurred_at
WHERE ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue'
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events correction
    WHERE correction.order_id = ao.order_id
      AND correction.reason_code = 'RESTORE_0167_POST_0238_REPLAY'
      AND correction.metadata->>'replayEventId' = replay.id::text
  )
ORDER BY ao.order_id, replay.occurred_at DESC, replay.id DESC;

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
  'migration 0240',
  'migration',
  'migrations/0240_restore_0167_replay_orders.sql',
  'RESTORE_0167_POST_0238_REPLAY',
  'Restored an order replayed by migration 0167 after its audited 0238 reversal.',
  'FINALIZED',
  'FULFILLED',
  'P1 Production Queue',
  'Shipping Management',
  jsonb_build_object(
    'status', jsonb_build_object('before', 'FINALIZED', 'after', 'FULFILLED', 'label', 'Order Status'),
    'currentDepartment', jsonb_build_object('before', 'P1 Production Queue', 'after', 'Shipping Management', 'label', 'Current Department')
  ),
  jsonb_build_object(
    'migration', '0240_restore_0167_replay_orders',
    'replayEventId', repair.replay_event_id,
    'replayOccurredAt', repair.replay_occurred_at
  )
FROM tmp_restore_0167_replay_orders repair;

UPDATE all_orders ao
SET
  status = 'FULFILLED',
  current_department = 'Shipping Management',
  updated_at = NOW()
FROM tmp_restore_0167_replay_orders repair
WHERE ao.order_id = repair.order_id
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue';
