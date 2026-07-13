CREATE TABLE IF NOT EXISTS design_control_requirement_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  rd_project_id text REFERENCES rd_projects(id) ON DELETE SET NULL,
  requirement_key text NOT NULL,
  applicable boolean NOT NULL DEFAULT true,
  justification text,
  approved_by text,
  approved_role text,
  approved_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT design_control_requirement_applicability_record_requirement_unique UNIQUE (record_id, requirement_key)
);

CREATE INDEX IF NOT EXISTS design_control_req_app_record_id_idx
  ON design_control_requirement_applicability(record_id);

CREATE INDEX IF NOT EXISTS design_control_req_app_rd_project_id_idx
  ON design_control_requirement_applicability(rd_project_id);

CREATE INDEX IF NOT EXISTS design_control_req_app_requirement_key_idx
  ON design_control_requirement_applicability(requirement_key);

CREATE INDEX IF NOT EXISTS design_control_req_app_applicable_idx
  ON design_control_requirement_applicability(applicable);
