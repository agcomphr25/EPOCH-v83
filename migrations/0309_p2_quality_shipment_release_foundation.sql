-- Phase 12: prospective Quality acceptance and shipment-release authority.
-- Evidence only: no shipment, inventory, historical, or genealogy row is created or changed.

CREATE TABLE IF NOT EXISTS p2_manufactured_output_quality_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_authority_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  custody_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_output_custodies(id) ON DELETE RESTRICT,
  disposition TEXT NOT NULL CHECK (disposition IN ('ACCEPTED','REJECTED')),
  inspection_reference TEXT NOT NULL CHECK (length(btrim(inspection_reference)) > 0),
  reason_text TEXT NOT NULL CHECK (length(btrim(reason_text)) >= 10),
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  concurrency_version INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_version > 0),
  accepted_by_user_id INTEGER NOT NULL,
  accepted_by_employee_id INTEGER NOT NULL,
  accepted_by_display_name TEXT NOT NULL,
  accepted_by_role TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, output_authority_id, custody_id)
);

CREATE TABLE IF NOT EXISTS p2_manufactured_output_shipment_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_authority_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_output_authorities(id) ON DELETE RESTRICT,
  custody_id UUID NOT NULL UNIQUE REFERENCES p2_manufactured_output_custodies(id) ON DELETE RESTRICT,
  quality_acceptance_id UUID NOT NULL UNIQUE,
  release_scope TEXT NOT NULL CHECK (release_scope='SHIPMENT_ELIGIBILITY_ONLY'),
  release_reference TEXT NOT NULL CHECK (length(btrim(release_reference)) > 0),
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  released_by_user_id INTEGER NOT NULL,
  released_by_employee_id INTEGER NOT NULL,
  released_by_display_name TEXT NOT NULL,
  released_by_role TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (quality_acceptance_id, output_authority_id, custody_id)
    REFERENCES p2_manufactured_output_quality_acceptances(id, output_authority_id, custody_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION p2_quality_shipment_evidence_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 Quality and shipment-release authority evidence is immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_output_quality_acceptance_immutable ON p2_manufactured_output_quality_acceptances;
CREATE TRIGGER p2_output_quality_acceptance_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_output_quality_acceptances
  FOR EACH ROW EXECUTE FUNCTION p2_quality_shipment_evidence_immutable();
DROP TRIGGER IF EXISTS p2_output_shipment_release_immutable ON p2_manufactured_output_shipment_releases;
CREATE TRIGGER p2_output_shipment_release_immutable BEFORE UPDATE OR DELETE ON p2_manufactured_output_shipment_releases
  FOR EACH ROW EXECUTE FUNCTION p2_quality_shipment_evidence_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.manufactured_output.quality_accept','Record independent Quality disposition for manufactured output','quality'),
 ('p2.manufactured_output.shipment_release','Independently authorize shipment eligibility for accepted output','quality')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c WHERE
 r.name IN ('ADMIN','OWNER') AND c.key IN ('p2.manufactured_output.quality_accept','p2.manufactured_output.shipment_release')
ON CONFLICT DO NOTHING;
