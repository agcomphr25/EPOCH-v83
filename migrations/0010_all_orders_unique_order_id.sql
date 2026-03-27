-- Fix P1 PO duplicate order gap
-- Adds a unique constraint on all_orders.order_id, deduplicating first.
-- Idempotent — safe to re-run.

-- Step 1: Remove duplicate rows, keeping the earliest record (lowest id) per order_id
DELETE FROM all_orders
WHERE id NOT IN (
  SELECT MIN(id)
  FROM all_orders
  GROUP BY order_id
);

-- Step 2: Add unique constraint on order_id (idempotent via IF NOT EXISTS on index)
CREATE UNIQUE INDEX IF NOT EXISTS all_orders_order_id_unique
  ON all_orders (order_id);
