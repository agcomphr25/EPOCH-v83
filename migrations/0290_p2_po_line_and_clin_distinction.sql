-- Keep the customer's PO line and government-contract CLIN/SLIN distinct.
-- PO lines remain the default invoice reference; CLIN/SLIN is optional and is
-- populated only when the customer provides that contract reference.

ALTER TABLE p2_purchase_order_items
  ADD COLUMN IF NOT EXISTS customer_clin text;
