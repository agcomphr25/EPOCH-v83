-- Backfill shipped_date for FULFILLED orders that have a shipping_completed_at timestamp
-- but no shipped_date set.
--
-- Root cause: the /progress route set shippingCompletedAt and status = 'FULFILLED' when
-- an order exited the Shipping department, but never wrote shipped_date. The shipping
-- tracker query requires shipped_date IS NOT NULL, so all orders fulfilled through the
-- normal production flow were invisible on the tracker.
--
-- This migration sets shipped_date = shipping_completed_at for all affected rows.
-- Idempotent: safe to re-run because the WHERE clause targets only rows where
-- shipped_date is still NULL.

UPDATE all_orders
SET shipped_date = shipping_completed_at
WHERE status = 'FULFILLED'
  AND shipped_date IS NULL
  AND shipping_completed_at IS NOT NULL;
