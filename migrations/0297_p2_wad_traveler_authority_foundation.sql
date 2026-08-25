-- Phase 4 foundation: prospective WAD traveler decisions against released master policy.
-- Additive only; no historical WAD, traveler, work-order or Inventory record is changed.
CREATE TABLE IF NOT EXISTS p2_wad_traveler_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wad_authorization_id UUID NOT NULL REFERENCES project_wad_authorizations(id) ON DELETE RESTRICT,
  project_configuration_id UUID NOT NULL REFERENCES p2_project_controlled_configurations(id) ON DELETE RESTRICT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  assembly_path_identity TEXT NOT NULL,
  required_quantity NUMERIC(18,6) NOT NULL CHECK (required_quantity > 0),
  traveler_requirement TEXT NOT NULL CHECK (traveler_requirement IN ('REQUIRED','NOT_REQUIRED_APPROVED')),
  traveler_type TEXT CHECK (traveler_type IN ('INDIVIDUAL','BATCH')),
  traceability_policy_id UUID NOT NULL REFERENCES inventory_item_traceability_policies(id) ON DELETE RESTRICT,
  traceability_policy_revision INTEGER NOT NULL,
  traceability_policy_type_snapshot TEXT NOT NULL,
  traceability_requirements_snapshot JSONB NOT NULL,
  inspection_requirements_snapshot JSONB NOT NULL,
  exception_required BOOLEAN NOT NULL DEFAULT false,
  exception_reason TEXT,
  exception_effectivity JSONB,
  exception_approved_by INTEGER,
  exception_approver_display_name TEXT,
  exception_signature_meaning TEXT,
  exception_approved_at TIMESTAMPTZ,
  content_checksum TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wad_authorization_id,inventory_item_id,assembly_path_identity),
  CHECK (traveler_requirement='REQUIRED' OR (exception_required AND exception_reason IS NOT NULL)),
  CHECK (traveler_requirement<>'REQUIRED' OR traveler_type IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS p2_wad_traveler_decisions_configuration_idx ON p2_wad_traveler_decisions(project_configuration_id);

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('projects.wad_traveler_decisions.manage','Manage controlled WAD traveler decisions','projects'),
 ('projects.wad_traveler_decisions.exception_approve','Approve a WAD exception that may weaken master traceability','quality')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 (r.name IN ('ADMIN','OWNER') AND c.key IN ('projects.wad_traveler_decisions.manage','projects.wad_traveler_decisions.exception_approve')) OR
 (r.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND c.key='projects.wad_traveler_decisions.manage') OR
 (r.name IN ('QUALITY','QUALITY_MANAGER') AND c.key='projects.wad_traveler_decisions.exception_approve')
ON CONFLICT DO NOTHING;
