ALTER TABLE p2_purchase_orders
  ADD COLUMN IF NOT EXISTS contract_review_role TEXT NOT NULL DEFAULT 'secondary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'p2_purchase_orders_contract_review_role_check'
  ) THEN
    ALTER TABLE p2_purchase_orders
      ADD CONSTRAINT p2_purchase_orders_contract_review_role_check
      CHECK (contract_review_role IN ('primary', 'secondary'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE p2_purchase_orders
  VALIDATE CONSTRAINT p2_purchase_orders_contract_review_role_check;
