-- Section 6 Procurement System controls.
-- Adds approval thresholds, supplier scope/audit/scorecard records, and
-- vendor qualification columns used by the fail-closed PO issue gate.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS debarment_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS debarment_checked_at timestamp,
  ADD COLUMN IF NOT EXISTS debarment_evidence_url text,
  ADD COLUMN IF NOT EXISTS debarment_notes text;

CREATE TABLE IF NOT EXISTS supplier_scopes (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  scope_code text NOT NULL,
  description text,
  production_line text,
  material_category text,
  part_number_pattern text,
  status text NOT NULL DEFAULT 'active',
  approved_by_user_id integer,
  approved_by_display_name text,
  approved_at timestamp,
  expires_at date,
  evidence_url text,
  notes text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_scopes_vendor_scope_unique UNIQUE (vendor_id, scope_code)
);

CREATE INDEX IF NOT EXISTS idx_supplier_scopes_vendor_id ON supplier_scopes(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scopes_status ON supplier_scopes(status);

CREATE TABLE IF NOT EXISTS supplier_audits (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  audit_type text NOT NULL DEFAULT 'qualification',
  status text NOT NULL DEFAULT 'open',
  performed_by_user_id integer,
  performed_by_display_name text,
  audit_date date NOT NULL,
  next_audit_due date,
  findings text,
  corrective_actions text,
  evidence_url text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_audits_vendor_id ON supplier_audits(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_audits_status ON supplier_audits(status);
CREATE INDEX IF NOT EXISTS idx_supplier_audits_next_due ON supplier_audits(next_audit_due);

CREATE TABLE IF NOT EXISTS supplier_scorecards (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  quality_score integer NOT NULL,
  delivery_score integer NOT NULL,
  cost_score integer NOT NULL,
  responsiveness_score integer NOT NULL,
  overall_score real NOT NULL,
  status text NOT NULL DEFAULT 'acceptable',
  reviewed_by_user_id integer,
  reviewed_by_display_name text,
  reviewed_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_scorecards_vendor_period_unique UNIQUE (vendor_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_vendor_id ON supplier_scorecards(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_period ON supplier_scorecards(period_start, period_end);

-- Keep the legacy vendor scope usable as an explicit active scope record.
INSERT INTO supplier_scopes (vendor_id, scope_code, description, status, approved_at, notes)
SELECT v.id, 'LEGACY-SCOPE', v.scope, 'active', COALESCE(v.start_renewal_date::timestamp, NOW()), 'Seeded from vendors.scope during Section 6 supplier controls migration.'
FROM vendors v
WHERE COALESCE(trim(v.scope), '') <> ''
ON CONFLICT (vendor_id, scope_code) DO NOTHING;

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('purchasing.approve_requisition_buyer', 'Approve purchase requisitions under $500', 'purchasing'),
  ('purchasing.approve_requisition_manager', 'Approve purchase requisitions over $500', 'purchasing'),
  ('purchasing.approve_requisition_executive', 'Approve purchase requisitions over $5,000', 'purchasing')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_roles (name, description, is_system)
VALUES
  ('PURCHASING_BUYER', 'Buyer role - can approve low-dollar purchase requisitions', true),
  ('EXECUTIVE', 'Executive role - can approve high-dollar purchase requisitions', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM perm_roles pr, perm_capabilities pc
WHERE (pr.name = 'PURCHASING_BUYER' AND pc.key = 'purchasing.approve_requisition_buyer')
   OR (pr.name = 'MANAGER' AND pc.key IN ('purchasing.approve_requisition_buyer', 'purchasing.approve_requisition_manager'))
   OR (pr.name IN ('EXECUTIVE', 'ADMIN', 'OWNER') AND pc.key IN (
      'purchasing.approve_requisition_buyer',
      'purchasing.approve_requisition_manager',
      'purchasing.approve_requisition_executive'
   ))
ON CONFLICT (role_id, capability_id) DO NOTHING;

-- Replace broad default chain rows with the explicit Section 6 thresholds.
UPDATE purchase_requisition_approval_chain
SET is_active = false
WHERE category = 'default'
  AND capability = 'purchasing.approve_requisition'
  AND is_active = true;

INSERT INTO purchase_requisition_approval_chain (category, min_amount, max_amount, stage, capability, description, is_active)
SELECT seed.category, seed.min_amount, seed.max_amount, seed.stage, seed.capability, seed.description, true
FROM (VALUES
  ('default', 0::numeric, 500::numeric, 1, 'purchasing.approve_requisition_buyer', 'Buyer approval for requisitions under $500'),
  ('default', 500.01::numeric, 5000::numeric, 1, 'purchasing.approve_requisition_manager', 'Manager approval for requisitions over $500'),
  ('default', 5000.01::numeric, NULL::numeric, 1, 'purchasing.approve_requisition_manager', 'Manager review for requisitions over $5,000'),
  ('default', 5000.01::numeric, NULL::numeric, 2, 'purchasing.approve_requisition_executive', 'Executive approval for requisitions over $5,000')
) AS seed(category, min_amount, max_amount, stage, capability, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM purchase_requisition_approval_chain existing
  WHERE existing.category = seed.category
    AND existing.stage = seed.stage
    AND existing.capability = seed.capability
    AND existing.min_amount = seed.min_amount
    AND COALESCE(existing.max_amount, -1) = COALESCE(seed.max_amount, -1)
);
