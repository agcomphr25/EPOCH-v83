-- Phase 2 Inventory Item traceability policy and stable-identity BOM foundation.
-- Prospective and additive only: no historical inventory or BOM rows are rewritten.

CREATE TABLE IF NOT EXISTS inventory_item_traceability_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','PENDING_APPROVAL','RELEASED','SUPERSEDED','REJECTED','RETURNED'
  )),
  policy_type TEXT NOT NULL CHECK (policy_type IN (
    'SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED'
  )),
  item_classification TEXT NOT NULL CHECK (item_classification IN (
    'RAW_MATERIAL','PURCHASED_COMPONENT','MANUFACTURED_COMPONENT','SUBASSEMBLY',
    'ASSEMBLY','CUSTOMER_SUPPLIED','CONSUMABLE','TOOLING','NON_INVENTORY_SERVICE'
  )),
  part_configuration_revision TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  default_department_id INTEGER REFERENCES inventory_departments(id) ON DELETE RESTRICT,
  output_serialization_required BOOLEAN NOT NULL DEFAULT false,
  individual_input_scan_required BOOLEAN NOT NULL DEFAULT false,
  lot_scan_required BOOLEAN NOT NULL DEFAULT false,
  batch_scan_required BOOLEAN NOT NULL DEFAULT false,
  quantity_entry_required BOOLEAN NOT NULL DEFAULT false,
  divisible_inventory_permitted BOOLEAN NOT NULL DEFAULT false,
  shelf_life_controlled BOOLEAN NOT NULL DEFAULT false,
  heat_lot_required BOOLEAN NOT NULL DEFAULT false,
  date_code_required BOOLEAN NOT NULL DEFAULT false,
  coc_required BOOLEAN NOT NULL DEFAULT false,
  material_certification_required BOOLEAN NOT NULL DEFAULT false,
  test_report_required BOOLEAN NOT NULL DEFAULT false,
  sds_required BOOLEAN NOT NULL DEFAULT false,
  tds_required BOOLEAN NOT NULL DEFAULT false,
  receiving_inspection_required BOOLEAN NOT NULL DEFAULT false,
  customer_custody_required BOOLEAN NOT NULL DEFAULT false,
  storage_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  configuration_effectivity JSONB NOT NULL DEFAULT '{}'::jsonb,
  no_traceability_justification TEXT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  content_checksum TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  supersedes_policy_id UUID REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_display_name TEXT,
  submitted_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by_display_name TEXT,
  approved_by_role TEXT,
  approval_capacity TEXT,
  signature_meaning TEXT,
  approved_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_item_traceability_policy_revision_unique
    UNIQUE (inventory_item_id, revision_number),
  CONSTRAINT inventory_item_traceability_policy_effectivity_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CONSTRAINT inventory_item_traceability_policy_none_reason_check
    CHECK (policy_type <> 'NONE_APPROVED' OR length(btrim(COALESCE(no_traceability_justification,''))) > 0),
  CONSTRAINT inventory_item_traceability_policy_type_rules_check CHECK (
    (policy_type <> 'SERIAL' OR output_serialization_required) AND
    (policy_type <> 'LOT' OR lot_scan_required) AND
    (policy_type <> 'BATCH' OR batch_scan_required) AND
    (policy_type <> 'STANDARD_QUANTITY' OR quantity_entry_required) AND
    (policy_type <> 'CUSTOMER_SUPPLIED' OR customer_custody_required)
  ),
  CONSTRAINT inventory_item_traceability_policy_release_evidence_check CHECK (
    status <> 'RELEASED' OR (
      approved_by_display_name IS NOT NULL AND approved_by_role IS NOT NULL AND
      approval_capacity IS NOT NULL AND signature_meaning IS NOT NULL AND approved_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS inventory_item_traceability_policy_lookup_idx
  ON inventory_item_traceability_policies(inventory_item_id,status,effective_from,effective_to);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_traceability_policy_current_uidx
  ON inventory_item_traceability_policies(inventory_item_id)
  WHERE status='RELEASED' AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS inventory_item_traceability_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_item_traceability_policy_events_policy_idx
  ON inventory_item_traceability_policy_events(policy_id,created_at);

ALTER TABLE boms
  ADD COLUMN IF NOT EXISTS parent_inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS parent_part_number_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS parent_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS parent_revision_snapshot TEXT;

ALTER TABLE bom_revisions
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
  ADD COLUMN IF NOT EXISTS effectivity JSONB,
  ADD COLUMN IF NOT EXISTS content_checksum TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_display_name TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_display_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_role TEXT,
  ADD COLUMN IF NOT EXISTS approval_capacity TEXT,
  ADD COLUMN IF NOT EXISTS signature_meaning TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_revision_id UUID REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS concurrency_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE bom_revisions DROP CONSTRAINT IF EXISTS bom_revisions_lifecycle_status_check;
ALTER TABLE bom_revisions ADD CONSTRAINT bom_revisions_lifecycle_status_check
  CHECK (lifecycle_status IS NULL OR lifecycle_status IN (
    'DRAFT','PENDING_APPROVAL','RELEASED','SUPERSEDED','REJECTED','RETURNED'
  ));
ALTER TABLE bom_revisions DROP CONSTRAINT IF EXISTS bom_revisions_release_evidence_check;
ALTER TABLE bom_revisions ADD CONSTRAINT bom_revisions_release_evidence_check
  CHECK (lifecycle_status <> 'RELEASED' OR (
    approved_by_display_name IS NOT NULL AND approved_by_role IS NOT NULL AND
    approval_capacity IS NOT NULL AND signature_meaning IS NOT NULL AND approved_at IS NOT NULL
  ));

ALTER TABLE bom_lines
  ADD COLUMN IF NOT EXISTS child_inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS child_part_number_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS child_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS child_revision_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
  ADD COLUMN IF NOT EXISTS make_buy_disposition TEXT,
  ADD COLUMN IF NOT EXISTS assembly_path_identity TEXT,
  ADD COLUMN IF NOT EXISTS inherited_policy_id UUID REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inherited_policy_revision INTEGER,
  ADD COLUMN IF NOT EXISTS inherited_policy_type TEXT,
  ADD COLUMN IF NOT EXISTS traceability_override_policy_type TEXT,
  ADD COLUMN IF NOT EXISTS traceability_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS traceability_override_effectivity JSONB,
  ADD COLUMN IF NOT EXISTS traceability_override_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS traceability_override_approver_name TEXT,
  ADD COLUMN IF NOT EXISTS traceability_override_signature_meaning TEXT,
  ADD COLUMN IF NOT EXISTS traceability_override_approved_at TIMESTAMPTZ;

ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_make_buy_disposition_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_make_buy_disposition_check
  CHECK (make_buy_disposition IS NULL OR make_buy_disposition IN ('MAKE','BUY'));
ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_inherited_policy_type_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_inherited_policy_type_check
  CHECK (inherited_policy_type IS NULL OR inherited_policy_type IN (
    'SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED'
  ));
ALTER TABLE bom_lines DROP CONSTRAINT IF EXISTS bom_lines_override_policy_type_check;
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_override_policy_type_check
  CHECK (traceability_override_policy_type IS NULL OR traceability_override_policy_type IN (
    'SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED'
  ));

CREATE INDEX IF NOT EXISTS boms_parent_inventory_item_id_idx ON boms(parent_inventory_item_id);
CREATE INDEX IF NOT EXISTS bom_lines_child_inventory_item_id_idx ON bom_lines(child_inventory_item_id);
CREATE INDEX IF NOT EXISTS bom_lines_inherited_policy_id_idx ON bom_lines(inherited_policy_id);

CREATE TABLE IF NOT EXISTS controlled_bom_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID NOT NULL REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  signature_meaning TEXT,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS controlled_bom_events_revision_idx
  ON controlled_bom_events(bom_revision_id,created_at);

CREATE OR REPLACE FUNCTION prevent_released_inventory_traceability_policy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.status='RELEASED' THEN
    RAISE EXCEPTION 'Released traceability policies are immutable; create a revision';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='RELEASED' AND NOT (
    NEW.status='SUPERSEDED' AND
    (to_jsonb(NEW)-ARRAY['status','updated_at','concurrency_version']) =
    (to_jsonb(OLD)-ARRAY['status','updated_at','concurrency_version'])
  ) THEN
    RAISE EXCEPTION 'Released traceability policies are immutable; create a revision';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_traceability_policy_released_immutable
  ON inventory_item_traceability_policies;
CREATE TRIGGER inventory_traceability_policy_released_immutable
BEFORE UPDATE OR DELETE ON inventory_item_traceability_policies
FOR EACH ROW EXECUTE FUNCTION prevent_released_inventory_traceability_policy_mutation();

CREATE OR REPLACE FUNCTION prevent_released_controlled_bom_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifecycle_status='RELEASED' THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Released controlled BOM revisions are immutable; create a revision';
    END IF;
    IF NOT (
      NEW.lifecycle_status='SUPERSEDED' AND
      (to_jsonb(NEW)-ARRAY['lifecycle_status','is_released','updated_at','concurrency_version']) =
      (to_jsonb(OLD)-ARRAY['lifecycle_status','is_released','updated_at','concurrency_version'])
    ) THEN
      RAISE EXCEPTION 'Released controlled BOM revisions are immutable; create a revision';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS controlled_bom_revision_released_immutable ON bom_revisions;
CREATE TRIGGER controlled_bom_revision_released_immutable
BEFORE UPDATE OR DELETE ON bom_revisions
FOR EACH ROW WHEN (OLD.lifecycle_status IS NOT NULL)
EXECUTE FUNCTION prevent_released_controlled_bom_mutation();

CREATE OR REPLACE FUNCTION prevent_released_controlled_bom_line_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE controlled_status TEXT;
BEGIN
  SELECT lifecycle_status INTO controlled_status
    FROM bom_revisions WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  IF controlled_status='RELEASED' THEN
    RAISE EXCEPTION 'Released controlled BOM lines are immutable; create a revision';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS controlled_bom_line_released_immutable ON bom_lines;
CREATE TRIGGER controlled_bom_line_released_immutable
BEFORE INSERT OR UPDATE OR DELETE ON bom_lines
FOR EACH ROW EXECUTE FUNCTION prevent_released_controlled_bom_line_mutation();

INSERT INTO perm_capabilities (key,description,category) VALUES
 ('inventory.traceability_policy.view','View controlled Inventory Item traceability policies','inventory'),
 ('inventory.traceability_policy.edit','Create and edit draft Inventory Item traceability policies','inventory'),
 ('inventory.traceability_policy.submit','Submit Inventory Item traceability policies for approval','inventory'),
 ('inventory.traceability_policy.approve','Approve and release Inventory Item traceability policies','quality'),
 ('engineering.controlled_bom.view','View controlled BOM status and traceability previews','engineering'),
 ('engineering.controlled_bom.edit','Create and edit controlled BOM drafts','engineering'),
 ('engineering.controlled_bom.submit','Submit controlled BOM revisions for approval','engineering'),
 ('engineering.controlled_bom.approve','Approve and release controlled BOM revisions','engineering'),
 ('engineering.controlled_bom.traceability_override','Approve stricter controlled BOM traceability overrides','quality')
ON CONFLICT (key) DO NOTHING;
