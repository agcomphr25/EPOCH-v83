-- Phase 3: Drop the legacy punch_events table.
-- All live reads were eliminated in Phase 2. The table is now a dead artifact.
DROP TABLE IF EXISTS public.punch_events;
