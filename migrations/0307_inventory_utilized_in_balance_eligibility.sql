ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS utilized_in_non_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS utilized_in_customer_supplied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION enforce_inventory_balance_eligibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_non_inventory boolean;
  item_service boolean;
BEGIN
  SELECT
    COALESCE(utilized_in_non_inventory, false),
    COALESCE(utilized_in_services, false) OR lower(trim(COALESCE(type, ''))) IN ('service', 'services')
  INTO item_non_inventory, item_service
  FROM inventory_items
  WHERE ag_part_number = NEW.ag_part_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist', NEW.ag_part_number
      USING ERRCODE = '23503';
  END IF;
  IF item_non_inventory THEN
    RAISE EXCEPTION 'Non-Inventory item % is not eligible for an inventory balance', NEW.ag_part_number
      USING ERRCODE = '23514';
  END IF;
  IF item_service THEN
    RAISE EXCEPTION 'Service item % is not eligible for an inventory balance', NEW.ag_part_number
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_balances_eligibility_guard ON inventory_balances;
CREATE TRIGGER inventory_balances_eligibility_guard
BEFORE INSERT OR UPDATE OF ag_part_number ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_balance_eligibility();

-- Existing balances and history are intentionally preserved. The trigger only
-- prevents prospective creation/re-keying of ineligible balance rows.
