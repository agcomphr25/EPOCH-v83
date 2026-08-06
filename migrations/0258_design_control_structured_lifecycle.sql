-- Additive Design Control structured lifecycle, traceability, final-review,
-- and prospective R&D project assignment controls.
-- No legacy project is enrolled and no existing row is modified.

CREATE TABLE IF NOT EXISTS design_control_project_access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE',
  row_version integer NOT NULL DEFAULT 1,
  activated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activated_by_display_name text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_project_access_policy_status_ck CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT dc_project_access_policy_record_project_uq UNIQUE (rd_project_id, design_control_record_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS dc_project_access_policy_active_uq
  ON design_control_project_access_policies(rd_project_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS design_control_project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES design_control_project_access_policies(id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  project_role text NOT NULL,
  responsibility_class text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE',
  row_version integer NOT NULL DEFAULT 1,
  assigned_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_display_name text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  revoked_by_display_name text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_project_assignment_role_ck CHECK (project_role IN ('DESIGN_AUTHORITY','PROJECT_MANAGER','QUALITY','MANUFACTURING','REVIEWER','CONTRIBUTOR','AUDITOR')),
  CONSTRAINT dc_project_assignment_status_ck CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  CONSTRAINT dc_project_assignment_revocation_ck CHECK ((status = 'ACTIVE' AND revoked_at IS NULL) OR (status <> 'ACTIVE' AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS dc_project_assignment_active_user_uq
  ON design_control_project_assignments(rd_project_id, user_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS dc_project_assignment_project_idx
  ON design_control_project_assignments(rd_project_id, status);

CREATE TABLE IF NOT EXISTS design_control_project_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES design_control_project_assignments(id) ON DELETE RESTRICT,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_display_name text NOT NULL,
  role_snapshot text NOT NULL,
  capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  prior_state jsonb,
  resulting_state jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_project_assignment_event_type_ck CHECK (event_type IN ('ASSIGNED','ROLE_CHANGED','REVOKED','ADMIN_OVERRIDE'))
);
CREATE INDEX IF NOT EXISTS dc_project_assignment_event_project_idx
  ON design_control_project_assignment_events(rd_project_id, occurred_at);

CREATE TABLE IF NOT EXISTS design_control_structured_record_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  record_type text NOT NULL,
  structured_record_id uuid NOT NULL,
  version integer NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  content_snapshot jsonb NOT NULL,
  content_checksum text NOT NULL,
  change_reason text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_by_role_snapshot text NOT NULL,
  created_by_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  submitted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_snapshot jsonb,
  supersedes_version_id uuid REFERENCES design_control_structured_record_versions(id) ON DELETE RESTRICT,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_structured_version_type_ck CHECK (record_type IN ('REQUIREMENT','RISK','REVIEW','VERIFICATION','VALIDATION')),
  CONSTRAINT dc_structured_version_status_ck CHECK (lifecycle_status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','RETURNED','SUPERSEDED')),
  CONSTRAINT dc_structured_version_number_ck CHECK (version > 0),
  CONSTRAINT dc_structured_version_record_uq UNIQUE (record_type, structured_record_id, version)
);
CREATE INDEX IF NOT EXISTS dc_structured_version_project_idx
  ON design_control_structured_record_versions(rd_project_id, record_type, lifecycle_status);
CREATE INDEX IF NOT EXISTS dc_structured_version_parent_idx
  ON design_control_structured_record_versions(structured_record_id, version DESC);

CREATE TABLE IF NOT EXISTS design_control_structured_record_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES design_control_structured_record_versions(id) ON DELETE RESTRICT,
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  approval_role_snapshot text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_comment text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_structured_decision_value_ck CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  CONSTRAINT dc_structured_decision_reason_ck CHECK (decision = 'APPROVED' OR length(btrim(coalesce(decision_comment, ''))) > 0),
  CONSTRAINT dc_structured_decision_actor_uq UNIQUE (version_id, actor_user_id, decision)
);
CREATE INDEX IF NOT EXISTS dc_structured_decision_project_idx
  ON design_control_structured_record_decisions(rd_project_id, signed_at);

CREATE TABLE IF NOT EXISTS design_control_structured_record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  source_record_type text NOT NULL,
  source_record_id uuid NOT NULL,
  target_record_type text NOT NULL,
  target_record_id text NOT NULL,
  relation_type text NOT NULL,
  target_revision text,
  target_status_snapshot text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_structured_link_source_type_ck CHECK (source_record_type IN ('REQUIREMENT','RISK','REVIEW','VERIFICATION','VALIDATION')),
  CONSTRAINT dc_structured_link_target_type_ck CHECK (target_record_type IN ('REQUIREMENT','RISK','REVIEW','REVIEW_ACTION','DESIGN_OUTPUT','CONFIGURATION_ITEM','PART_REVISION','VERIFICATION','VALIDATION','NCR','ECR','ECN','ENGINEERING_RELEASE')),
  CONSTRAINT dc_structured_link_uq UNIQUE (source_record_type, source_record_id, target_record_type, target_record_id, relation_type)
);
CREATE INDEX IF NOT EXISTS dc_structured_link_project_idx
  ON design_control_structured_record_links(rd_project_id, source_record_type);

CREATE TABLE IF NOT EXISTS design_control_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  review_record_id uuid NOT NULL,
  action_number text NOT NULL,
  description text NOT NULL,
  owner_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  owner_display_name text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  mandatory boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  closure_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  closure_approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  closure_approved_by_display_name text,
  closure_approved_at timestamptz,
  exception_version_id uuid REFERENCES design_control_structured_record_versions(id) ON DELETE RESTRICT,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_review_action_status_ck CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED','EXCEPTED')),
  CONSTRAINT dc_review_action_number_uq UNIQUE (review_record_id, action_number)
);
CREATE INDEX IF NOT EXISTS dc_review_action_project_idx
  ON design_control_review_actions(rd_project_id, status);

CREATE TABLE IF NOT EXISTS design_control_traceability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  snapshot_status text NOT NULL DEFAULT 'LOCKED',
  matrix_snapshot jsonb NOT NULL,
  matrix_checksum text NOT NULL,
  captured_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  captured_by_display_name text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_trace_snapshot_status_ck CHECK (snapshot_status = 'LOCKED')
);
CREATE INDEX IF NOT EXISTS dc_trace_snapshot_record_idx
  ON design_control_traceability_snapshots(design_control_record_id, captured_at);

CREATE TABLE IF NOT EXISTS design_control_final_review_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  requirement_key text NOT NULL,
  justification text NOT NULL,
  risk_statement text NOT NULL,
  approving_authority_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approving_authority_display_name text NOT NULL,
  approving_role_snapshot text NOT NULL,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz,
  follow_up_action text,
  status text NOT NULL DEFAULT 'APPROVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_final_review_exception_status_ck CHECK (status IN ('APPROVED','EXPIRED','REVOKED'))
);
CREATE INDEX IF NOT EXISTS dc_final_review_exception_record_idx
  ON design_control_final_review_exceptions(design_control_record_id, status);

CREATE TABLE IF NOT EXISTS design_control_final_review_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  traceability_snapshot_id uuid NOT NULL REFERENCES design_control_traceability_snapshots(id) ON DELETE RESTRICT,
  review_record_id uuid NOT NULL,
  review_version_id uuid NOT NULL REFERENCES design_control_structured_record_versions(id) ON DELETE RESTRICT,
  readiness_status text NOT NULL,
  readiness_snapshot jsonb NOT NULL,
  readiness_checksum text NOT NULL,
  approved_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_display_name text NOT NULL,
  approved_role_snapshot text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dc_final_review_snapshot_status_ck CHECK (readiness_status = 'COMPLETE'),
  CONSTRAINT dc_final_review_snapshot_review_uq UNIQUE (review_version_id)
);
CREATE INDEX IF NOT EXISTS dc_final_review_snapshot_record_idx
  ON design_control_final_review_snapshots(design_control_record_id, approved_at);

ALTER TABLE engineering_releases
  ADD COLUMN IF NOT EXISTS final_review_snapshot_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engineering_release_final_review_snapshot_fk'
  ) THEN
    ALTER TABLE engineering_releases
      ADD CONSTRAINT engineering_release_final_review_snapshot_fk
      FOREIGN KEY (final_review_snapshot_id)
      REFERENCES design_control_final_review_snapshots(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS engineering_release_final_review_snapshot_idx
  ON engineering_releases(final_review_snapshot_id);

CREATE OR REPLACE FUNCTION prevent_dc_structured_immutable_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Design Control evidence in % is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dc_structured_version_delete_guard ON design_control_structured_record_versions;
CREATE TRIGGER dc_structured_version_delete_guard
BEFORE DELETE ON design_control_structured_record_versions
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();

DROP TRIGGER IF EXISTS dc_structured_decision_immutable ON design_control_structured_record_decisions;
CREATE TRIGGER dc_structured_decision_immutable
BEFORE UPDATE OR DELETE ON design_control_structured_record_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();

DROP TRIGGER IF EXISTS dc_assignment_event_immutable ON design_control_project_assignment_events;
CREATE TRIGGER dc_assignment_event_immutable
BEFORE UPDATE OR DELETE ON design_control_project_assignment_events
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();

DROP TRIGGER IF EXISTS dc_trace_snapshot_immutable ON design_control_traceability_snapshots;
CREATE TRIGGER dc_trace_snapshot_immutable
BEFORE UPDATE OR DELETE ON design_control_traceability_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();

DROP TRIGGER IF EXISTS dc_final_review_snapshot_immutable ON design_control_final_review_snapshots;
CREATE TRIGGER dc_final_review_snapshot_immutable
BEFORE UPDATE OR DELETE ON design_control_final_review_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();

DROP TRIGGER IF EXISTS dc_final_review_exception_immutable ON design_control_final_review_exceptions;
CREATE TRIGGER dc_final_review_exception_immutable
BEFORE UPDATE OR DELETE ON design_control_final_review_exceptions
FOR EACH ROW EXECUTE FUNCTION prevent_dc_structured_immutable_mutation();
