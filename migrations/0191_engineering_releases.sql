ALTER TABLE rd_projects
  ADD COLUMN IF NOT EXISTS engineering_status text NOT NULL DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS engineering_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  release_number text NOT NULL,
  release_revision text NOT NULL,
  release_status text NOT NULL DEFAULT 'RELEASED',
  product_name text NOT NULL,
  effective_date date,
  released_by text,
  released_at timestamp,
  readiness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT engineering_releases_record_revision_unique UNIQUE (rd_project_id, design_control_record_id, release_revision)
);

CREATE INDEX IF NOT EXISTS engineering_releases_rd_project_id_idx
  ON engineering_releases(rd_project_id);

CREATE INDEX IF NOT EXISTS engineering_releases_design_control_record_id_idx
  ON engineering_releases(design_control_record_id);

CREATE INDEX IF NOT EXISTS engineering_releases_release_status_idx
  ON engineering_releases(release_status);

CREATE TABLE IF NOT EXISTS engineering_release_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE CASCADE,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  baseline_status text NOT NULL DEFAULT 'LOCKED',
  baseline_revision text NOT NULL,
  locked_at timestamp,
  locked_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT engineering_release_baselines_release_unique UNIQUE (engineering_release_id)
);

CREATE INDEX IF NOT EXISTS engineering_release_baselines_rd_project_id_idx
  ON engineering_release_baselines(rd_project_id);

CREATE INDEX IF NOT EXISTS engineering_release_baselines_design_control_record_id_idx
  ON engineering_release_baselines(design_control_record_id);

CREATE TABLE IF NOT EXISTS engineering_release_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE CASCADE,
  baseline_id uuid NOT NULL REFERENCES engineering_release_baselines(id) ON DELETE CASCADE,
  baseline_category text NOT NULL,
  source_table text,
  source_module text,
  source_record_id text,
  source_revision text,
  source_status text,
  source_checksum text,
  immutable_snapshot_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engineering_release_baseline_items_release_id_idx
  ON engineering_release_baseline_items(engineering_release_id);

CREATE INDEX IF NOT EXISTS engineering_release_baseline_items_baseline_id_idx
  ON engineering_release_baseline_items(baseline_id);

CREATE INDEX IF NOT EXISTS engineering_release_baseline_items_source_idx
  ON engineering_release_baseline_items(source_table, source_record_id);

CREATE TABLE IF NOT EXISTS engineering_release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE CASCADE,
  approval_role text NOT NULL,
  approved_by text,
  approved_at timestamp,
  approval_status text NOT NULL DEFAULT 'APPROVED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT engineering_release_approvals_release_role_unique UNIQUE (engineering_release_id, approval_role)
);

CREATE INDEX IF NOT EXISTS engineering_release_approvals_release_id_idx
  ON engineering_release_approvals(engineering_release_id);
