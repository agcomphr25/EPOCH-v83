-- Restore P1 orders whose canonical all_orders row was regressed from
-- Shipping QC to P1 Production Queue by the replayed migration 0171.
--
-- Migration 0171 did not update order_department_transitions for this path.
-- The single open transition therefore remains the authoritative evidence of
-- the order's actual department. Fail closed when that evidence is absent or
-- ambiguous; never infer restoration from order number or date alone.

CREATE TEMP TABLE tmp_restore_shipping_qc_after_0171 ON COMMIT DROP AS
SELECT DISTINCT
  ao.order_id,
  transition.id AS transition_id,
  transition.entered_at AS shipping_qc_entered_at
FROM all_orders ao
JOIN order_department_transitions transition
  ON transition.entity_type = 'p1_order'
 AND transition.entity_id = ao.order_id
 AND transition.department = 'Shipping QC'
 AND transition.exited_at IS NULL
WHERE ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue'
  AND NOT EXISTS (
    SELECT 1
    FROM order_department_transitions other_open
    WHERE other_open.entity_type = 'p1_order'
      AND other_open.entity_id = ao.order_id
      AND other_open.exited_at IS NULL
      AND other_open.id <> transition.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM order_activity_events prior_repair
    WHERE prior_repair.order_id = ao.order_id
      AND prior_repair.reason_code = 'RESTORE_SHIPPING_QC_AFTER_0171_REPLAY'
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
  'migration 0257',
  'migration',
  'migrations/0257_restore_shipping_qc_after_0171_replay.sql',
  'RESTORE_SHIPPING_QC_AFTER_0171_REPLAY',
  'Restored the single open Shipping QC transition after migration 0171 reset the canonical order state.',
  'FINALIZED',
  'IN_PROGRESS',
  'P1 Production Queue',
  'Shipping QC',
  jsonb_build_object(
    'status', jsonb_build_object(
      'before', 'FINALIZED',
      'after', 'IN_PROGRESS',
      'label', 'Order Status'
    ),
    'currentDepartment', jsonb_build_object(
      'before', 'P1 Production Queue',
      'after', 'Shipping QC',
      'label', 'Current Department'
    )
  ),
  jsonb_build_object(
    'migration', '0257_restore_shipping_qc_after_0171_replay',
    'cause', '0171_safe_boot_replay',
    'openTransitionId', repair.transition_id,
    'shippingQcEnteredAt', repair.shipping_qc_entered_at
  )
FROM tmp_restore_shipping_qc_after_0171 repair;

UPDATE all_orders ao
SET
  status = 'IN_PROGRESS',
  current_department = 'Shipping QC',
  updated_at = NOW()
FROM tmp_restore_shipping_qc_after_0171 repair
WHERE ao.order_id = repair.order_id
  AND ao.status = 'FINALIZED'
  AND ao.current_department = 'P1 Production Queue';

-- Migration 0171 normally left production_orders in Shipping QC. Repair only
-- a matching regressed value if another synchronization path copied the drift.
UPDATE production_orders po
SET
  current_department = 'Shipping QC',
  updated_at = NOW()
FROM tmp_restore_shipping_qc_after_0171 repair
WHERE po.order_id = repair.order_id
  AND po.current_department = 'P1 Production Queue';
