CREATE TABLE IF NOT EXISTS design_control_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_number text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp,
  released_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_records_project_id_idx ON design_control_records(project_id);
CREATE INDEX IF NOT EXISTS design_control_records_pwo_id_idx ON design_control_records(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_records_p2_po_id_idx ON design_control_records(p2_purchase_order_id);
CREATE INDEX IF NOT EXISTS design_control_records_status_idx ON design_control_records(status);

CREATE TABLE IF NOT EXISTS design_control_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'incomplete',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT design_control_steps_record_step_unique UNIQUE (record_id, step_key)
);

CREATE INDEX IF NOT EXISTS design_control_steps_record_id_idx ON design_control_steps(record_id);
CREATE INDEX IF NOT EXISTS design_control_steps_status_idx ON design_control_steps(status);
CREATE INDEX IF NOT EXISTS design_control_steps_project_id_idx ON design_control_steps(project_id);
CREATE INDEX IF NOT EXISTS design_control_steps_pwo_id_idx ON design_control_steps(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_steps_p2_po_id_idx ON design_control_steps(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  requirement_key text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_requirements_record_id_idx ON design_control_requirements(record_id);
CREATE INDEX IF NOT EXISTS design_control_requirements_project_id_idx ON design_control_requirements(project_id);
CREATE INDEX IF NOT EXISTS design_control_requirements_pwo_id_idx ON design_control_requirements(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_requirements_p2_po_id_idx ON design_control_requirements(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  risk_key text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_risks_record_id_idx ON design_control_risks(record_id);
CREATE INDEX IF NOT EXISTS design_control_risks_project_id_idx ON design_control_risks(project_id);
CREATE INDEX IF NOT EXISTS design_control_risks_pwo_id_idx ON design_control_risks(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_risks_p2_po_id_idx ON design_control_risks(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  review_type text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_reviews_record_id_idx ON design_control_reviews(record_id);
CREATE INDEX IF NOT EXISTS design_control_reviews_project_id_idx ON design_control_reviews(project_id);
CREATE INDEX IF NOT EXISTS design_control_reviews_pwo_id_idx ON design_control_reviews(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_reviews_p2_po_id_idx ON design_control_reviews(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  verification_key text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_verification_record_id_idx ON design_control_verification(record_id);
CREATE INDEX IF NOT EXISTS design_control_verification_project_id_idx ON design_control_verification(project_id);
CREATE INDEX IF NOT EXISTS design_control_verification_pwo_id_idx ON design_control_verification(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_verification_p2_po_id_idx ON design_control_verification(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  validation_key text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  validated_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_validation_record_id_idx ON design_control_validation(record_id);
CREATE INDEX IF NOT EXISTS design_control_validation_project_id_idx ON design_control_validation(project_id);
CREATE INDEX IF NOT EXISTS design_control_validation_pwo_id_idx ON design_control_validation(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_validation_p2_po_id_idx ON design_control_validation(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  change_key text,
  title text,
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_control_changes_record_id_idx ON design_control_changes(record_id);
CREATE INDEX IF NOT EXISTS design_control_changes_project_id_idx ON design_control_changes(project_id);
CREATE INDEX IF NOT EXISTS design_control_changes_pwo_id_idx ON design_control_changes(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_changes_p2_po_id_idx ON design_control_changes(p2_purchase_order_id);

CREATE TABLE IF NOT EXISTS design_control_release_gate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES design_control_records(id) ON DELETE CASCADE,
  gate_status text NOT NULL DEFAULT 'not_ready',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp,
  released_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT design_control_release_gate_record_unique UNIQUE (record_id)
);

CREATE INDEX IF NOT EXISTS design_control_release_gate_record_id_idx ON design_control_release_gate(record_id);
CREATE INDEX IF NOT EXISTS design_control_release_gate_status_idx ON design_control_release_gate(gate_status);
CREATE INDEX IF NOT EXISTS design_control_release_gate_project_id_idx ON design_control_release_gate(project_id);
CREATE INDEX IF NOT EXISTS design_control_release_gate_pwo_id_idx ON design_control_release_gate(production_work_order_id);
CREATE INDEX IF NOT EXISTS design_control_release_gate_p2_po_id_idx ON design_control_release_gate(p2_purchase_order_id);
