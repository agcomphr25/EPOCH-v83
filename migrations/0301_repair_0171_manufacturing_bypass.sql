-- One-time, fail-closed repair for the eight orders conclusively identified by
-- migration 0257's immutable RESTORE_SHIPPING_QC_AFTER_0171_REPLAY events.
--
-- This migration is intentionally excluded from recurring safe boot. It does
-- not infer manufacturing completion from shipment fields and never deletes
-- the original 0171/0257 evidence.

CREATE TABLE IF NOT EXISTS p1_0171_manufacturing_bypass_audit (
  order_id text PRIMARY KEY,
  restoration_event_id integer NOT NULL,
  restoration_occurred_at timestamp NOT NULL,
  shipping_qc_entered_at timestamp,
  status_observed text,
  department_observed text,
  disposition text NOT NULL,
  audited_at timestamp NOT NULL DEFAULT NOW(),
  repaired_at timestamp
);

CREATE TEMP TABLE tmp_0171_confirmed_orders ON COMMIT DROP AS
SELECT DISTINCT ON (event.order_id)
  event.order_id,
  event.id AS restoration_event_id,
  event.occurred_at AS restoration_occurred_at,
  NULLIF(event.metadata ->> 'shippingQcEnteredAt', '')::timestamp AS shipping_qc_entered_at
FROM order_activity_events event
WHERE event.reason_code = 'RESTORE_SHIPPING_QC_AFTER_0171_REPLAY'
ORDER BY event.order_id, event.occurred_at DESC;

DO $$
DECLARE
  observed_count integer;
  unexpected_ids text[];
BEGIN
  SELECT COUNT(*) INTO observed_count FROM tmp_0171_confirmed_orders;
  IF observed_count = 0 THEN
    RAISE NOTICE '0301 repair skipped: no migration-0257 restoration evidence exists in this database';
    RETURN;
  END IF;

  SELECT array_agg(order_id ORDER BY order_id) INTO unexpected_ids
  FROM tmp_0171_confirmed_orders
  WHERE order_id <> ALL (ARRAY['FD001','FD007','FD690','FD787','FD832','FE039','FE108','FE241']);

  IF observed_count <> 8 OR unexpected_ids IS NOT NULL THEN
    RAISE EXCEPTION
      '0301 repair aborted: expected exactly the reviewed eight 0171 orders, found %; unexpected=%',
      observed_count, COALESCE(unexpected_ids::text, 'none');
  END IF;
END $$;

INSERT INTO p1_0171_manufacturing_bypass_audit (
  order_id, restoration_event_id, restoration_occurred_at,
  shipping_qc_entered_at, status_observed, department_observed, disposition
)
SELECT
  confirmed.order_id,
  confirmed.restoration_event_id,
  confirmed.restoration_occurred_at,
  confirmed.shipping_qc_entered_at,
  orders.status,
  orders.current_department,
  CASE
    WHEN confirmed.order_id IN ('FD007','FD690','FE108','FE241')
      AND orders.status = 'IN_PROGRESS'
      AND orders.current_department = 'Shipping QC'
      THEN 'RETURN_TO_P1_MANUFACTURING'
    WHEN confirmed.order_id = 'FD787'
      AND orders.status = 'IN_PROGRESS'
      AND orders.current_department = 'CNC'
      THEN 'REPAIR_CNC_TRANSITION_LEDGER'
    ELSE 'AUDIT_ONLY_CURRENT_OPERATIONAL_STATE'
  END
FROM tmp_0171_confirmed_orders confirmed
JOIN all_orders orders ON orders.order_id = confirmed.order_id
ON CONFLICT (order_id) DO NOTHING;

CREATE TEMP TABLE tmp_0171_return_to_p1 ON COMMIT DROP AS
SELECT audit.order_id
FROM p1_0171_manufacturing_bypass_audit audit
JOIN all_orders orders ON orders.order_id = audit.order_id
WHERE audit.disposition = 'RETURN_TO_P1_MANUFACTURING'
  AND audit.repaired_at IS NULL
  AND orders.status = 'IN_PROGRESS'
  AND orders.current_department = 'Shipping QC';

INSERT INTO order_activity_events (
  order_id, event_type, event_category, occurred_at, actor_type,
  actor_display_name, source, source_route, reason_code, reason_text,
  status_from, status_to, department_from, department_to, field_diff, metadata
)
SELECT
  repair.order_id,
  'STATUS_DEPARTMENT_REPAIRED', 'admin', NOW(), 'system', 'migration 0301',
  'migration', 'migrations/0301_repair_0171_manufacturing_bypass.sql',
  'REPAIR_0171_MANUFACTURING_BYPASS',
  'Returned an unmanufactured order from Shipping QC to P1 Production Queue; preserved the 0171 and 0257 audit evidence.',
  orders.status, orders.status, 'Shipping QC', 'P1 Production Queue',
  jsonb_build_object(
    'currentDepartment', jsonb_build_object(
      'before', 'Shipping QC', 'after', 'P1 Production Queue', 'label', 'Current Department'
    )
  ),
  jsonb_build_object(
    'cause', '0171_safe_boot_replay_followed_by_0257_restoration',
    'requiresManufacturing', true,
    'restorationEventId', audit.restoration_event_id
  )
FROM tmp_0171_return_to_p1 repair
JOIN all_orders orders ON orders.order_id = repair.order_id
JOIN p1_0171_manufacturing_bypass_audit audit ON audit.order_id = repair.order_id;

UPDATE order_department_transitions transition
SET exited_at = NOW(),
    duration_minutes = GREATEST(FLOOR(EXTRACT(EPOCH FROM (NOW() - entered_at)) / 60)::integer, 0),
    exit_reason = 'REPAIR_0171_MANUFACTURING_BYPASS',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'migration', '0301_repair_0171_manufacturing_bypass'
    )
FROM tmp_0171_return_to_p1 repair
WHERE transition.entity_type = 'p1_order'
  AND transition.entity_id = repair.order_id
  AND transition.department = 'Shipping QC'
  AND transition.exited_at IS NULL;

INSERT INTO order_department_transitions (
  entity_type, entity_id, department, entered_at, metadata
)
SELECT
  'p1_order', repair.order_id, 'P1 Production Queue', NOW(),
  jsonb_build_object(
    'migration', '0301_repair_0171_manufacturing_bypass',
    'reason', 'REPAIR_0171_MANUFACTURING_BYPASS',
    'requiresManufacturing', true
  )
FROM tmp_0171_return_to_p1 repair
WHERE NOT EXISTS (
  SELECT 1
  FROM order_department_transitions open_transition
  WHERE open_transition.entity_type = 'p1_order'
    AND open_transition.entity_id = repair.order_id
    AND open_transition.exited_at IS NULL
);

UPDATE all_orders orders
SET current_department = 'P1 Production Queue', updated_at = NOW()
FROM tmp_0171_return_to_p1 repair
WHERE orders.order_id = repair.order_id
  AND orders.status = 'IN_PROGRESS'
  AND orders.current_department = 'Shipping QC';

-- FD787's canonical CNC state is authoritative. Repair only the reviewed stale
-- open P1 transition and use the earliest surviving CNC activity timestamp.
CREATE TEMP TABLE tmp_fd787_transition_repair ON COMMIT DROP AS
SELECT orders.order_id
FROM all_orders orders
JOIN p1_0171_manufacturing_bypass_audit audit ON audit.order_id = orders.order_id
WHERE orders.order_id = 'FD787'
  AND orders.status = 'IN_PROGRESS'
  AND orders.current_department = 'CNC'
  AND audit.disposition = 'REPAIR_CNC_TRANSITION_LEDGER'
  AND audit.repaired_at IS NULL
  AND EXISTS (
    SELECT 1 FROM order_department_transitions transition
    WHERE transition.entity_type = 'p1_order'
      AND transition.entity_id = orders.order_id
      AND transition.department = 'P1 Production Queue'
      AND transition.exited_at IS NULL
  );

UPDATE order_department_transitions transition
SET exited_at = COALESCE(
      (SELECT MIN(event.occurred_at) FROM order_activity_events event
       WHERE event.order_id = 'FD787' AND event.department_to = 'CNC'),
      NOW()
    ),
    exit_reason = 'REPAIR_FD787_STALE_OPEN_TRANSITION',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'migration', '0301_repair_0171_manufacturing_bypass'
    )
FROM tmp_fd787_transition_repair repair
WHERE transition.entity_type = 'p1_order'
  AND transition.entity_id = repair.order_id
  AND transition.department = 'P1 Production Queue'
  AND transition.exited_at IS NULL;

INSERT INTO order_department_transitions (
  entity_type, entity_id, department, entered_at, metadata
)
SELECT
  'p1_order', repair.order_id, 'CNC',
  COALESCE(
    (SELECT MIN(event.occurred_at) FROM order_activity_events event
     WHERE event.order_id = repair.order_id AND event.department_to = 'CNC'),
    NOW()
  ),
  jsonb_build_object(
    'migration', '0301_repair_0171_manufacturing_bypass',
    'reason', 'REPAIR_FD787_STALE_OPEN_TRANSITION'
  )
FROM tmp_fd787_transition_repair repair
WHERE NOT EXISTS (
  SELECT 1 FROM order_department_transitions open_transition
  WHERE open_transition.entity_type = 'p1_order'
    AND open_transition.entity_id = repair.order_id
    AND open_transition.exited_at IS NULL
);

INSERT INTO order_activity_events (
  order_id, event_type, event_category, occurred_at, actor_type,
  actor_display_name, source, source_route, reason_code, reason_text,
  status_from, status_to, department_from, department_to, field_diff, metadata
)
SELECT
  repair.order_id, 'DEPARTMENT_LEDGER_REPAIRED', 'admin', NOW(), 'system',
  'migration 0301', 'migration',
  'migrations/0301_repair_0171_manufacturing_bypass.sql',
  'REPAIR_FD787_STALE_OPEN_TRANSITION',
  'Aligned the open department-transition ledger to the authoritative CNC canonical state without changing the order.',
  'IN_PROGRESS', 'IN_PROGRESS', 'P1 Production Queue', 'CNC',
  jsonb_build_object(
    'transitionLedger', jsonb_build_object('before', 'P1 Production Queue', 'after', 'CNC')
  ),
  jsonb_build_object('canonicalDepartmentChanged', false)
FROM tmp_fd787_transition_repair repair;

UPDATE p1_0171_manufacturing_bypass_audit audit
SET repaired_at = NOW()
WHERE audit.order_id IN (
  SELECT order_id FROM tmp_0171_return_to_p1
  UNION
  SELECT order_id FROM tmp_fd787_transition_repair
);
