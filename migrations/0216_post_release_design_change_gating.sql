-- Phase 8: additive post-release Design Control change gating.
ALTER TABLE engineering_releases
  ADD COLUMN IF NOT EXISTS predecessor_engineering_release_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS predecessor_baseline_id uuid REFERENCES engineering_release_baselines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authorizing_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authorizing_ecr_revision_id uuid REFERENCES engineering_change_request_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authorizing_ecr_checksum text,
  ADD COLUMN IF NOT EXISTS authorizing_ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authorizing_ecn_revision_id uuid REFERENCES engineering_change_notice_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authorizing_ecn_checksum text,
  ADD COLUMN IF NOT EXISTS release_sequence integer,
  ADD COLUMN IF NOT EXISTS release_type text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS release_reason text,
  ADD COLUMN IF NOT EXISTS effectivity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS released_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS released_by_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS release_checksum text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS evidence_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS engineering_releases_record_sequence_unique
  ON engineering_releases(rd_project_id, design_control_record_id, release_sequence)
  WHERE release_sequence IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS engineering_releases_predecessor_successor_unique
  ON engineering_releases(predecessor_engineering_release_id)
  WHERE predecessor_engineering_release_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS engineering_releases_authorizing_ecn_unique
  ON engineering_releases(authorizing_ecn_id)
  WHERE authorizing_ecn_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS engineering_releases_idempotency_unique
  ON engineering_releases(rd_project_id, idempotency_fingerprint)
  WHERE idempotency_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS design_control_step_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_control_step_id uuid NOT NULL REFERENCES design_control_steps(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  generation_number integer NOT NULL,
  generation_status text NOT NULL DEFAULT 'REOPENED',
  predecessor_generation_id uuid REFERENCES design_control_step_generations(id) ON DELETE RESTRICT,
  source_baseline_item_id uuid REFERENCES engineering_release_baseline_items(id) ON DELETE RESTRICT,
  authorizing_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  authorizing_ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  content_version_id uuid REFERENCES design_control_step_content_versions(id) ON DELETE RESTRICT,
  project_form_instance_id uuid REFERENCES project_form_instances(id) ON DELETE RESTRICT,
  form_revision_not_required boolean NOT NULL DEFAULT false,
  form_reuse_justification text,
  form_reuse_approval_id uuid,
  reopened_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  reopened_by_snapshot jsonb,
  reopened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  immutable_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_control_step_id, generation_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS design_control_step_generations_active_unique
  ON design_control_step_generations(design_control_step_id)
  WHERE generation_status IN ('REOPENED','IN_PROGRESS','SUBMITTED','APPROVED');

CREATE TABLE IF NOT EXISTS engineering_release_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL,
  design_control_record_id uuid NOT NULL,
  ecn_id uuid,
  actor_user_id integer,
  actor_snapshot jsonb,
  idempotency_hash text,
  request_fingerprint text,
  outcome text NOT NULL,
  blocking_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  resulting_release_id uuid,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engineering_release_attempts_scope_idx
  ON engineering_release_attempts(rd_project_id, design_control_record_id, occurred_at);

CREATE TABLE IF NOT EXISTS engineering_release_change_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineering_release_id uuid NOT NULL REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  source_record_id text,
  source_revision_id text,
  source_checksum text,
  immutable_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engineering_release_id, evidence_type, source_record_id)
);

CREATE OR REPLACE FUNCTION prevent_phase8_release_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Released Phase 8 evidence is immutable';
END $$;

DROP TRIGGER IF EXISTS phase8_release_no_update_delete ON engineering_releases;
CREATE TRIGGER phase8_release_no_update_delete BEFORE UPDATE OR DELETE
ON engineering_releases FOR EACH ROW
WHEN (OLD.release_status = 'RELEASED' AND OLD.release_type IN ('INITIAL','CHANGE_RELEASE'))
EXECUTE FUNCTION prevent_phase8_release_evidence_mutation();

DROP TRIGGER IF EXISTS phase8_baseline_no_update_delete ON engineering_release_baselines;
CREATE TRIGGER phase8_baseline_no_update_delete BEFORE UPDATE OR DELETE
ON engineering_release_baselines FOR EACH ROW
WHEN (OLD.baseline_status = 'LOCKED')
EXECUTE FUNCTION prevent_phase8_release_evidence_mutation();

DROP TRIGGER IF EXISTS phase8_baseline_item_no_update_delete ON engineering_release_baseline_items;
CREATE TRIGGER phase8_baseline_item_no_update_delete BEFORE UPDATE OR DELETE
ON engineering_release_baseline_items FOR EACH ROW
EXECUTE FUNCTION prevent_phase8_release_evidence_mutation();

DROP TRIGGER IF EXISTS phase8_release_approval_no_update_delete ON engineering_release_approvals;
CREATE TRIGGER phase8_release_approval_no_update_delete BEFORE UPDATE OR DELETE
ON engineering_release_approvals FOR EACH ROW
EXECUTE FUNCTION prevent_phase8_release_evidence_mutation();

DROP TRIGGER IF EXISTS phase8_change_evidence_no_update_delete ON engineering_release_change_evidence;
CREATE TRIGGER phase8_change_evidence_no_update_delete BEFORE UPDATE OR DELETE
ON engineering_release_change_evidence FOR EACH ROW
EXECUTE FUNCTION prevent_phase8_release_evidence_mutation();
