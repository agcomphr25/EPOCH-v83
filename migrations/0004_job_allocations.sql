-- =============================================================================
-- JOB ALLOCATIONS TABLE
-- =============================================================================
-- Distributes a production job's labor cost across projects using relative units.
-- job_id references production_orders(id) INTEGER (serial).
-- project_id references projects(id) UUID.
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id integer NOT NULL,
  project_id uuid NOT NULL,
  allocation_percent numeric,
  allocation_units numeric,
  created_at timestamp DEFAULT now()
);

-- Add FK to production_orders if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_job_allocations_job'
      AND conrelid = 'job_allocations'::regclass
  ) THEN
    ALTER TABLE job_allocations
      ADD CONSTRAINT fk_job_allocations_job
      FOREIGN KEY (job_id) REFERENCES production_orders(id);
  END IF;
END $$;

-- Add FK to projects if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_job_allocations_project'
      AND conrelid = 'job_allocations'::regclass
  ) THEN
    ALTER TABLE job_allocations
      ADD CONSTRAINT fk_job_allocations_project
      FOREIGN KEY (project_id) REFERENCES projects(id);
  END IF;
END $$;
