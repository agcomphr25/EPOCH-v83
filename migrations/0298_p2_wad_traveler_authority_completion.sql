-- Phase 4 completion: lifecycle, optimistic concurrency, audit, and immutable release evidence.
-- Additive and prospective. No historical decision, WAD, traveler, or work-order is rewritten.
ALTER TABLE p2_wad_traveler_decisions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS concurrency_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by INTEGER,
  ADD COLUMN IF NOT EXISTS validated_by_display_name TEXT;

DO $$ BEGIN
  ALTER TABLE p2_wad_traveler_decisions ADD CONSTRAINT p2_wad_traveler_decision_status_check
    CHECK (status IN ('DRAFT','EXCEPTION_PENDING','VALIDATED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS p2_wad_traveler_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES p2_wad_traveler_decisions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION p2_wad_traveler_decision_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status='VALIDATED' THEN
    RAISE EXCEPTION 'Validated WAD traveler decision snapshots are immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_wad_traveler_decision_immutable ON p2_wad_traveler_decisions;
CREATE TRIGGER p2_wad_traveler_decision_immutable BEFORE UPDATE OR DELETE
  ON p2_wad_traveler_decisions FOR EACH ROW EXECUTE FUNCTION p2_wad_traveler_decision_immutable();
