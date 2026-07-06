-- Release the remaining FF orders that survived the customer-signature queue
-- retirement because their live rows still present as awaiting signature.

CREATE TEMP TABLE tmp_remaining_ff_signature_repair AS
SELECT
  ao.id,
  ao.order_id,
  ao.status AS old_status,
  ao.current_department AS old_department
FROM all_orders ao
WHERE ao.order_id IN ('FF130', 'FF047', 'FF055')
  AND ao.is_cancelled IS DISTINCT FROM TRUE
  AND ao.shipped_date IS NULL
  AND ao.shipping_completed_at IS NULL
  AND NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NULL
  AND (
    UPPER(BTRIM(COALESCE(ao.status, ''))) = 'PENDING_' || 'SIGNATURE'
    OR LOWER(BTRIM(COALESCE(ao.current_department, ''))) = 'awaiting customer ' || 'signature'
  );

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
      'migration 0175',
      'migration',
      'migrations/0175_repair_remaining_ff_signature_queue_orders.sql',
      'REMAINING_FF_SIGNATURE_QUEUE_REPAIR',
      'Released remaining FF orders from the retired customer-signature queue.',
      old_status,
      'FINALIZED',
      old_department,
      'P1 Production Queue',
      jsonb_build_object(
        'status', jsonb_build_object('before', old_status, 'after', 'FINALIZED', 'label', 'Order Status'),
        'currentDepartment', jsonb_build_object('before', old_department, 'after', 'P1 Production Queue', 'label', 'Current Department')
      ),
      jsonb_build_object('migration', '0175_repair_remaining_ff_signature_queue_orders')
    FROM tmp_remaining_ff_signature_repair;
  END IF;
END $$;

UPDATE all_orders ao
SET
  status = 'FINALIZED',
  current_department = 'P1 Production Queue',
  barcode = CASE
    WHEN ao.barcode IS NULL OR ao.barcode = '' OR ao.barcode LIKE 'PENDING-%'
      THEN 'P1-' || ao.order_id
    ELSE ao.barcode
  END,
  updated_at = NOW()
FROM tmp_remaining_ff_signature_repair tmp
WHERE ao.id = tmp.id;

UPDATE production_orders po
SET
  current_department = 'P1 Production Queue',
  updated_at = NOW()
FROM tmp_remaining_ff_signature_repair tmp
WHERE po.order_id = tmp.order_id
  AND LOWER(BTRIM(COALESCE(po.current_department, ''))) = 'awaiting customer ' || 'signature';

DROP TABLE tmp_remaining_ff_signature_repair;
