-- Fix orders incorrectly showing FINALIZED status while in a production department.
--
-- Root cause: The status field is set to 'FINALIZED' at order creation and is only
-- reliably flipped to 'IN_PROGRESS' by the standard front-end action. Other code
-- paths that move orders to departments (e.g. layup scheduler, bulk moves) did not
-- always update the status field, leaving a mismatch between where an order
-- physically is and what its status says.
--
-- This migration updates all orders in real production departments that are still
-- showing FINALIZED to IN_PROGRESS. Initial-queue departments ('P1 Production Queue'
-- and 'Shipping QC') are excluded because orders legitimately sit there as FINALIZED
-- before production work begins.
--
-- Idempotent: re-running is safe — WHERE clause only targets affected rows.

UPDATE all_orders
SET
  status     = 'IN_PROGRESS',
  updated_at = NOW()
WHERE status = 'FINALIZED'
  AND current_department IS NOT NULL
  AND current_department NOT IN ('P1 Production Queue', 'Shipping QC');
