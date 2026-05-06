-- Written Policies Library: in-repo + external-upload, immutable versions, acknowledgments

CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'in-repo', -- 'in-repo' | 'external-upload'
  owner text,
  effective_date date,
  requires_acknowledgment boolean NOT NULL DEFAULT true,
  acknowledgment_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  current_version_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source IN ('in-repo', 'external-upload'))
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  body text,                         -- markdown body for in-repo / md uploads
  source_path text,                  -- e.g. 'docs/policies/timekeeping.md'
  uploaded_file_url text,            -- object storage path for external uploads
  uploaded_file_name text,
  uploaded_file_mime text,
  content_hash text NOT NULL,        -- sha256 hex of body or uploaded file
  change_summary text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by_user_id integer REFERENCES users(id),
  published_by_display_name text,
  UNIQUE (policy_id, version_number)
);

ALTER TABLE policies
  ADD CONSTRAINT policies_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES policy_versions(id);

CREATE TABLE IF NOT EXISTS policy_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  policy_version_id uuid NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id),
  user_display_name text NOT NULL,
  user_role text,
  ip_address text,
  user_agent text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_version_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_policy_acks_user ON policy_acknowledgments(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_policy ON policy_acknowledgments(policy_id);

-- Immutability triggers: policy_versions and policy_acknowledgments are append-only
CREATE OR REPLACE FUNCTION policies_block_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rows in % are immutable; use a new version or acknowledgment', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS policy_versions_no_update ON policy_versions;
CREATE TRIGGER policy_versions_no_update BEFORE UPDATE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION policies_block_update_delete();

DROP TRIGGER IF EXISTS policy_versions_no_delete ON policy_versions;
CREATE TRIGGER policy_versions_no_delete BEFORE DELETE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION policies_block_update_delete();

DROP TRIGGER IF EXISTS policy_acks_no_update ON policy_acknowledgments;
CREATE TRIGGER policy_acks_no_update BEFORE UPDATE ON policy_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION policies_block_update_delete();

DROP TRIGGER IF EXISTS policy_acks_no_delete ON policy_acknowledgments;
CREATE TRIGGER policy_acks_no_delete BEFORE DELETE ON policy_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION policies_block_update_delete();

-- Seed the seven required in-repo policies (versions are published from the admin UI)
INSERT INTO policies (key, title, description, source, owner, effective_date, requires_acknowledgment, acknowledgment_roles)
VALUES
  ('timekeeping',              'Timekeeping Policy',                'Daily time entry, certification, and supervisor approval rules.',         'in-repo', 'Director of Operations', DATE '2026-05-06', true,  ARRAY['EMPLOYEE','ADMIN','OWNER']),
  ('labor-charging',           'Labor Charging Policy',             'Direct vs. indirect labor charging against authorized WADs.',             'in-repo', 'Controller',             DATE '2026-05-06', true,  ARRAY['EMPLOYEE','ADMIN','OWNER']),
  ('corrections',              'Timesheet Corrections Policy',      'After-the-fact timesheet correction workflow.',                           'in-repo', 'Payroll Administrator',  DATE '2026-05-06', true,  ARRAY['EMPLOYEE','ADMIN','OWNER']),
  ('approvals',                'Approvals Policy',                  'Multi-stage approval responsibilities for time, PTO, and labor.',         'in-repo', 'Director of Operations', DATE '2026-05-06', true,  ARRAY['ADMIN','OWNER']),
  ('period-close',             'Period Close Policy',               'Pay period and accounting period close procedures.',                      'in-repo', 'Controller',             DATE '2026-05-06', true,  ARRAY['ADMIN','OWNER']),
  ('indirect-cost-allocation', 'Indirect Cost Allocation Policy',   'Indirect cost pools, allocation bases, and rate computation.',            'in-repo', 'Controller',             DATE '2026-05-06', true,  ARRAY['ADMIN','OWNER']),
  ('unallowable-costs',        'Unallowable Costs Policy',          'Identification, segregation, and exclusion of FAR Part 31 unallowable costs.', 'in-repo', 'Controller',         DATE '2026-05-06', true,  ARRAY['ADMIN','OWNER'])
ON CONFLICT (key) DO NOTHING;
