-- Make the composite project/launch identity an explicit table constraint.
-- PostgreSQL accepts the pre-existing unique index as an FK target, but schema
-- diff publishers may not order a standalone index ahead of the dependent FK.
-- The named constraint exposes that dependency without changing any data.

DO $$
BEGIN
  IF to_regclass('public.project_production_launches') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'project_production_launches'::regclass
      AND conname = 'project_production_launches_id_project_key'
      AND contype = 'u'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS project_production_launches_id_project_key
      ON project_production_launches(id, project_id);

    ALTER TABLE project_production_launches
      ADD CONSTRAINT project_production_launches_id_project_key
      UNIQUE USING INDEX project_production_launches_id_project_key;
  END IF;
END $$;
