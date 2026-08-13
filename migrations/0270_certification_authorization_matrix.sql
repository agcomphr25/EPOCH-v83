-- Authoritative Training-owned Certification & Authorization Matrix.
-- Prospective enforcement remains disabled until controlled rollout.
CREATE TABLE IF NOT EXISTS certification_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  program text NOT NULL CHECK (program IN ('P1','P2','DESIGN','GENERAL','OTHER')),
  part_number text,
  product_family text,
  department text,
  operation_scope text,
  authorization_type text NOT NULL CHECK (authorization_type IN ('WORK','QC_INSPECTION','ROUTING_RELEASE','FINAL_QC','FINAL_PRODUCT_RELEASE','COC_APPROVAL')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
  effective_date timestamptz,
  expiration_date timestamptz,
  approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  signature_meaning text,
  qualification_method text,
  evidence_reference text,
  notes text,
  limitations text,
  legacy_p2_employee_certification_id integer REFERENCES p2_employee_part_certifications(id) ON DELETE RESTRICT,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (part_number IS NOT NULL OR product_family IS NOT NULL OR program IN ('GENERAL','OTHER')),
  CHECK (expiration_date IS NULL OR effective_date IS NULL OR expiration_date > effective_date),
  CHECK (status <> 'ACTIVE' OR (approved_at IS NOT NULL AND signature_meaning IS NOT NULL AND effective_date IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_auth_legacy_p2
  ON certification_authorizations(legacy_p2_employee_certification_id)
  WHERE legacy_p2_employee_certification_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_auth_active_scope
  ON certification_authorizations(employee_id, program, COALESCE(part_number,''), COALESCE(product_family,''), COALESCE(department,''), COALESCE(operation_scope,''), authorization_type)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_cert_auth_register
  ON certification_authorizations(program, status, authorization_type, expiration_date);

CREATE TABLE IF NOT EXISTS certification_authorization_events (
  id bigserial PRIMARY KEY,
  authorization_id uuid NOT NULL REFERENCES certification_authorizations(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','APPROVED','UPDATED','SUSPENDED','REVOKED','RENEWED','EXPIRED','MIGRATED')),
  snapshot jsonb NOT NULL,
  reason text,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authorization_id, revision)
);

CREATE TABLE IF NOT EXISTS certification_authorization_use_snapshots (
  id bigserial PRIMARY KEY,
  authorization_id uuid NOT NULL REFERENCES certification_authorizations(id) ON DELETE RESTRICT,
  authorization_revision integer NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('TRAVELER_START','QC_ACCEPTANCE','ROUTING_RELEASE','FINAL_PRODUCT_RELEASE','COC_APPROVAL')),
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  part_number text,
  product_family text,
  qualification_status text NOT NULL,
  effective_date timestamptz,
  expiration_date timestamptz,
  approver_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certification_authorization_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO certification_authorization_feature_flags(key, enabled)
VALUES ('prospective_enforcement', false) ON CONFLICT (key) DO NOTHING;

-- Conservative compatibility backfill: evidence becomes DRAFT WORK only.
-- No QC, release, or CoC authority is inferred from legacy checkboxes.
INSERT INTO certification_authorizations (
  employee_id, program, part_number, department, authorization_type, status,
  qualification_method, evidence_reference, notes,
  legacy_p2_employee_certification_id, created_by_user_id, updated_by_user_id
)
SELECT pc.employee_id, 'P2', pc.part_number, pc.department, 'WORK', 'DRAFT',
       'LEGACY_P2_COMPETENCY_REVIEW', 'p2_employee_part_certifications:' || pc.id,
       'Conservative migration; requires controlled approval before activation.',
       pc.id, u.id, u.id
FROM p2_employee_part_certifications pc
JOIN LATERAL (SELECT id FROM users WHERE role IN ('OWNER','ADMIN') ORDER BY id LIMIT 1) u ON true
ON CONFLICT (legacy_p2_employee_certification_id)
  WHERE legacy_p2_employee_certification_id IS NOT NULL
DO NOTHING;

INSERT INTO certification_authorization_events(authorization_id, revision, event_type, snapshot, reason, actor_user_id)
SELECT a.id, a.revision, 'MIGRATED', to_jsonb(a),
       'Conservative legacy P2 backfill as DRAFT WORK authorization only.', a.created_by_user_id
FROM certification_authorizations a
WHERE a.legacy_p2_employee_certification_id IS NOT NULL
ON CONFLICT (authorization_id, revision) DO NOTHING;

INSERT INTO perm_capabilities(key, description, category) VALUES
 ('training.authorization.view','View Certification & Authorization Matrix','training'),
 ('training.authorization.grant','Create draft certification authorizations','training'),
 ('training.authorization.approve','Approve or renew certification authorizations','training'),
 ('training.authorization.change_status','Suspend or revoke certification authorizations','training')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities(role_id, capability_id)
SELECT r.id, c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('OWNER','ADMIN') AND c.key LIKE 'training.authorization.%'
ON CONFLICT DO NOTHING;
