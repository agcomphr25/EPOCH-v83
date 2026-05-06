-- 0102_traveler_off_system_completion_link.sql
-- Task #106 — First-class, editable off-system completion link for travelers.
--
-- Background:
--   When the P2 Production Queue marks an item as "completed off-system",
--   the operator's notes (often a URL to the scanned paper traveler) were
--   only persisted by being concatenated into `travelers.work_order_id` as
--   `Off-system: <notes>` and truncated to 100 chars.  There was no way to
--   edit that link from Traveler Management.
--
-- Fix:
--   1. Add a dedicated, non-truncated `off_system_completion_link` column.
--   2. Backfill the new column for existing off-system travelers by copying
--      the trailing portion of `work_order_id` after the `Off-system: `
--      prefix.  Done idempotently (only when the new column is still NULL).

ALTER TABLE public.travelers
  ADD COLUMN IF NOT EXISTS off_system_completion_link TEXT;

UPDATE public.travelers
SET off_system_completion_link = substring(work_order_id FROM 13)
WHERE off_system_completion_link IS NULL
  AND work_order_id IS NOT NULL
  AND work_order_id LIKE 'Off-system: %';
