-- Fix P1 PO duplicate order gap
-- Adds a unique constraint on all_orders.order_id, deduplicating first.
-- Idempotent — safe to re-run.

-- Step 1: Remove duplicate rows using a CTE (keeps the latest record per order_id,
-- i.e. the highest id). Uses ROW_NUMBER to avoid the NOT IN + NULL pitfall.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY id DESC) AS rn
  FROM all_orders
  WHERE order_id IS NOT NULL
)
DELETE FROM all_orders
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 2: Add unique constraint on order_id (idempotent via IF NOT EXISTS on index)
CREATE UNIQUE INDEX IF NOT EXISTS all_orders_order_id_unique
  ON all_orders (order_id);
