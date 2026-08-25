-- Phase 3 foundation: prospective P2 project selection of released master configuration.
-- Additive only. Historical projects, routings, BOMs and execution records are unchanged.

ALTER TABLE part_routings ADD COLUMN IF NOT EXISTS lifecycle_status TEXT;

CREATE TABLE IF NOT EXISTS p2_project_controlled_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RELEASED','SUPERSEDED')),
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  inventory_part_number_snapshot TEXT NOT NULL,
  inventory_name_snapshot TEXT NOT NULL,
  inventory_revision_snapshot TEXT,
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE RESTRICT,
  bom_revision_id UUID NOT NULL REFERENCES bom_revisions(id) ON DELETE RESTRICT,
  bom_revision_snapshot TEXT NOT NULL,
  bom_checksum_snapshot TEXT NOT NULL,
  routing_id UUID NOT NULL REFERENCES part_routings(id) ON DELETE RESTRICT,
  routing_revision_snapshot TEXT NOT NULL,
  routing_snapshot JSONB NOT NULL,
  effectivity JSONB NOT NULL,
  customer_configuration JSONB NOT NULL,
  content_checksum TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  released_by INTEGER,
  released_by_display_name TEXT,
  released_by_role TEXT,
  release_signature_meaning TEXT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, revision_number)
);

CREATE INDEX IF NOT EXISTS p2_project_controlled_configurations_project_idx
  ON p2_project_controlled_configurations(project_id, revision_number DESC);

CREATE OR REPLACE FUNCTION p2_project_controlled_configuration_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('RELEASED','SUPERSEDED') THEN
    RAISE EXCEPTION 'Released project configuration snapshots are immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_project_controlled_configuration_immutable ON p2_project_controlled_configurations;
CREATE TRIGGER p2_project_controlled_configuration_immutable BEFORE UPDATE OR DELETE
  ON p2_project_controlled_configurations FOR EACH ROW EXECUTE FUNCTION p2_project_controlled_configuration_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('projects.controlled_configuration.view','View P2 project controlled configuration selections','projects'),
 ('projects.controlled_configuration.manage','Create and release P2 project controlled configuration selections','projects')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER') AND c.key IN ('projects.controlled_configuration.view','projects.controlled_configuration.manage')
ON CONFLICT DO NOTHING;
