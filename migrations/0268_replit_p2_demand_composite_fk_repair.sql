-- Replace the P2 demand composite FK with trigger-based relational integrity.
-- Replit generated the local columns in physical table order while retaining
-- the referenced unique-key order, producing an invalid crossed-type FK.
ALTER TABLE p2_customer_demand_quantity_events
  DROP CONSTRAINT IF EXISTS p2_demand_event_item_identity_fk;

CREATE OR REPLACE FUNCTION validate_p2_demand_event_item_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM p2_purchase_order_items item
    WHERE item.id = NEW.po_item_id
      AND item.demand_line_identity = NEW.demand_line_identity
  ) THEN
    RAISE EXCEPTION 'P2 demand event item identity does not match purchase-order item %', NEW.po_item_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p2_demand_event_item_identity_validate
  ON p2_customer_demand_quantity_events;
CREATE TRIGGER p2_demand_event_item_identity_validate
BEFORE INSERT OR UPDATE OF po_item_id, demand_line_identity
ON p2_customer_demand_quantity_events
FOR EACH ROW EXECUTE FUNCTION validate_p2_demand_event_item_identity();

CREATE OR REPLACE FUNCTION protect_p2_po_item_demand_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.demand_line_identity IS DISTINCT FROM OLD.demand_line_identity
     AND EXISTS (
       SELECT 1
       FROM p2_customer_demand_quantity_events event
       WHERE event.po_item_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'P2 purchase-order item demand identity is referenced by quantity events'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p2_po_item_demand_identity_protect
  ON p2_purchase_order_items;
CREATE TRIGGER p2_po_item_demand_identity_protect
BEFORE UPDATE OF demand_line_identity ON p2_purchase_order_items
FOR EACH ROW EXECUTE FUNCTION protect_p2_po_item_demand_identity();
