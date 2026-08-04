-- Phase 1: authoritative Design Project manufacturing-configuration foundation.
-- Additive only: no legacy records are inferred, relinked, or modified.

-- Repair the pre-existing Part Specification Sheet approval invariant when
-- Drizzle created the table before migration 0233. The original migration's
-- inline UNIQUE clause is otherwise skipped by CREATE TABLE IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS spec_sheet_revision_approvals_role_unique
  ON spec_sheet_revision_approvals(spec_sheet_revision_id, approval_role);

CREATE TABLE IF NOT EXISTS design_project_configuration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  configuration_item_number text NOT NULL,
  part_number text NOT NULL,
  title text NOT NULL,
  item_type text NOT NULL,
  make_buy_designation text NOT NULL DEFAULT 'UNDETERMINED',
  design_responsibility text,
  inventory_item_id integer REFERENCES inventory_items(id) ON DELETE RESTRICT,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  conversion_status text NOT NULL DEFAULT 'NATIVE',
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_project_configuration_items_type_check CHECK (item_type IN (
    'PRODUCT','ASSEMBLY','SUBASSEMBLY','MANUFACTURED_PART','PURCHASED_COMPONENT','SOFTWARE','TOOLING'
  )),
  CONSTRAINT design_project_configuration_items_make_buy_check CHECK (make_buy_designation IN ('MAKE','BUY','UNDETERMINED')),
  CONSTRAINT design_project_configuration_items_lifecycle_check CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE','OBSOLETE')),
  CONSTRAINT design_project_configuration_items_conversion_check CHECK (conversion_status IN ('NATIVE','LEGACY_UNRECONCILED','LEGACY_RECONCILED')),
  CONSTRAINT design_project_configuration_items_project_number_unique UNIQUE (rd_project_id, configuration_item_number)
);
CREATE INDEX IF NOT EXISTS design_project_configuration_items_project_idx ON design_project_configuration_items(rd_project_id);
CREATE INDEX IF NOT EXISTS design_project_configuration_items_inventory_idx ON design_project_configuration_items(inventory_item_id);

CREATE TABLE IF NOT EXISTS design_project_configuration_item_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT,
  parent_configuration_item_id uuid NOT NULL REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  child_configuration_item_id uuid NOT NULL REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL,
  unit_of_measure text NOT NULL,
  reference_designator text,
  effectivity_start text,
  effectivity_end text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_project_configuration_relationship_self_check CHECK (parent_configuration_item_id <> child_configuration_item_id),
  CONSTRAINT design_project_configuration_relationship_quantity_check CHECK (quantity > 0),
  CONSTRAINT design_project_configuration_relationship_unique UNIQUE (parent_configuration_item_id, child_configuration_item_id, effectivity_start, effectivity_end)
);
CREATE INDEX IF NOT EXISTS design_project_configuration_relationship_parent_idx ON design_project_configuration_item_relationships(parent_configuration_item_id);
CREATE INDEX IF NOT EXISTS design_project_configuration_relationship_child_idx ON design_project_configuration_item_relationships(child_configuration_item_id);

CREATE OR REPLACE FUNCTION validate_design_project_configuration_relationship()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_project text; child_project text;
BEGIN
  SELECT rd_project_id INTO parent_project FROM design_project_configuration_items WHERE id = NEW.parent_configuration_item_id;
  SELECT rd_project_id INTO child_project FROM design_project_configuration_items WHERE id = NEW.child_configuration_item_id;
  IF parent_project IS NULL OR child_project IS NULL OR parent_project <> child_project OR NEW.rd_project_id <> parent_project THEN
    RAISE EXCEPTION 'Configuration-item relationships must stay within one Design Project';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT child_configuration_item_id FROM design_project_configuration_item_relationships WHERE parent_configuration_item_id = NEW.child_configuration_item_id
      UNION
      SELECT r.child_configuration_item_id FROM design_project_configuration_item_relationships r JOIN descendants d ON r.parent_configuration_item_id = d.id
    ) SELECT 1 FROM descendants WHERE id = NEW.parent_configuration_item_id
  ) THEN RAISE EXCEPTION 'Configuration-item relationship would create a cycle'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS design_project_configuration_relationship_guard ON design_project_configuration_item_relationships;
CREATE TRIGGER design_project_configuration_relationship_guard BEFORE INSERT OR UPDATE ON design_project_configuration_item_relationships
FOR EACH ROW EXECUTE FUNCTION validate_design_project_configuration_relationship();

CREATE TABLE IF NOT EXISTS design_project_part_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_item_id uuid NOT NULL REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  revision_identifier text NOT NULL,
  revision_sequence integer NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'DRAFT',
  change_summary text NOT NULL,
  effectivity_start text,
  effectivity_end text,
  predecessor_revision_id uuid REFERENCES design_project_part_revisions(id) ON DELETE RESTRICT,
  source_ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  source_ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  content_checksum text,
  approval_reference_id uuid REFERENCES design_control_step_approvals(id) ON DELETE RESTRICT,
  release_reference_id uuid REFERENCES engineering_releases(id) ON DELETE RESTRICT,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_snapshot jsonb,
  approved_at timestamptz,
  released_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  released_by_snapshot jsonb,
  released_at timestamptz,
  CONSTRAINT design_project_part_revisions_state_check CHECK (lifecycle_state IN ('DRAFT','IN_REVIEW','APPROVED','RELEASED','SUPERSEDED','OBSOLETE')),
  CONSTRAINT design_project_part_revisions_sequence_check CHECK (revision_sequence > 0),
  CONSTRAINT design_project_part_revisions_item_identifier_unique UNIQUE (configuration_item_id, revision_identifier),
  CONSTRAINT design_project_part_revisions_item_sequence_unique UNIQUE (configuration_item_id, revision_sequence)
);
CREATE UNIQUE INDEX IF NOT EXISTS design_project_part_revisions_predecessor_successor_unique
  ON design_project_part_revisions(predecessor_revision_id) WHERE predecessor_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS design_project_part_revisions_item_idx ON design_project_part_revisions(configuration_item_id);

CREATE OR REPLACE FUNCTION validate_design_project_part_revision_release_chain()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_release uuid;
BEGIN
  IF NEW.predecessor_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM design_project_part_revisions predecessor
    WHERE predecessor.id = NEW.predecessor_revision_id
      AND predecessor.configuration_item_id = NEW.configuration_item_id
      AND predecessor.revision_sequence < NEW.revision_sequence
  ) THEN
    RAISE EXCEPTION 'Part-revision predecessor must be an earlier revision of the same configuration item';
  END IF;
  IF NEW.lifecycle_state <> 'RELEASED' THEN RETURN NEW; END IF;
  SELECT r.id INTO current_release
  FROM design_project_part_revisions r
  WHERE r.configuration_item_id = NEW.configuration_item_id
    AND r.lifecycle_state = 'RELEASED'
    AND r.id <> NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM design_project_part_revisions successor
      WHERE successor.predecessor_revision_id = r.id
        AND successor.lifecycle_state = 'RELEASED'
        AND successor.id <> NEW.id
    )
  LIMIT 1;
  IF current_release IS NOT NULL AND NEW.predecessor_revision_id IS DISTINCT FROM current_release THEN
    RAISE EXCEPTION 'A released successor must reference the current released predecessor';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS design_project_part_revision_release_chain_guard ON design_project_part_revisions;
CREATE TRIGGER design_project_part_revision_release_chain_guard BEFORE INSERT OR UPDATE ON design_project_part_revisions
FOR EACH ROW EXECUTE FUNCTION validate_design_project_part_revision_release_chain();

CREATE TABLE IF NOT EXISTS design_project_document_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_item_id uuid REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  part_revision_id uuid REFERENCES design_project_part_revisions(id) ON DELETE RESTRICT,
  requirement_role text NOT NULL,
  decision text NOT NULL DEFAULT 'REQUIRED',
  justification text,
  approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_snapshot jsonb,
  approved_at timestamptz,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_project_document_applicability_scope_check CHECK ((configuration_item_id IS NOT NULL) <> (part_revision_id IS NOT NULL)),
  CONSTRAINT design_project_document_applicability_role_check CHECK (requirement_role IN ('DRAWING_CAD','BOM','ROUTING','TRAVELER','WORK_INSTRUCTION','INSPECTION_PLAN','TEST_PROCEDURE','MATERIAL_SPECIFICATION','TOOLING_FIXTURE','CNC_PROGRAM','SUPPLIER_REQUIREMENT','TRAINING_CERTIFICATION','PACKAGING_SHIPPING')),
  CONSTRAINT design_project_document_applicability_decision_check CHECK (decision IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE')),
  CONSTRAINT design_project_document_applicability_na_check CHECK (decision <> 'NOT_APPLICABLE' OR (nullif(btrim(justification),'') IS NOT NULL AND approved_by_user_id IS NOT NULL AND approved_by_snapshot IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS design_project_document_applicability_item_unique ON design_project_document_applicability(configuration_item_id, requirement_role) WHERE configuration_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS design_project_document_applicability_revision_unique ON design_project_document_applicability(part_revision_id, requirement_role) WHERE part_revision_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS design_project_part_revision_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_revision_id uuid NOT NULL REFERENCES design_project_part_revisions(id) ON DELETE RESTRICT,
  artifact_role text NOT NULL,
  source_module text NOT NULL,
  source_record_id text NOT NULL,
  controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id) ON DELETE RESTRICT,
  artifact_number text NOT NULL,
  revision_snapshot text NOT NULL,
  checksum_snapshot text NOT NULL,
  lifecycle_state_snapshot text NOT NULL,
  effectivity_start text,
  effectivity_end text,
  requirement_designation text NOT NULL DEFAULT 'REQUIRED',
  linked_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  linked_by_snapshot jsonb NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_project_part_revision_artifacts_role_check CHECK (artifact_role IN ('CAD','DRAWING','BOM','ROUTING','TRAVELER_TEMPLATE','WORK_INSTRUCTION','INSPECTION_PLAN','TEST_PROCEDURE','MATERIAL_SPECIFICATION','TOOLING','FIXTURE','CNC_PROGRAM','QC_FORM','PACKAGING_REQUIREMENT','SUPPLIER_REQUIREMENT','OTHER_CONTROLLED_OUTPUT')),
  CONSTRAINT design_project_part_revision_artifacts_requirement_check CHECK (requirement_designation IN ('REQUIRED','OPTIONAL')),
  CONSTRAINT design_project_part_revision_artifacts_unique UNIQUE (part_revision_id, artifact_role, controlled_revision_id)
);
CREATE INDEX IF NOT EXISTS design_project_part_revision_artifacts_revision_idx ON design_project_part_revision_artifacts(part_revision_id);
CREATE INDEX IF NOT EXISTS design_project_part_revision_artifacts_controlled_idx ON design_project_part_revision_artifacts(controlled_revision_id);

CREATE TABLE IF NOT EXISTS routing_operation_work_instruction_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id) ON DELETE RESTRICT,
  routing_operation_id integer REFERENCES routing_operations(id) ON DELETE RESTRICT,
  routing_operation_key text NOT NULL,
  work_instruction_controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id) ON DELETE RESTRICT,
  work_instruction_number text NOT NULL,
  work_instruction_revision_snapshot text NOT NULL,
  work_instruction_checksum_snapshot text NOT NULL,
  usage_type text NOT NULL DEFAULT 'EXECUTION',
  is_primary boolean NOT NULL DEFAULT false,
  display_sequence integer NOT NULL DEFAULT 0,
  effectivity_start text,
  effectivity_end text,
  linked_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  linked_by_snapshot jsonb NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routing_operation_work_instruction_usage_check CHECK (usage_type IN ('EXECUTION','REFERENCE','INSPECTION','SETUP')),
  CONSTRAINT routing_operation_work_instruction_unique UNIQUE (routing_controlled_revision_id, routing_operation_key, work_instruction_controlled_revision_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS routing_operation_work_instruction_primary_unique
  ON routing_operation_work_instruction_revisions(routing_controlled_revision_id, routing_operation_key) WHERE is_primary;

ALTER TABLE engineering_release_baseline_items
  ADD COLUMN IF NOT EXISTS configuration_item_id uuid REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS part_revision_id uuid REFERENCES design_project_part_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS artifact_role text,
  ADD COLUMN IF NOT EXISTS controlled_revision_id uuid REFERENCES engineering_controlled_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS artifact_number text,
  ADD COLUMN IF NOT EXISTS artifact_revision text,
  ADD COLUMN IF NOT EXISTS artifact_checksum text,
  ADD COLUMN IF NOT EXISTS approval_release_status text,
  ADD COLUMN IF NOT EXISTS effectivity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applicability_decision text,
  ADD COLUMN IF NOT EXISTS omission_justification text,
  ADD COLUMN IF NOT EXISTS ecr_id uuid REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS ecn_id uuid REFERENCES engineering_change_orders(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS design_project_configuration_reconciliation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_record_id text NOT NULL,
  candidate_rd_project_id text REFERENCES rd_projects(id) ON DELETE RESTRICT,
  candidate_configuration_item_id uuid REFERENCES design_project_configuration_items(id) ON DELETE RESTRICT,
  candidate_reason text NOT NULL,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ambiguity_status text NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewer_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_snapshot jsonb,
  disposition text,
  disposition_justification text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_project_configuration_reconciliation_status_check CHECK (ambiguity_status IN ('PENDING_REVIEW','IN_REVIEW','DISPOSITIONED','REJECTED')),
  CONSTRAINT design_project_configuration_reconciliation_source_unique UNIQUE (source_table, source_record_id)
);

CREATE TABLE IF NOT EXISTS design_project_configuration_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES design_project_configuration_reconciliation_queue(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_released_design_configuration_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Released Design Project configuration evidence is immutable'; END $$;
DROP TRIGGER IF EXISTS design_project_part_revisions_released_guard ON design_project_part_revisions;
CREATE TRIGGER design_project_part_revisions_released_guard BEFORE UPDATE OR DELETE ON design_project_part_revisions
FOR EACH ROW WHEN (OLD.lifecycle_state IN ('RELEASED','SUPERSEDED','OBSOLETE')) EXECUTE FUNCTION prevent_released_design_configuration_mutation();
CREATE OR REPLACE FUNCTION protect_released_part_revision_artifact()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM design_project_part_revisions WHERE id = OLD.part_revision_id AND lifecycle_state IN ('RELEASED','SUPERSEDED','OBSOLETE')) THEN
    RAISE EXCEPTION 'Released Design Project configuration evidence is immutable';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS design_project_part_revision_artifacts_guard ON design_project_part_revision_artifacts;
CREATE TRIGGER design_project_part_revision_artifacts_guard BEFORE UPDATE OR DELETE ON design_project_part_revision_artifacts
FOR EACH ROW EXECUTE FUNCTION protect_released_part_revision_artifact();

CREATE OR REPLACE FUNCTION protect_released_routing_work_instruction_link()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM engineering_controlled_revisions WHERE id = OLD.routing_controlled_revision_id AND release_state IN ('released','superseded','obsolete')) THEN
    RAISE EXCEPTION 'Released routing work-instruction evidence is immutable';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS routing_operation_work_instruction_revisions_guard ON routing_operation_work_instruction_revisions;
CREATE TRIGGER routing_operation_work_instruction_revisions_guard BEFORE UPDATE OR DELETE ON routing_operation_work_instruction_revisions
FOR EACH ROW EXECUTE FUNCTION protect_released_routing_work_instruction_link();

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('design.configuration.view', 'View Design Project configurations', 'design'),
  ('design.configuration.edit', 'Edit draft Design Project configurations', 'design'),
  ('design.configuration.applicability.approve', 'Approve Design Project documentation applicability', 'design'),
  ('design.configuration.revision.review', 'Review Design Project part revisions', 'design'),
  ('design.configuration.revision.release', 'Release Design Project part revisions', 'design'),
  ('design.configuration.baseline.create', 'Create Engineering Release configuration baselines', 'design'),
  ('design.configuration.reconcile', 'Reconcile legacy Design Project configuration links', 'design'),
  ('design.configuration.admin', 'Administer Design Project configuration-control rules', 'design')
ON CONFLICT (key) DO NOTHING;
