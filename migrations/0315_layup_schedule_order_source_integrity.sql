-- Layup schedules can contain either legacy production_queue orders or
-- purchase-order-backed production_orders. The original single-table foreign
-- key rejects valid P1 PO units. Replace it with an equivalent union-source
-- integrity trigger so neither valid source is weakened.

ALTER TABLE layup_schedule
  DROP CONSTRAINT IF EXISTS layup_schedule_order_id_production_queue_order_id_fk;

CREATE OR REPLACE FUNCTION validate_layup_schedule_order_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM production_queue
    WHERE order_id = NEW.order_id
  ) OR EXISTS (
    SELECT 1
    FROM production_orders
    WHERE order_id = NEW.order_id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'layup schedule order % does not exist in production_queue or production_orders',
    NEW.order_id
    USING ERRCODE = '23503';
END;
$$;

DROP TRIGGER IF EXISTS layup_schedule_order_source_guard ON layup_schedule;

CREATE CONSTRAINT TRIGGER layup_schedule_order_source_guard
AFTER INSERT OR UPDATE OF order_id ON layup_schedule
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION validate_layup_schedule_order_source();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM layup_schedule schedule
    WHERE NOT EXISTS (
      SELECT 1 FROM production_queue queue_order
      WHERE queue_order.order_id = schedule.order_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM production_orders po_order
        WHERE po_order.order_id = schedule.order_id
      )
  ) THEN
    RAISE EXCEPTION
      'layup_schedule contains an order_id with no authoritative source';
  END IF;
END;
$$;
