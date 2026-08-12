-- Reconcile one legacy P1 production-order row with its authoritative,
-- persisted March 2026 OEM shipment. This migration deliberately fails closed
-- unless the exact order, PO line, shipment, and tracking evidence all match.

DO $$
DECLARE
  v_order production_orders%ROWTYPE;
  v_shipment_id uuid;
  v_shipped_at timestamp;
  v_tracking_number text;
  v_shipment_count integer;
  v_orphaned_evidence_count integer;
  v_reason constant text :=
    'Reconciled legacy cancelled production state to the persisted March 25, 2026 OEM shipment; tracking 1Z27835W0391723408.';
BEGIN
  SELECT *
    INTO v_order
    FROM production_orders
   WHERE order_id = 'PO-P18380-46-1'
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT
      (SELECT COUNT(*)
         FROM shipment_items AS item
         LEFT JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
        WHERE item.order_id = 'PO-P18380-46-1'
           OR shipment.master_tracking_number = '1Z27835W0391723408')
      + (SELECT COUNT(*)
           FROM order_department_transitions
          WHERE entity_id = 'PO-P18380-46-1')
      + (SELECT COUNT(*)
           FROM audit_events
          WHERE entity_id = 'PO-P18380-46-1'
             OR subject_id = 'PO-P18380-46-1')
      INTO v_orphaned_evidence_count;

    IF v_orphaned_evidence_count = 0 THEN
      RAISE NOTICE
        'P18380 repair skipped: target order and persisted evidence are absent';
      RETURN;
    END IF;

    RAISE EXCEPTION
      'P18380 repair aborted: production order not found while % targeted evidence row(s) remain',
      v_orphaned_evidence_count;
  END IF;

  IF v_order.po_number IS DISTINCT FROM 'P18380'
     OR v_order.po_item_id IS DISTINCT FROM 48
     OR v_order.item_name IS DISTINCT FROM 'AG-FG-ADJ-AHV205-CDN' THEN
    RAISE EXCEPTION
      'P18380 repair aborted: production-order identity does not match expected PO line';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_shipment_count
    FROM shipment_items AS item
    JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
   WHERE item.order_id = v_order.order_id
     AND shipment.master_tracking_number = '1Z27835W0391723408';

  IF v_shipment_count <> 1 THEN
    RAISE EXCEPTION
      'P18380 repair aborted: expected exactly one persisted shipment, found %',
      v_shipment_count;
  END IF;

  SELECT shipment.id,
         COALESCE(shipment.shipped_at, shipment.created_at),
         shipment.master_tracking_number
    INTO v_shipment_id, v_shipped_at, v_tracking_number
    FROM shipment_items AS item
    JOIN shipment_records AS shipment ON shipment.id = item.shipment_id
   WHERE item.order_id = v_order.order_id
     AND shipment.master_tracking_number = '1Z27835W0391723408';

  IF v_shipped_at::date IS DISTINCT FROM DATE '2026-03-25' THEN
    RAISE EXCEPTION
      'P18380 repair aborted: persisted shipment date is %, expected 2026-03-25',
      v_shipped_at;
  END IF;

  -- Idempotent replay after the verified correction is a no-op.
  IF UPPER(COALESCE(v_order.production_status, '')) = 'SHIPPED'
     AND v_order.current_department = 'Shipped'
     AND v_order.is_fulfilled = true
     AND v_order.shipped_at IS NOT NULL
     AND v_order.fulfilled_date IS NOT NULL THEN
    RETURN;
  END IF;

  IF UPPER(COALESCE(v_order.production_status, '')) NOT IN ('CANCELLED', 'CANCELED')
     OR v_order.current_department IS DISTINCT FROM 'Shipping QC'
     OR COALESCE(v_order.is_fulfilled, false) <> false
     OR v_order.shipped_at IS NOT NULL
     OR v_order.fulfilled_date IS NOT NULL THEN
    RAISE EXCEPTION
      'P18380 repair aborted: current production state is not the reviewed legacy mismatch';
  END IF;

  UPDATE production_orders
     SET production_status = 'SHIPPED',
         current_department = 'Shipped',
         shipped_at = v_shipped_at,
         shipping_completed_at = v_shipped_at,
         is_fulfilled = true,
         fulfilled_date = v_shipped_at,
         fulfilled_by = 'system-migration-0267',
         updated_at = NOW()
   WHERE id = v_order.id;

  UPDATE order_department_transitions
     SET exited_at = v_shipped_at,
         duration_minutes = GREATEST(
           FLOOR(EXTRACT(EPOCH FROM (v_shipped_at - entered_at)) / 60)::integer,
           0
         ),
         exit_reason = 'shipment_record_reconciliation',
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'migration', '0267_reconcile_p18380_persisted_shipment',
           'shipmentId', v_shipment_id,
           'trackingNumber', v_tracking_number
         )
   WHERE entity_id = v_order.order_id
     AND department = 'Shipping QC'
     AND exited_at IS NULL;

  INSERT INTO order_department_transitions (
    entity_type,
    entity_id,
    department,
    entered_at,
    metadata
  )
  SELECT
    'p1_order',
    v_order.order_id,
    'Shipped',
    v_shipped_at,
    jsonb_build_object(
      'migration', '0267_reconcile_p18380_persisted_shipment',
      'shipmentId', v_shipment_id,
      'trackingNumber', v_tracking_number,
      'reason', v_reason
    )
  WHERE NOT EXISTS (
    SELECT 1
      FROM order_department_transitions
     WHERE entity_id = v_order.order_id
       AND department = 'Shipped'
       AND entered_at = v_shipped_at
  );

  INSERT INTO audit_events (
    entity_type,
    entity_id,
    action,
    actor_name,
    actor_role,
    reason,
    fields_changed,
    meta,
    timestamp,
    created_at,
    subject_type,
    subject_id,
    payload_json,
    occurred_at,
    recorded_at,
    source_service
  ) VALUES (
    'p1_order',
    v_order.order_id,
    'PERSISTED_SHIPMENT_STATE_RECONCILED',
    'system-migration-0267',
    'SYSTEM',
    v_reason,
    jsonb_build_object(
      'productionStatus', jsonb_build_object('before', v_order.production_status, 'after', 'SHIPPED'),
      'currentDepartment', jsonb_build_object('before', v_order.current_department, 'after', 'Shipped'),
      'isFulfilled', jsonb_build_object('before', v_order.is_fulfilled, 'after', true),
      'shippedAt', jsonb_build_object('before', v_order.shipped_at, 'after', v_shipped_at),
      'fulfilledDate', jsonb_build_object('before', v_order.fulfilled_date, 'after', v_shipped_at)
    ),
    jsonb_build_object(
      'migration', '0267_reconcile_p18380_persisted_shipment',
      'shipmentId', v_shipment_id,
      'trackingNumber', v_tracking_number,
      'poNumber', v_order.po_number,
      'poItemId', v_order.po_item_id,
      'itemName', v_order.item_name
    ),
    NOW(),
    NOW(),
    'p1_order',
    v_order.order_id,
    jsonb_build_object(
      'shipmentId', v_shipment_id,
      'trackingNumber', v_tracking_number,
      'actualShipDate', v_shipped_at
    ),
    NOW(),
    NOW(),
    'migration.0267_reconcile_p18380_persisted_shipment'
  );
END
$$;
