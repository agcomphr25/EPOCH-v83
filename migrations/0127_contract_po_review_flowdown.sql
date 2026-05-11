-- Section 3: Contract / PO review foundation.
-- Idempotent: safe to run on environments where this branch was partially applied.

CREATE TABLE IF NOT EXISTS contract_review_checklist_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  review_areas text[] NOT NULL DEFAULT ARRAY['engineering','quality','procurement','scheduling','finance']::text[],
  checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicability_rule jsonb,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id integer,
  created_by_display_name text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_contract_review_templates_active
  ON contract_review_checklist_templates(is_active);

CREATE TABLE IF NOT EXISTS contract_clauses (
  id serial PRIMARY KEY,
  clause_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  clause_type text NOT NULL DEFAULT 'CUSTOMER',
  source text NOT NULL DEFAULT 'contract_review',
  default_flow_targets text[] NOT NULL DEFAULT ARRAY['po','traveler','qc','supplier_po','cert_package']::text[],
  is_active boolean NOT NULL DEFAULT true,
  effective_date timestamp,
  retired_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_clauses_active
  ON contract_clauses(is_active);

CREATE INDEX IF NOT EXISTS idx_contract_clauses_type
  ON contract_clauses(clause_type);

CREATE TABLE IF NOT EXISTS clause_templates (
  id serial PRIMARY KEY,
  checklist_template_id integer NOT NULL REFERENCES contract_review_checklist_templates(id) ON DELETE CASCADE,
  contract_clause_id integer NOT NULL REFERENCES contract_clauses(id) ON DELETE CASCADE,
  review_area text NOT NULL,
  requirement_text text NOT NULL,
  required_artifacts text[] NOT NULL DEFAULT ARRAY[]::text[],
  flow_targets text[] NOT NULL DEFAULT ARRAY['po','traveler','qc','supplier_po','cert_package']::text[],
  applicability_rule jsonb,
  required boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(checklist_template_id, contract_clause_id, review_area),
  CHECK (review_area IN ('engineering','quality','procurement','scheduling','finance'))
);

CREATE INDEX IF NOT EXISTS idx_clause_templates_template_id
  ON clause_templates(checklist_template_id);

CREATE INDEX IF NOT EXISTS idx_clause_templates_clause_id
  ON clause_templates(contract_clause_id);

CREATE TABLE IF NOT EXISTS contract_review_checklist_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_template_id integer NOT NULL REFERENCES contract_review_checklist_templates(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  purchase_review_checklist_id integer REFERENCES purchase_review_checklists(id) ON DELETE SET NULL,
  p2_purchase_order_id integer REFERENCES p2_purchase_orders(id) ON DELETE SET NULL,
  vendor_po_id integer REFERENCES vendor_pos(id) ON DELETE SET NULL,
  traveler_id varchar(255) REFERENCES travelers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  review_area_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_review_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by_user_id integer,
  created_by_display_name text,
  submitted_at timestamp,
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_review_instances_project_id
  ON contract_review_checklist_instances(project_id);

CREATE INDEX IF NOT EXISTS idx_contract_review_instances_template_id
  ON contract_review_checklist_instances(checklist_template_id);

CREATE INDEX IF NOT EXISTS idx_contract_review_instances_vendor_po_id
  ON contract_review_checklist_instances(vendor_po_id);

CREATE TABLE IF NOT EXISTS flowed_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_review_instance_id uuid REFERENCES contract_review_checklist_instances(id) ON DELETE CASCADE,
  contract_clause_id integer NOT NULL REFERENCES contract_clauses(id) ON DELETE RESTRICT,
  clause_template_id integer REFERENCES clause_templates(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  requirement_text text NOT NULL,
  required_artifacts text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'contract_review',
  flowed_at timestamp NOT NULL DEFAULT NOW(),
  satisfied_at timestamp,
  satisfied_by_user_id integer,
  satisfied_by_display_name text,
  evidence jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  UNIQUE(contract_review_instance_id, contract_clause_id, target_type, target_id),
  CHECK (target_type IN ('po','traveler','qc','supplier_po','cert_package'))
);

CREATE INDEX IF NOT EXISTS idx_flowed_requirements_target
  ON flowed_requirements(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_flowed_requirements_instance_id
  ON flowed_requirements(contract_review_instance_id);

CREATE INDEX IF NOT EXISTS idx_flowed_requirements_clause_id
  ON flowed_requirements(contract_clause_id);

INSERT INTO contract_review_checklist_templates (
  name,
  description,
  version,
  review_areas,
  checklist_items,
  status,
  is_active
)
VALUES (
  'Section 3 Contract / PO Review',
  'Baseline cross-functional contract and PO review template for engineering, quality, procurement, scheduling, and finance.',
  1,
  ARRAY['engineering','quality','procurement','scheduling','finance']::text[],
  '[
    {"area":"engineering","label":"Confirm technical data, drawings, specs, and manufacturability requirements."},
    {"area":"quality","label":"Confirm inspection, acceptance, certification, and flowed quality requirements."},
    {"area":"procurement","label":"Confirm supplier PO flowdowns, debarment, sourcing, and purchasing controls."},
    {"area":"scheduling","label":"Confirm delivery, DPAS, lead-time, and traveler schedule constraints."},
    {"area":"finance","label":"Confirm pricing, funding, billing, tax, and contract accounting implications."}
  ]'::jsonb,
  'approved',
  true
)
ON CONFLICT (name, version) DO NOTHING;

INSERT INTO contract_clauses (
  clause_number,
  title,
  description,
  clause_type,
  source,
  default_flow_targets
)
VALUES
  (
    'EPOCH-CR-ENG-001',
    'Engineering Technical Data Flowdown',
    'Engineering must confirm drawings, specifications, revision levels, customer technical data, and manufacturability constraints before release.',
    'INTERNAL',
    'section_3_contract_review',
    ARRAY['po','traveler']::text[]
  ),
  (
    'EPOCH-CR-QUAL-001',
    'Quality and Acceptance Requirement Flowdown',
    'Quality must confirm inspection plans, acceptance criteria, special process controls, and customer quality clauses before work release.',
    'QUALITY',
    'section_3_contract_review',
    ARRAY['traveler','qc','cert_package']::text[]
  ),
  (
    'EPOCH-CR-PROC-001',
    'Procurement Supplier Flowdown',
    'Procurement must flow applicable customer, FAR/DFARS, quality, packaging, and certification requirements to supplier purchase orders.',
    'INTERNAL',
    'section_3_contract_review',
    ARRAY['supplier_po']::text[]
  ),
  (
    'EPOCH-CR-SCHED-001',
    'Schedule and Priority Flowdown',
    'Scheduling must confirm required delivery dates, DPAS or customer priority constraints, lead times, and traveler schedule risk.',
    'INTERNAL',
    'section_3_contract_review',
    ARRAY['po','traveler']::text[]
  ),
  (
    'EPOCH-CR-FIN-001',
    'Finance Contract Accounting Review',
    'Finance must confirm pricing, billing, tax, funding, payment terms, and contract accounting treatment before release.',
    'INTERNAL',
    'section_3_contract_review',
    ARRAY['po','cert_package']::text[]
  )
ON CONFLICT (clause_number) DO NOTHING;

WITH base_template AS (
  SELECT id
  FROM contract_review_checklist_templates
  WHERE name = 'Section 3 Contract / PO Review'
    AND version = 1
  LIMIT 1
),
seed_rows AS (
  SELECT
    base_template.id AS checklist_template_id,
    contract_clauses.id AS contract_clause_id,
    seed.review_area,
    seed.requirement_text,
    seed.required_artifacts,
    seed.flow_targets
  FROM base_template
  JOIN (
    VALUES
      (
        'EPOCH-CR-ENG-001',
        'engineering',
        'Flow confirmed engineering requirements into the customer PO record and traveler execution package.',
        ARRAY['approved drawing/spec revision','engineering review signoff']::text[],
        ARRAY['po','traveler']::text[]
      ),
      (
        'EPOCH-CR-QUAL-001',
        'quality',
        'Flow confirmed inspection, acceptance, and quality clauses into traveler QC tasks and the final cert package.',
        ARRAY['inspection plan','acceptance criteria','quality signoff']::text[],
        ARRAY['traveler','qc','cert_package']::text[]
      ),
      (
        'EPOCH-CR-PROC-001',
        'procurement',
        'Flow customer and government contract requirements into supplier purchase order terms and required supplier evidence.',
        ARRAY['supplier PO terms','supplier certification evidence']::text[],
        ARRAY['supplier_po']::text[]
      ),
      (
        'EPOCH-CR-SCHED-001',
        'scheduling',
        'Flow due date, DPAS, and schedule-risk requirements into the PO and traveler planning record.',
        ARRAY['schedule review','delivery commitment']::text[],
        ARRAY['po','traveler']::text[]
      ),
      (
        'EPOCH-CR-FIN-001',
        'finance',
        'Flow pricing, payment, billing, and contract-accounting requirements into PO and cert-package closeout evidence.',
        ARRAY['finance review','billing terms confirmation']::text[],
        ARRAY['po','cert_package']::text[]
      )
  ) AS seed(clause_number, review_area, requirement_text, required_artifacts, flow_targets)
    ON true
  JOIN contract_clauses
    ON contract_clauses.clause_number = seed.clause_number
)
INSERT INTO clause_templates (
  checklist_template_id,
  contract_clause_id,
  review_area,
  requirement_text,
  required_artifacts,
  flow_targets,
  required
)
SELECT
  checklist_template_id,
  contract_clause_id,
  review_area,
  requirement_text,
  required_artifacts,
  flow_targets,
  true
FROM seed_rows
ON CONFLICT (checklist_template_id, contract_clause_id, review_area) DO NOTHING;
