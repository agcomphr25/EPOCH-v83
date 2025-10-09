-- Backfill Script: Move Unscheduled Orders from Layup Back to P1 Production Queue
-- 
-- This script fixes orders that were incorrectly placed in Layup/Plugging department
-- due to the old schema default. It moves orders back to P1 Production Queue unless
-- they have been explicitly scheduled in the layup_schedule table.
--
-- IMPORTANT: This script should be run on the PRODUCTION database using the database pane.
-- The Replit Agent cannot run this on production - you must do it manually.

-- Step 0: Fix column defaults for future inserts
ALTER TABLE all_orders ALTER COLUMN current_department SET DEFAULT 'P1 Production Queue';
ALTER TABLE orders ALTER COLUMN current_department SET DEFAULT 'P1 Production Queue';
ALTER TABLE order_drafts ALTER COLUMN current_department SET DEFAULT 'P1 Production Queue';

-- Step 1: Update all_orders table
-- Move orders from Layup to P1 Production Queue if they don't have a schedule entry
UPDATE all_orders
SET current_department = 'P1 Production Queue'
WHERE current_department IN ('Layup', 'Layup/Plugging')
  AND order_id NOT IN (
    SELECT DISTINCT order_id 
    FROM layup_schedule 
    WHERE order_id IS NOT NULL
  );

-- Step 2: Update legacy orders table  
-- Move orders from Layup to P1 Production Queue if they don't have a schedule entry
UPDATE orders
SET current_department = 'P1 Production Queue'
WHERE current_department IN ('Layup', 'Layup/Plugging')
  AND order_id NOT IN (
    SELECT DISTINCT order_id 
    FROM layup_schedule 
    WHERE order_id IS NOT NULL
  );

-- Step 3: Update order_drafts table (if needed)
-- Move draft orders from Layup to P1 Production Queue
UPDATE order_drafts
SET current_department = 'P1 Production Queue'
WHERE current_department IN ('Layup', 'Layup/Plugging');

-- Step 4: Verify the fix
-- This query should return the counts of orders moved
SELECT 
  'all_orders' as table_name,
  COUNT(*) as orders_in_p1_queue
FROM all_orders
WHERE current_department = 'P1 Production Queue'
UNION ALL
SELECT 
  'orders' as table_name,
  COUNT(*) as orders_in_p1_queue
FROM orders
WHERE current_department = 'P1 Production Queue'
UNION ALL
SELECT 
  'all_orders (in_layup_with_schedule)' as table_name,
  COUNT(*) as count
FROM all_orders
WHERE current_department IN ('Layup', 'Layup/Plugging')
  AND order_id IN (
    SELECT DISTINCT order_id 
    FROM layup_schedule 
    WHERE order_id IS NOT NULL
  );

-- Expected Results:
-- - orders_in_p1_queue should show all unscheduled orders
-- - in_layup_with_schedule should only show orders that have been explicitly scheduled
