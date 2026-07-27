-- Preserve both terminal launch outcomes declared by the Phase 8C base schema.
--
-- Migration 0212 added a COMPLETE-only check as NOT VALID. Existing FAILED
-- audit rows remained readable, but schema promotion tools still reject the
-- contradictory final schema because the base status check permits FAILED.
-- The partial unique index continues to enforce at most one COMPLETE launch
-- per project.

ALTER TABLE IF EXISTS project_production_launches
  DROP CONSTRAINT IF EXISTS project_production_launches_complete_only_check;
