-- Phase 6: additive p2_v2 Production Planning baseline.
-- No legacy backfill and no project_steps mutation.
CREATE TABLE IF NOT EXISTS project_production_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  workflow_step_type TEXT NOT NULL DEFAULT 'production_planning' CHECK (workflow_step_type = 'production_planning'),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','RELEASED','REJECTED','SUPERSEDED')),
  po_id INTEGER REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  po_revision_number INTEGER,
  po_number TEXT,
  configuration_baseline_id TEXT,
  configuration_revision TEXT NOT NULL,
  design_release_id UUID REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  design_release_revision TEXT,
  effectivity_type TEXT NOT NULL CHECK (effectivity_type IN ('PO_REVISION','DATE','SERIAL_RANGE','LOT','PROJECT')),
  effectivity_reference TEXT NOT NULL,
  requirement_source TEXT NOT NULL,
  planning_basis TEXT NOT NULL,
  notes TEXT,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_display_name TEXT,
  submitted_at TIMESTAMP,
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_display_name TEXT,
  released_at TIMESTAMP,
  superseded_at TIMESTAMP,
  superseded_by_plan_id UUID REFERENCES project_production_plans(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_production_plans_instance_project_fk FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_production_plans_step_identity_fk FOREIGN KEY (workflow_step_instance_id, workflow_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, workflow_instance_id, project_id) ON DELETE RESTRICT,
  CONSTRAINT project_production_plans_revision_unique UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_production_plans_current_unique
  ON project_production_plans(project_id, workflow_instance_id) WHERE status <> 'SUPERSEDED';
CREATE INDEX IF NOT EXISTS project_production_plans_project_idx ON project_production_plans(project_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS project_production_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_plan_id UUID NOT NULL REFERENCES project_production_plans(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  part_number TEXT NOT NULL,
  part_name TEXT,
  manufacturing_level TEXT,
  parent_part_number TEXT,
  assembly_path TEXT NOT NULL,
  quantity_per_parent NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (quantity_per_parent > 0),
  extended_project_quantity NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (extended_project_quantity > 0),
  make_buy TEXT NOT NULL CHECK (make_buy IN ('MAKE','BUY','REFERENCE')),
  is_manufactured BOOLEAN NOT NULL,
  drawing_number TEXT,
  drawing_revision TEXT,
  specification_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  bom_id UUID REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  bom_revision TEXT,
  bom_release_status TEXT NOT NULL DEFAULT 'MISSING' CHECK (bom_release_status IN ('RELEASED','UNRELEASED','MISSING','NOT_REQUIRED_APPROVED')),
  routing_id UUID REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_revision TEXT,
  routing_release_status TEXT NOT NULL DEFAULT 'MISSING' CHECK (routing_release_status IN ('RELEASED','ACTIVE_UNAPPROVED','INACTIVE','MISSING','NOT_REQUIRED_APPROVED')),
  effectivity_reference TEXT,
  routing_requirement TEXT CHECK (routing_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  routing_not_required_reason TEXT,
  traveler_requirement TEXT CHECK (traveler_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  traveler_type TEXT CHECK (traveler_type IN ('INDIVIDUAL','BATCH','LOT')),
  traveler_not_required_reason TEXT,
  work_instruction_requirement TEXT CHECK (work_instruction_requirement IN ('REQUIRED','DRAWING_SPEC_SUFFICIENT','NOT_REQUIRED_APPROVED')),
  work_instruction_basis TEXT,
  work_instruction_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  specification_sheet_requirement TEXT CHECK (specification_sheet_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  inspection_requirement TEXT CHECK (inspection_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  in_process_inspection_required BOOLEAN,
  final_inspection_required BOOLEAN,
  inspection_extent TEXT CHECK (inspection_extent IN ('ONE_HUNDRED_PERCENT','APPROVED_SAMPLING','FINAL_ONLY','IN_PROCESS_AND_FINAL')),
  sampling_plan_id TEXT,
  sampling_plan_status TEXT,
  fai_requirement TEXT CHECK (fai_requirement IN ('FULL','PARTIAL','NOT_REQUIRED')),
  fai_reason TEXT,
  traceability_level TEXT CHECK (traceability_level IN ('SERIAL','LOT','BATCH','STANDARD')),
  serialization_required BOOLEAN,
  lot_traceability_required BOOLEAN,
  special_process_source TEXT CHECK (special_process_source IN ('INTERNAL','EXTERNAL_APPROVED_SUPPLIER','NONE')),
  special_process_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_test_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  tooling_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  cnc_program_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  packaging_instruction_requirement TEXT CHECK (packaging_instruction_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  packaging_instruction_reference TEXT,
  requirement_source TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT project_production_plan_items_plan_part_unique UNIQUE (production_plan_id, assembly_path)
);
CREATE INDEX IF NOT EXISTS project_production_plan_items_plan_idx ON project_production_plan_items(production_plan_id, assembly_path);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.production_planning.manage','Draft, refresh, submit and revise P2 V2 production plans','projects'),
 ('projects.production_planning.engineering_decide','Record Engineering production-plan decisions','engineering'),
 ('projects.production_planning.quality_decide','Record Quality production-plan decisions','quality'),
 ('projects.production_planning.operations_decide','Record Operations production-plan decisions','operations')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key='projects.production_planning.manage') OR
 (pr.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER') AND pc.key IN ('projects.production_planning.manage','projects.production_planning.engineering_decide')) OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.production_planning.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER') AND pc.key='projects.production_planning.operations_decide')
) ON CONFLICT (role_id, capability_id) DO NOTHING;
