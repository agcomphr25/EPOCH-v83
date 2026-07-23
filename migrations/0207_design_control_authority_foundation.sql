-- Phase 2A: explicit, non-destructive Design Control authority.
-- Single-record projects can be designated deterministically. Duplicate-record
-- projects are intentionally left unresolved and flagged for reconciliation.

ALTER TABLE IF EXISTS design_control_records
  ADD COLUMN IF NOT EXISTS authority_status text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS designated_authoritative_at timestamp,
  ADD COLUMN IF NOT EXISTS designated_authoritative_by text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamp,
  ADD COLUMN IF NOT EXISTS superseded_by text,
  ADD COLUMN IF NOT EXISTS supersession_reason text,
  ADD COLUMN IF NOT EXISTS superseded_by_record_id uuid,
  ADD COLUMN IF NOT EXISTS record_version integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE design_control_records
    ADD CONSTRAINT design_control_records_authority_status_check
    CHECK (authority_status IN ('legacy', 'authoritative', 'reconciliation_required', 'superseded'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE design_control_records
    ADD CONSTRAINT design_control_records_superseded_by_record_fk
    FOREIGN KEY (superseded_by_record_id)
    REFERENCES design_control_records(id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

WITH project_summary AS (
  SELECT
    rd_project_id,
    count(*) AS record_count,
    bool_or(authority_status IN ('legacy', 'reconciliation_required')) AS has_unresolved_records
  FROM design_control_records
  WHERE rd_project_id IS NOT NULL
  GROUP BY rd_project_id
)
UPDATE design_control_records dcr
SET authority_status = CASE
      WHEN ps.record_count = 1 THEN 'authoritative'
      ELSE 'reconciliation_required'
    END,
    designated_authoritative_at = CASE
      WHEN ps.record_count = 1 THEN COALESCE(dcr.designated_authoritative_at, now())
      ELSE dcr.designated_authoritative_at
    END,
    designated_authoritative_by = CASE
      WHEN ps.record_count = 1 THEN COALESCE(dcr.designated_authoritative_by, 'migration:0207')
      ELSE dcr.designated_authoritative_by
    END
FROM project_summary ps
WHERE dcr.rd_project_id = ps.rd_project_id
  AND (
    (ps.record_count = 1 AND dcr.authority_status IN ('legacy', 'reconciliation_required'))
    OR (
      ps.record_count > 1
      AND ps.has_unresolved_records
      AND dcr.authority_status <> 'superseded'
    )
  );

CREATE INDEX IF NOT EXISTS design_control_records_authority_status_idx
  ON design_control_records(authority_status);

CREATE UNIQUE INDEX IF NOT EXISTS design_control_records_authoritative_rd_project_unique
  ON design_control_records(rd_project_id)
  WHERE authority_status = 'authoritative' AND rd_project_id IS NOT NULL;

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('design.control.create', 'Initialize the authoritative Design Control record for an R&D project', 'design'),
  ('design.control.admin', 'Resolve duplicate Design Control authority and designate the current record', 'design')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key = 'design.control.create'
WHERE role.name IN ('ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ENGINEERING')
ON CONFLICT DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON capability.key = 'design.control.admin'
WHERE role.name IN ('ADMIN', 'OWNER')
ON CONFLICT DO NOTHING;
