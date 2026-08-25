-- Phase 4 authority correction: explicit batch coverage, employee attribution,
-- and database immutability for released WAD authorizations.
-- Additive and prospective; no historical rows are updated or reinterpreted.
ALTER TABLE p2_wad_traveler_decisions
  ADD COLUMN IF NOT EXISTS batch_approved_quantity NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS batch_coverage_scope TEXT,
  ADD COLUMN IF NOT EXISTS created_by_employee_id INTEGER,
  ADD COLUMN IF NOT EXISTS validated_by_employee_id INTEGER;

ALTER TABLE p2_wad_traveler_decision_events
  ADD COLUMN IF NOT EXISTS actor_employee_id INTEGER;

DO $$ BEGIN
  ALTER TABLE p2_wad_traveler_decisions
    ADD CONSTRAINT p2_wad_traveler_batch_coverage_check CHECK (
      traveler_type <> 'BATCH' OR (
        batch_approved_quantity IS NOT NULL AND
        batch_approved_quantity > 0 AND
        batch_approved_quantity >= required_quantity AND
        batch_coverage_scope IS NOT NULL AND
        btrim(batch_coverage_scope) <> ''
      )
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION p2_released_wad_authorization_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('RELEASED','SUPERSEDED') THEN
    RAISE EXCEPTION 'Released WAD authorization evidence is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'RELEASED' THEN
    IF NEW.status = 'SUPERSEDED' AND
       (to_jsonb(NEW) - ARRAY['status','superseded_at','superseded_by_authorization_id','updated_at']) =
       (to_jsonb(OLD) - ARRAY['status','superseded_at','superseded_by_authorization_id','updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Released WAD authorization evidence is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SUPERSEDED' THEN
    IF (to_jsonb(NEW) - ARRAY['superseded_by_authorization_id','updated_at']) =
       (to_jsonb(OLD) - ARRAY['superseded_by_authorization_id','updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Superseded WAD authorization evidence is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS p2_released_wad_authorization_immutable
  ON project_wad_authorizations;
CREATE TRIGGER p2_released_wad_authorization_immutable
  BEFORE UPDATE OR DELETE ON project_wad_authorizations
  FOR EACH ROW EXECUTE FUNCTION p2_released_wad_authorization_immutable();
