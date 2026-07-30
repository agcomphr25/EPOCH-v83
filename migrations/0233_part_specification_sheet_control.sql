-- Additive control model for typed Part Specification Sheet templates and revisions.

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS template_revision TEXT NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS controlled_document_id UUID REFERENCES controlled_documents(id) ON DELETE RESTRICT;

ALTER TABLE template_fields
  ADD COLUMN IF NOT EXISTS columns JSONB,
  ADD COLUMN IF NOT EXISTS minimum_rows INTEGER,
  ADD COLUMN IF NOT EXISTS maximum_rows INTEGER,
  ADD COLUMN IF NOT EXISTS allow_manual_rows BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_import BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_source JSONB,
  ADD COLUMN IF NOT EXISTS pdf_layout JSONB;

ALTER TABLE spec_sheets
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES document_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS template_revision TEXT,
  ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS routing_revision TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS specification_revision TEXT NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS controlled_document_id UUID REFERENCES controlled_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS released_revision_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_spec_sheet_id UUID REFERENCES spec_sheets(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS source_change_status TEXT NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN IF NOT EXISTS source_change_details JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS spec_sheet_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_sheet_id UUID NOT NULL REFERENCES spec_sheets(id) ON DELETE RESTRICT,
  controlled_document_revision_id UUID REFERENCES document_version_history(id) ON DELETE RESTRICT,
  revision TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
  template_id UUID REFERENCES document_templates(id) ON DELETE RESTRICT,
  template_revision TEXT NOT NULL,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE RESTRICT,
  part_routing_id UUID REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_revision TEXT,
  content_snapshot JSONB NOT NULL,
  content_checksum TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_checksum TEXT,
  effective_date DATE,
  superseded_by_revision_id UUID REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_by_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  UNIQUE (spec_sheet_id, revision)
);

CREATE TABLE IF NOT EXISTS spec_sheet_revision_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_sheet_revision_id UUID NOT NULL REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT,
  approval_role TEXT NOT NULL,
  decision TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_snapshot TEXT NOT NULL,
  content_checksum TEXT NOT NULL,
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spec_sheet_revision_id, approval_role)
);

ALTER TABLE spec_sheets
  ADD COLUMN IF NOT EXISTS working_revision_id UUID;

ALTER TABLE spec_sheets
  DROP CONSTRAINT IF EXISTS spec_sheets_released_revision_id_fkey;
ALTER TABLE spec_sheets
  ADD CONSTRAINT spec_sheets_released_revision_id_fkey
  FOREIGN KEY (released_revision_id) REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT;

ALTER TABLE spec_sheets
  DROP CONSTRAINT IF EXISTS spec_sheets_working_revision_id_fkey;
ALTER TABLE spec_sheets
  ADD CONSTRAINT spec_sheets_working_revision_id_fkey
  FOREIGN KEY (working_revision_id) REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS spec_sheet_transition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_sheet_id UUID NOT NULL REFERENCES spec_sheets(id) ON DELETE RESTRICT,
  spec_sheet_revision_id UUID NOT NULL REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot JSONB NOT NULL,
  content_checksum TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spec_sheet_revisions_sheet_idx ON spec_sheet_revisions(spec_sheet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spec_sheet_revisions_inventory_idx ON spec_sheet_revisions(inventory_item_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS spec_sheet_approvals_revision_idx ON spec_sheet_revision_approvals(spec_sheet_revision_id);
CREATE INDEX IF NOT EXISTS spec_sheets_inventory_effective_idx ON spec_sheets(inventory_item_id, lifecycle_status, effective_date);
CREATE INDEX IF NOT EXISTS spec_sheet_transition_audit_revision_idx
  ON spec_sheet_transition_audit(spec_sheet_revision_id, transitioned_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spec_sheet_revisions_lifecycle_check'
      AND conrelid = 'spec_sheet_revisions'::regclass
  ) THEN
    ALTER TABLE spec_sheet_revisions
      ADD CONSTRAINT spec_sheet_revisions_lifecycle_check
      CHECK (lifecycle_status IN ('DRAFT', 'IN_REVIEW', 'RELEASED', 'SUPERSEDED', 'OBSOLETE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spec_sheet_approvals_decision_check'
      AND conrelid = 'spec_sheet_revision_approvals'::regclass
  ) THEN
    ALTER TABLE spec_sheet_revision_approvals
      ADD CONSTRAINT spec_sheet_approvals_decision_check
      CHECK (decision IN ('APPROVED', 'REJECTED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spec_sheet_approvals_role_check'
      AND conrelid = 'spec_sheet_revision_approvals'::regclass
  ) THEN
    ALTER TABLE spec_sheet_revision_approvals
      ADD CONSTRAINT spec_sheet_approvals_role_check
      CHECK (approval_role IN ('ENGINEERING', 'QUALITY', 'PRODUCTION', 'CUSTOMER'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION protect_terminal_spec_sheet_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.lifecycle_status IN ('RELEASED', 'SUPERSEDED', 'OBSOLETE') THEN
    RAISE EXCEPTION 'Terminal specification revisions cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.lifecycle_status IN ('RELEASED', 'SUPERSEDED', 'OBSOLETE')
     AND (
       NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.template_revision IS DISTINCT FROM OLD.template_revision
       OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
       OR NEW.part_routing_id IS DISTINCT FROM OLD.part_routing_id
       OR NEW.routing_revision IS DISTINCT FROM OLD.routing_revision
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.content_checksum IS DISTINCT FROM OLD.content_checksum
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.file_checksum IS DISTINCT FROM OLD.file_checksum
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
     ) THEN
    RAISE EXCEPTION 'Terminal specification revision content is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS protect_terminal_spec_sheet_revision_trigger
  ON spec_sheet_revisions;
CREATE TRIGGER protect_terminal_spec_sheet_revision_trigger
BEFORE UPDATE OR DELETE ON spec_sheet_revisions
FOR EACH ROW EXECUTE FUNCTION protect_terminal_spec_sheet_revision();

DO $$
BEGIN
  IF to_regclass('public.travelers') IS NOT NULL THEN
    ALTER TABLE travelers ADD COLUMN IF NOT EXISTS spec_sheet_revision_id UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'travelers_spec_sheet_revision_id_fkey'
    ) THEN
      ALTER TABLE travelers
        ADD CONSTRAINT travelers_spec_sheet_revision_id_fkey
        FOREIGN KEY (spec_sheet_revision_id) REFERENCES spec_sheet_revisions(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  capability_key TEXT;
BEGIN
  IF to_regclass('public.perm_capabilities') IS NULL THEN
    RETURN;
  END IF;

  FOREACH capability_key IN ARRAY ARRAY[
    'spec_sheets.template.create',
    'spec_sheets.template.update',
    'spec_sheets.template.deactivate',
    'spec_sheets.create',
    'spec_sheets.edit',
    'spec_sheets.submit',
    'spec_sheets.approve.engineering',
    'spec_sheets.approve.quality',
    'spec_sheets.approve.production',
    'spec_sheets.approve.customer',
    'spec_sheets.release',
    'spec_sheets.supersede',
    'spec_sheets.obsolete',
    'spec_sheets.reopen',
    'spec_sheets.delete',
    'spec_sheets.history.view'
  ] LOOP
    INSERT INTO perm_capabilities (key, description, category)
    VALUES (
      capability_key,
      'Controlled Part Specification Sheet capability',
      'spec_sheets'
    )
    ON CONFLICT (key) DO NOTHING;
  END LOOP;

  IF to_regclass('public.perm_roles') IS NOT NULL
     AND to_regclass('public.perm_role_capabilities') IS NOT NULL THEN
    INSERT INTO perm_role_capabilities (role_id, capability_id)
    SELECT role_row.id, capability_row.id
    FROM perm_roles role_row
    CROSS JOIN perm_capabilities capability_row
    WHERE UPPER(role_row.name) IN ('ADMIN', 'OWNER')
      AND capability_row.key LIKE 'spec_sheets.%'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
