CREATE TABLE IF NOT EXISTS engineering_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  engineering_baseline_id uuid NOT NULL REFERENCES engineering_release_baselines(id) ON DELETE RESTRICT,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  package_number text NOT NULL,
  package_revision text NOT NULL,
  package_status text NOT NULL DEFAULT 'LOCKED',
  product_name text NOT NULL,
  locked_at timestamp,
  locked_by text,
  package_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  contents_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT engineering_packages_release_unique UNIQUE (engineering_release_id),
  CONSTRAINT engineering_packages_number_unique UNIQUE (package_number)
);

CREATE INDEX IF NOT EXISTS engineering_packages_rd_project_id_idx
  ON engineering_packages(rd_project_id);

CREATE INDEX IF NOT EXISTS engineering_packages_design_control_record_id_idx
  ON engineering_packages(design_control_record_id);

CREATE INDEX IF NOT EXISTS engineering_packages_baseline_id_idx
  ON engineering_packages(engineering_baseline_id);

CREATE INDEX IF NOT EXISTS engineering_packages_status_idx
  ON engineering_packages(package_status);

CREATE TABLE IF NOT EXISTS engineering_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_package_id uuid NOT NULL REFERENCES engineering_packages(id) ON DELETE CASCADE,
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  engineering_baseline_item_id uuid REFERENCES engineering_release_baseline_items(id) ON DELETE SET NULL,
  package_category text NOT NULL,
  source_table text,
  source_module text,
  source_record_id text,
  source_revision text,
  source_status text,
  reference_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_checksum text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engineering_package_items_package_id_idx
  ON engineering_package_items(engineering_package_id);

CREATE INDEX IF NOT EXISTS engineering_package_items_release_id_idx
  ON engineering_package_items(engineering_release_id);

CREATE INDEX IF NOT EXISTS engineering_package_items_baseline_item_id_idx
  ON engineering_package_items(engineering_baseline_item_id);

CREATE INDEX IF NOT EXISTS engineering_package_items_source_idx
  ON engineering_package_items(source_table, source_record_id);
