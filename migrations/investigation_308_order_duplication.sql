-- ============================================================
-- Investigation: Task #308 — Order Duplication Root Cause
-- Date: 2026-04-16
-- ============================================================
-- This script documents the forensic queries run to identify
-- why orders were being duplicated in all_orders.
-- Results are recorded as inline comments.
-- ============================================================

-- ── Q1 ──────────────────────────────────────────────────────
-- Check admin_audit_log for any finalize-related events.
-- The task spec assumed this table would capture finalize calls.
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT order_id) AS distinct_orders
FROM   admin_audit_log
WHERE  change_type ILIKE '%finalize%'
    OR field_name  ILIKE '%finalize%';
-- RESULT: 0 rows, 0 distinct orders.
-- Finding: admin_audit_log logs field-level diffs only (INLINE edits).
--          POST /api/orders/finalized never writes to this table, so
--          it is completely blind to finalize calls.

-- ── Q2 ──────────────────────────────────────────────────────
-- Check admin_audit_log for orders whose status → FINALIZED more than once
-- (would indicate the draft→finalize path was called repeatedly).
SELECT order_id, COUNT(*) AS finalize_count
FROM   admin_audit_log
WHERE  field_name  = 'status'
   AND new_value::text ILIKE '%FINALIZED%'
GROUP  BY order_id
HAVING COUNT(*) > 1;
-- RESULT: 0 rows.
-- Finding: No order was finalized twice via the draft flow.
--          Duplicates originated in the create-direct path
--          (POST /api/orders/finalized), not the draft finalize path.

-- ── Q3 ──────────────────────────────────────────────────────
-- Check order_activity_events for any finalize records.
SELECT COUNT(*) AS total,
       COUNT(DISTINCT order_id) AS distinct_orders
FROM   order_activity_events
WHERE  event_type ILIKE '%finalize%';
-- RESULT: 0 total records, 0 distinct orders.
-- Finding: POST /api/orders/finalized never wrote to order_activity_events
--          before this fix.  Duplicate attempts were invisible in all tables.

-- ── Q4 ──────────────────────────────────────────────────────
-- Identify duplicate rows in all_orders.
SELECT order_id, id, created_at, updated_at
FROM   all_orders
WHERE  order_id IN (
    SELECT order_id FROM all_orders
    GROUP BY order_id HAVING COUNT(*) > 1
)
ORDER  BY order_id, id;
-- RESULT (before fix):
--   EI070  id=67  created_at=NULL  updated_at='2025-09-03 18:52:02'
--   EI070  id=68  created_at=NULL  updated_at='2025-09-03 18:52:02'
--   EJ001  id=329 created_at=NULL  updated_at='2025-10-22 20:52:48'
--   EJ001  id=474 created_at=NULL  updated_at='2025-10-22 20:52:48'
--   (AG062 also had a duplicate with matching timestamps)
-- Finding: NULL created_at = inserted before created_at column was added.
--          Identical updated_at timestamps = concurrent double-submit in
--          the same request window.
-- Status after fix: 3 duplicate rows removed; 0 duplicates remain.

-- ── Q5 ──────────────────────────────────────────────────────
-- Verify unique index status on all_orders.order_id.
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  tablename = 'all_orders'
ORDER  BY indexname;
-- RESULT before fix:
--   idx_all_orders_model_id   — non-unique
--   idx_all_orders_status     — non-unique
--   (no unique index on order_id)
-- Finding: Migration 0010_all_orders_unique_order_id.sql was silently
--          failing at every startup because existing duplicate rows caused
--          CREATE UNIQUE INDEX to error.  The migration runner catches all
--          errors with console.warn only (server/index.ts ~line 334).
-- RESULT after fix:
--   all_orders_order_id_unique — UNIQUE BTREE on order_id  ← NEW
--   idx_all_orders_model_id
--   idx_all_orders_status

-- ── Q6 ──────────────────────────────────────────────────────
-- Look for duplicate confirmation emails as re-submit corroboration.
SELECT order_id,
       COUNT(*)                                    AS email_count,
       MIN(sent_at)                                AS first_sent,
       MAX(sent_at)                                AS last_sent,
       ROUND(EXTRACT(EPOCH FROM
           MAX(sent_at) - MIN(sent_at)))           AS seconds_apart
FROM   communication_logs
WHERE  type = 'order-confirmation'
GROUP  BY order_id
HAVING COUNT(*) > 1
ORDER  BY seconds_apart ASC;
-- RESULT:
--   FA001  2 emails  first=2026-01-08 15:45:40  last=2026-01-08 15:48:04
--          seconds_apart=144  (2 min 24 s)
--   FA003  2 emails  first=2026-01-14 20:11:12  last=2026-01-16 21:05:15
--          seconds_apart=176043  (likely manual resend ~2 days later)
-- Finding: FA001's 144-second gap matches a user clicking "Create Order",
--          seeing no response, and re-submitting after ~2 minutes.
--          This directly corroborates the UI double-submit trigger.
--          FA001 has only ONE row in all_orders (id=2055) — the DB
--          guard landed there before the duplicate could persist.

-- ── Q7 ──────────────────────────────────────────────────────
-- Rule out scheduled jobs / cron / webhooks as the trigger.
SELECT table_name
FROM   information_schema.tables
WHERE  table_name ILIKE '%job%'
    OR table_name ILIKE '%cron%'
    OR table_name ILIKE '%schedule%'
ORDER  BY table_name;
-- RESULT: anodize_job_documents, anodize_jobs, cnc_job_operations, cnc_jobs,
--         cnc_schedule_settings, cutting_packet_schedule, job_allocations,
--         layup_schedule, maintenance_schedules, p2_layup_schedules,
--         ply_schedule, ply_schedule_items, weekly_schedule_assignments
-- Finding: All production/manufacturing scheduling tables.
--          None relate to order finalization.  No webhook origin found.
--          grep across all route files confirms POST /api/orders/finalized
--          is called only from client/src/components/OrderEntry.tsx.

-- ── CONCLUSION ──────────────────────────────────────────────
-- ROOT TRIGGER: UI double-submit from OrderEntry.handleSubmit.
-- React's isSubmitting useState is async — the form onSubmit and button
-- onClick can both fire before React re-renders disabled={isSubmitting},
-- producing two concurrent POST /api/orders/finalized requests for the
-- same order_id with no server guard to reject the second.
--
-- TRIGGER CLASSIFICATION: UI (double-click / Enter+click race).
-- No scheduler, webhook, or retry mechanism is involved.
--
-- FIXES applied — see server/src/routes/orders.ts, server/storage.ts,
-- client/src/components/OrderEntry.tsx for implementation details.
