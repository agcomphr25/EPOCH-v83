-- This is the forward-only Phase 8C launch-safety correction.
-- The merged 0210 migration is intentionally left byte-for-byte unchanged.
-- Every operation is additive and safe when the original tables already exist.

DO $$
BEGIN
  IF to_regclass('public.project_preproduction_readiness_reviews') IS NULL
     OR to_regclass('public.project_production_releases') IS NULL
     OR to_regclass('public.project_production_launches') IS NULL THEN
    RAISE EXCEPTION
      'Phase 8C base tables are missing; run 0210_project_preproduction_readiness.sql first';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_preproduction_readiness_id_project_unique
  ON project_preproduction_readiness_reviews(id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS project_production_releases_id_project_unique
  ON project_production_releases(id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'project_production_releases'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid)
        LIKE 'FOREIGN KEY (readiness_review_id, project_id)%'
  ) THEN
    ALTER TABLE project_production_releases
      ADD CONSTRAINT project_production_releases_readiness_project_fkey
      FOREIGN KEY (readiness_review_id, project_id)
      REFERENCES project_preproduction_readiness_reviews(id, project_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'project_production_launches'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid)
        LIKE 'FOREIGN KEY (production_release_id, project_id)%'
  ) THEN
    ALTER TABLE project_production_launches
      ADD CONSTRAINT project_production_launches_release_project_fkey
      FOREIGN KEY (production_release_id, project_id)
      REFERENCES project_production_releases(id, project_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'project_production_launches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%COMPLETE%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%FAILED%'
  ) THEN
    ALTER TABLE project_production_launches
      ADD CONSTRAINT project_production_launches_complete_only_check
      CHECK (status = 'COMPLETE') NOT VALID;
  END IF;
END $$;
