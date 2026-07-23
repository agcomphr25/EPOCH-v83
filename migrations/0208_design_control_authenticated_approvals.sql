-- Phase 2B: authenticated, append-only Design Control approval evidence.
-- Existing JSON approval booleans are preserved as legacy-unverified evidence.

ALTER TABLE IF EXISTS design_control_steps
  ADD COLUMN IF NOT EXISTS current_content_version_id uuid,
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'LEGACY_BOOLEAN',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id integer,
  ADD COLUMN IF NOT EXISTS submitted_by_snapshot jsonb;

CREATE TABLE IF NOT EXISTS design_control_step_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  design_control_step_id uuid NOT NULL REFERENCES design_control_steps(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  content_version integer NOT NULL,
  content_checksum text NOT NULL,
  content_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  change_reason text NOT NULL,
  superseded_by_version_id uuid,
  submitted_at timestamptz,
  submitted_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_snapshot jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_control_step_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  design_control_step_id uuid NOT NULL REFERENCES design_control_steps(id) ON DELETE RESTRICT,
  step_key text NOT NULL,
  step_content_version_id uuid NOT NULL REFERENCES design_control_step_content_versions(id) ON DELETE RESTRICT,
  approved_content_checksum text NOT NULL,
  approval_key text NOT NULL,
  approval_label_snapshot text NOT NULL,
  required_capability_snapshot text NOT NULL,
  required_roles_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL,
  signature_meaning text NOT NULL,
  decision_comment text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_username_snapshot text NOT NULL,
  actor_display_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  actor_capabilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'VALID',
  invalidated_at timestamptz,
  invalidated_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  invalidated_by_snapshot jsonb,
  invalidation_reason text,
  superseding_content_version_id uuid REFERENCES design_control_step_content_versions(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE design_control_steps
    ADD CONSTRAINT design_control_steps_current_content_version_fk
    FOREIGN KEY (current_content_version_id)
    REFERENCES design_control_step_content_versions(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_steps
    ADD CONSTRAINT design_control_steps_submitted_by_user_fk
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_step_content_versions
    ADD CONSTRAINT design_control_step_content_versions_superseding_fk
    FOREIGN KEY (superseded_by_version_id)
    REFERENCES design_control_step_content_versions(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_step_content_versions
    ADD CONSTRAINT design_control_step_content_versions_status_check
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED', 'VOID'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_step_approvals
    ADD CONSTRAINT design_control_step_approvals_decision_check
    CHECK (decision IN ('APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_step_approvals
    ADD CONSTRAINT design_control_step_approvals_status_check
    CHECK (status IN ('VALID', 'INVALIDATED', 'SUPERSEDED', 'REVOKED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS design_control_step_content_versions_step_version_unique
  ON design_control_step_content_versions(design_control_step_id, content_version);
CREATE INDEX IF NOT EXISTS design_control_step_content_versions_step_checksum_idx
  ON design_control_step_content_versions(design_control_step_id, content_checksum);
CREATE INDEX IF NOT EXISTS design_control_step_content_versions_record_idx
  ON design_control_step_content_versions(design_control_record_id);
CREATE INDEX IF NOT EXISTS design_control_step_content_versions_project_idx
  ON design_control_step_content_versions(rd_project_id);

CREATE UNIQUE INDEX IF NOT EXISTS design_control_step_approvals_version_slot_actor_decision_unique
  ON design_control_step_approvals(step_content_version_id, approval_key, actor_user_id, decision);
CREATE UNIQUE INDEX IF NOT EXISTS design_control_step_approvals_valid_slot_unique
  ON design_control_step_approvals(step_content_version_id, approval_key)
  WHERE status = 'VALID' AND decision = 'APPROVED';
CREATE INDEX IF NOT EXISTS design_control_step_approvals_version_idx
  ON design_control_step_approvals(step_content_version_id);
CREATE INDEX IF NOT EXISTS design_control_step_approvals_step_idx
  ON design_control_step_approvals(design_control_step_id);
CREATE INDEX IF NOT EXISTS design_control_step_approvals_project_idx
  ON design_control_step_approvals(rd_project_id);

CREATE OR REPLACE FUNCTION prevent_design_control_approval_evidence_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Design Control approval evidence is append-only and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER prevent_design_control_step_version_delete
    BEFORE DELETE ON design_control_step_content_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_design_control_approval_evidence_delete();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER prevent_design_control_step_approval_delete
    BEFORE DELETE ON design_control_step_approvals
    FOR EACH ROW EXECUTE FUNCTION prevent_design_control_approval_evidence_delete();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN design_control_steps.approvals IS
  'Legacy compatibility only. Boolean values are LEGACY_UNVERIFIED_APPROVAL_EVIDENCE and do not satisfy authenticated approval gates.';

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('design.control.edit', 'Edit authoritative Design Control step drafts', 'design'),
  ('design.control.submit', 'Submit complete Design Control step versions for approval', 'design'),
  ('design.control.approve', 'Approve general Design Control approval slots', 'design'),
  ('design.requirement.approve', 'Approve Design Control requirements and requirements reviews', 'design'),
  ('design.risk.accept', 'Accept Design Control risk assessments', 'design'),
  ('design.verify', 'Approve Design Control verification evidence', 'design'),
  ('design.validate', 'Approve Design Control validation evidence', 'design'),
  ('design.release', 'Approve the authenticated Engineering Release Gate', 'design')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key IN ('design.control.edit', 'design.control.submit')
WHERE role.name IN ('ADMIN', 'OWNER', 'ENGINEERING', 'ENGINEER', 'QUALITY', 'QUALITY_MANAGER', 'MANAGER')
ON CONFLICT (role_id, capability_id) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key IN (
  'design.control.approve', 'design.requirement.approve', 'design.risk.accept',
  'design.verify', 'design.validate', 'design.release'
)
WHERE role.name IN ('ADMIN', 'OWNER')
ON CONFLICT (role_id, capability_id) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON
  (capability.key IN ('design.control.approve', 'design.requirement.approve', 'design.risk.accept')
    AND role.name IN ('ENGINEERING', 'ENGINEER', 'QUALITY', 'QUALITY_MANAGER', 'MANUFACTURING', 'PROGRAM_MANAGER', 'MANAGER'))
  OR (capability.key = 'design.verify' AND role.name IN ('ENGINEERING', 'QUALITY', 'QUALITY_MANAGER'))
  OR (capability.key = 'design.validate' AND role.name IN ('ENGINEERING', 'QUALITY', 'QUALITY_MANAGER', 'PROGRAM_MANAGER', 'MANAGER'))
  OR (capability.key = 'design.release' AND role.name IN ('ENGINEERING', 'QUALITY_MANAGER', 'PROGRAM_MANAGER', 'MANAGER'))
ON CONFLICT (role_id, capability_id) DO NOTHING;
