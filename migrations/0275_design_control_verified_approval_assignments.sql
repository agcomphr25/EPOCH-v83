BEGIN;

CREATE TABLE IF NOT EXISTS design_control_step_approval_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  design_control_record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE RESTRICT,
  design_control_step_id uuid NOT NULL REFERENCES design_control_steps(id) ON DELETE RESTRICT,
  step_content_version_id uuid NOT NULL REFERENCES design_control_step_content_versions(id) ON DELETE RESTRICT,
  approval_key text NOT NULL,
  approval_role_snapshot text NOT NULL,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  employee_code_snapshot text,
  approver_name_snapshot text NOT NULL,
  job_title_snapshot text,
  department_snapshot text,
  account_status_snapshot text NOT NULL,
  required_capability_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','RETURNED','REJECTED','REASSIGNED')),
  decision_id uuid REFERENCES design_control_step_approvals(id) ON DELETE RESTRICT,
  assigned_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS dc_step_approval_assignments_version_slot_uq
ON design_control_step_approval_assignments(step_content_version_id, approval_key)
WHERE status <> 'REASSIGNED';
CREATE INDEX IF NOT EXISTS dc_step_approval_assignments_version_idx ON design_control_step_approval_assignments(step_content_version_id);

CREATE OR REPLACE FUNCTION prevent_design_control_assignment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Design Control approval assignments are immutable'; END $$;
DROP TRIGGER IF EXISTS prevent_design_control_assignment_delete ON design_control_step_approval_assignments;
CREATE TRIGGER prevent_design_control_assignment_delete BEFORE DELETE ON design_control_step_approval_assignments
FOR EACH ROW EXECUTE FUNCTION prevent_design_control_assignment_delete();

COMMENT ON TABLE design_control_step_approval_assignments IS
'Immutable submitted-version assignments. Legacy name-only values remain unverified and never satisfy this gate.';

COMMIT;
