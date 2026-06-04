ALTER TABLE p2_production_changes
  ADD COLUMN IF NOT EXISTS proposed_revision TEXT,
  ADD COLUMN IF NOT EXISTS affected_documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_actions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approver_employee_id INTEGER REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS approver_employee_name TEXT,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID,
  ADD COLUMN IF NOT EXISTS approval_request_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_assignments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS implementation_required BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS p2_prod_changes_approval_request_idx
  ON p2_production_changes(approval_request_id);

INSERT INTO escalation_policies (request_type, display_name, description, chain, requires_signature, reason_codes, is_active)
VALUES (
  'PRODUCTION_CHANGE_FORM',
  'Production Change Form',
  'AS9100 production change form approval for routing, BOM, material, process, or inspection changes.',
  '[{"role":"Quality Manager","slaSeconds":14400},{"role":"Production Manager","slaSeconds":28800},{"role":"Director of Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
  true,
  '["ROUTING_VERIFIED","BOM_VERIFIED","CUSTOMER_APPROVAL_VERIFIED","RISK_ACCEPTED","OTHER"]'::jsonb,
  true
)
ON CONFLICT (request_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  chain = EXCLUDED.chain,
  requires_signature = EXCLUDED.requires_signature,
  reason_codes = EXCLUDED.reason_codes,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
