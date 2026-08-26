-- Phase 7: P2 traveler provisioning and authoritative unit-coverage ledger.
-- Additive and prospective only. No historical traveler, work-order, or inventory row is changed.

CREATE TABLE IF NOT EXISTS p2_traveler_provisioning_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  traveler_id VARCHAR(255) NOT NULL UNIQUE REFERENCES travelers(id) ON DELETE RESTRICT,
  traveler_type TEXT NOT NULL CHECK (traveler_type IN ('INDIVIDUAL','BATCH')),
  coverage_quantity INTEGER NOT NULL CHECK (coverage_quantity > 0),
  coverage_start_ordinal INTEGER NOT NULL CHECK (coverage_start_ordinal > 0),
  coverage_end_ordinal INTEGER NOT NULL CHECK (coverage_end_ordinal >= coverage_start_ordinal),
  output_identity TEXT NOT NULL UNIQUE,
  barcode_value TEXT NOT NULL UNIQUE,
  authority_snapshot JSONB NOT NULL,
  authority_checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
  created_by_user_id INTEGER NOT NULL,
  created_by_employee_id INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (coverage_end_ordinal - coverage_start_ordinal + 1 = coverage_quantity),
  CHECK ((traveler_type = 'INDIVIDUAL' AND coverage_quantity = 1) OR traveler_type = 'BATCH')
);
CREATE INDEX IF NOT EXISTS p2_tpa_work_order_idx
  ON p2_traveler_provisioning_authorities(work_order_authority_id,status);

CREATE TABLE IF NOT EXISTS p2_traveler_coverage_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  provisioning_authority_id UUID NOT NULL REFERENCES p2_traveler_provisioning_authorities(id) ON DELETE RESTRICT,
  traveler_id VARCHAR(255) NOT NULL REFERENCES travelers(id) ON DELETE RESTRICT,
  unit_ordinal INTEGER NOT NULL CHECK (unit_ordinal > 0),
  output_identity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_order_authority_id,unit_ordinal),
  UNIQUE(output_identity)
);

CREATE TABLE IF NOT EXISTS p2_traveler_provisioning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_authority_id UUID NOT NULL REFERENCES p2_manufacturing_work_order_authorities(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  actor_employee_id INTEGER NOT NULL,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_order_authority_id,event_type,request_key)
);

CREATE OR REPLACE FUNCTION p2_traveler_provisioning_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'P2 traveler provisioning authority and coverage are immutable'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS p2_tpa_immutable ON p2_traveler_provisioning_authorities;
CREATE TRIGGER p2_tpa_immutable BEFORE UPDATE OR DELETE ON p2_traveler_provisioning_authorities
  FOR EACH ROW EXECUTE FUNCTION p2_traveler_provisioning_immutable();
DROP TRIGGER IF EXISTS p2_tcu_immutable ON p2_traveler_coverage_units;
CREATE TRIGGER p2_tcu_immutable BEFORE UPDATE OR DELETE ON p2_traveler_coverage_units
  FOR EACH ROW EXECUTE FUNCTION p2_traveler_provisioning_immutable();
DROP TRIGGER IF EXISTS p2_tpe_immutable ON p2_traveler_provisioning_events;
CREATE TRIGGER p2_tpe_immutable BEFORE UPDATE OR DELETE ON p2_traveler_provisioning_events
  FOR EACH ROW EXECUTE FUNCTION p2_traveler_provisioning_immutable();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.travelers.provision','Provision controlled P2 travelers and unit coverage','projects')
ON CONFLICT (key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER') AND c.key='p2.travelers.provision'
ON CONFLICT DO NOTHING;
