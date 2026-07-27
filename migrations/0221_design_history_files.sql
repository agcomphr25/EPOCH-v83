-- Phase 10: immutable Design History File manifests and retained exports.
CREATE SEQUENCE IF NOT EXISTS design_history_file_number_seq;

CREATE TABLE IF NOT EXISTS design_history_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  dhf_number text NOT NULL UNIQUE,
  current_version integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT_MANIFEST',
  owner_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  owner_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_history_files_project_unique UNIQUE (rd_project_id),
  CONSTRAINT design_history_files_record_unique UNIQUE (design_control_record_id)
);

CREATE TABLE IF NOT EXISTS design_history_file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_history_file_id uuid NOT NULL REFERENCES design_history_files(id) ON DELETE RESTRICT,
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  release_baseline_id uuid NOT NULL REFERENCES engineering_release_baselines(id) ON DELETE RESTRICT,
  engineering_package_id uuid REFERENCES engineering_packages(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  release_revision text NOT NULL,
  release_sequence integer NOT NULL,
  predecessor_version_id uuid REFERENCES design_history_file_versions(id) ON DELETE RESTRICT,
  manifest_schema_version text NOT NULL,
  canonical_manifest jsonb NOT NULL,
  manifest_checksum text NOT NULL,
  item_count integer NOT NULL,
  generation_status text NOT NULL DEFAULT 'DRAFT_MANIFEST',
  generated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_by_snapshot jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  approval_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  superseded_by_version_id uuid REFERENCES design_history_file_versions(id) ON DELETE RESTRICT,
  retained_export_path text,
  retained_export_provider_key text,
  export_checksum text,
  export_size bigint,
  export_format text,
  exporter_version text,
  failure_details jsonb,
  locked_at timestamptz,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dhf_version_release_unique UNIQUE (engineering_release_id),
  CONSTRAINT dhf_version_number_unique UNIQUE (design_history_file_id,version_number),
  CONSTRAINT dhf_generation_status_check CHECK (
    generation_status IN ('DRAFT_MANIFEST','VALIDATING','COMPLETE','APPROVED','LOCKED','FAILED','SUPERSEDED')
  )
);

CREATE TABLE IF NOT EXISTS design_history_file_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_history_file_version_id uuid NOT NULL REFERENCES design_history_file_versions(id) ON DELETE RESTRICT,
  category text NOT NULL,
  evidence_type text NOT NULL,
  source_table text NOT NULL,
  source_record_id text NOT NULL,
  source_revision text,
  source_generation text,
  source_checksum text,
  display_number text,
  display_title text NOT NULL,
  lifecycle_status_snapshot text,
  baseline_relationship text NOT NULL,
  requirement_class text NOT NULL,
  inclusion_status text NOT NULL,
  omission_reason text,
  retained_artifact_path text,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dhf_item_order_unique UNIQUE (design_history_file_version_id,sort_order),
  CONSTRAINT dhf_item_requirement_check CHECK (
    requirement_class IN ('REQUIRED','CONDITIONALLY_REQUIRED','OPTIONAL','NOT_APPLICABLE_WITH_JUSTIFICATION')
  )
);

CREATE TABLE IF NOT EXISTS design_history_file_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_history_file_version_id uuid NOT NULL REFERENCES design_history_file_versions(id) ON DELETE RESTRICT,
  export_attempt integer NOT NULL,
  export_status text NOT NULL,
  staged_path text,
  retained_path text,
  provider_key text,
  sha256_checksum text,
  byte_size bigint,
  format text NOT NULL DEFAULT 'ZIP',
  exporter_version text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  failure_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT dhf_export_attempt_unique UNIQUE (design_history_file_version_id,export_attempt)
);

CREATE TABLE IF NOT EXISTS design_history_file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_history_file_id uuid NOT NULL REFERENCES design_history_files(id) ON DELETE RESTRICT,
  design_history_file_version_id uuid REFERENCES design_history_file_versions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  before_values jsonb,
  after_values jsonb,
  manifest_checksum text,
  export_checksum text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dhf_versions_dhf_idx ON design_history_file_versions(design_history_file_id,version_number);
CREATE INDEX IF NOT EXISTS dhf_items_version_idx ON design_history_file_items(design_history_file_version_id,sort_order);
CREATE INDEX IF NOT EXISTS dhf_events_version_idx ON design_history_file_events(design_history_file_version_id,occurred_at);

ALTER TABLE engineering_packages ADD COLUMN IF NOT EXISTS dhf_version_id uuid REFERENCES design_history_file_versions(id) ON DELETE RESTRICT;
ALTER TABLE engineering_packages ADD COLUMN IF NOT EXISTS package_checksum text;
ALTER TABLE engineering_package_items ADD COLUMN IF NOT EXISTS evidence_class text;
ALTER TABLE engineering_package_items ADD COLUMN IF NOT EXISTS retained_artifact_path text;
ALTER TABLE engineering_release_baselines ADD COLUMN IF NOT EXISTS baseline_checksum text;

CREATE OR REPLACE FUNCTION prevent_locked_dhf_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.generation_status = 'SUPERSEDED'
     OR (OLD.generation_status = 'LOCKED' AND NOT (
       NEW.generation_status = 'SUPERSEDED'
       AND NEW.superseded_by_version_id IS NOT NULL
     )) THEN
    RAISE EXCEPTION 'Locked Design History File evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dhf_version_immutable ON design_history_file_versions;
CREATE TRIGGER dhf_version_immutable BEFORE UPDATE OR DELETE ON design_history_file_versions
FOR EACH ROW EXECUTE FUNCTION prevent_locked_dhf_mutation();

CREATE OR REPLACE FUNCTION prevent_dhf_item_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM design_history_file_versions
    WHERE id=OLD.design_history_file_version_id AND generation_status IN ('LOCKED','SUPERSEDED')
  ) THEN RAISE EXCEPTION 'Locked Design History File items are immutable'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS dhf_item_immutable ON design_history_file_items;
CREATE TRIGGER dhf_item_immutable BEFORE UPDATE OR DELETE ON design_history_file_items
FOR EACH ROW EXECUTE FUNCTION prevent_dhf_item_mutation();

CREATE OR REPLACE FUNCTION prevent_dhf_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Design History File events are append-only'; END $$;
DROP TRIGGER IF EXISTS dhf_event_immutable ON design_history_file_events;
CREATE TRIGGER dhf_event_immutable BEFORE UPDATE OR DELETE ON design_history_file_events
FOR EACH ROW EXECUTE FUNCTION prevent_dhf_event_mutation();
