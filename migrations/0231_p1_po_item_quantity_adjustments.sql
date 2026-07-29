-- Additive, immutable ledger for explicit customer-demand changes on P1 PO lines.
-- Production-unit cancellations remain operational history and are intentionally unrelated.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS purchase_order_item_quantity_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_item_id integer NOT NULL
    REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  adjustment_type text NOT NULL
    CHECK (adjustment_type IN ('CANCEL_QUANTITY', 'RESTORE_QUANTITY')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  source text,
  reference text,
  idempotency_key text,
  UNIQUE (purchase_order_item_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS po_item_quantity_adjustments_item_effective_idx
  ON purchase_order_item_quantity_adjustments
  (purchase_order_item_id, effective_at, created_at);

CREATE OR REPLACE FUNCTION reject_p1_po_item_quantity_adjustment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'purchase_order_item_quantity_adjustments rows are immutable; insert a compensating adjustment';
END;
$$;

DROP TRIGGER IF EXISTS p1_po_item_quantity_adjustments_no_update
  ON purchase_order_item_quantity_adjustments;
CREATE TRIGGER p1_po_item_quantity_adjustments_no_update
  BEFORE UPDATE ON purchase_order_item_quantity_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_p1_po_item_quantity_adjustment_mutation();

DROP TRIGGER IF EXISTS p1_po_item_quantity_adjustments_no_delete
  ON purchase_order_item_quantity_adjustments;
CREATE TRIGGER p1_po_item_quantity_adjustments_no_delete
  BEFORE DELETE ON purchase_order_item_quantity_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_p1_po_item_quantity_adjustment_mutation();
