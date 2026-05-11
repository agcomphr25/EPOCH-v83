-- 0130_audit_dcaa_security_section11.sql
-- Section 11: Audit / DCAA / Security foundation controls.
--
-- Adds:
--   1. Required-event coverage matrix across compliance domains.
--   2. Rich approval signature evidence metadata.
--   3. Role/capability coverage for high-risk approvals and releases.
--   4. Configurable retention/archive policy by governed object type.

-- ---------------------------------------------------------------------------
-- Approval and digital-signature evidence coverage
-- ---------------------------------------------------------------------------
ALTER TABLE public.digital_signatures
  ADD COLUMN IF NOT EXISTS signer_username TEXT,
  ADD COLUMN IF NOT EXISTS signature_meaning TEXT,
  ADD COLUMN IF NOT EXISTS signature_reason TEXT,
  ADD COLUMN IF NOT EXISTS linked_object_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_object_id TEXT,
  ADD COLUMN IF NOT EXISTS approval_request_id UUID;

CREATE INDEX IF NOT EXISTS digital_signatures_linked_object_idx
  ON public.digital_signatures (linked_object_type, linked_object_id);
CREATE INDEX IF NOT EXISTS digital_signatures_approval_request_idx
  ON public.digital_signatures (approval_request_id);

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS signature_meaning TEXT,
  ADD COLUMN IF NOT EXISTS signature_reason TEXT,
  ADD COLUMN IF NOT EXISTS signer_username TEXT,
  ADD COLUMN IF NOT EXISTS signer_role TEXT,
  ADD COLUMN IF NOT EXISTS signature_linked_object_type TEXT,
  ADD COLUMN IF NOT EXISTS signature_linked_object_id TEXT,
  ADD COLUMN IF NOT EXISTS digital_signature_id UUID;

CREATE INDEX IF NOT EXISTS approval_requests_signature_linked_object_idx
  ON public.approval_requests (signature_linked_object_type, signature_linked_object_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_digital_signature_fk'
  ) THEN
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_digital_signature_fk
      FOREIGN KEY (digital_signature_id) REFERENCES public.digital_signatures(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'digital_signatures_approval_request_fk'
  ) THEN
    ALTER TABLE public.digital_signatures
      ADD CONSTRAINT digital_signatures_approval_request_fk
      FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.approval_signature_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  decision_status TEXT NOT NULL,
  signature_meaning TEXT NOT NULL,
  signature_reason TEXT NOT NULL,
  signer_user_id INTEGER,
  signer_username TEXT NOT NULL,
  signer_role TEXT NOT NULL,
  linked_object_type TEXT NOT NULL,
  linked_object_id TEXT NOT NULL,
  digital_signature_id UUID REFERENCES public.digital_signatures(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_signature_evidence_request_idx
  ON public.approval_signature_evidence (approval_request_id);
CREATE INDEX IF NOT EXISTS approval_signature_evidence_linked_object_idx
  ON public.approval_signature_evidence (linked_object_type, linked_object_id);
CREATE INDEX IF NOT EXISTS approval_signature_evidence_signer_idx
  ON public.approval_signature_evidence (signer_user_id);

-- ---------------------------------------------------------------------------
-- Required-event coverage matrix
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_required_event_coverage (
  id SERIAL PRIMARY KEY,
  domain_key TEXT NOT NULL,
  object_type TEXT NOT NULL,
  lifecycle_stage TEXT NOT NULL,
  required_event_type TEXT NOT NULL,
  required_source_service TEXT NOT NULL,
  evidence_requirement TEXT NOT NULL,
  required_actor_role TEXT,
  signature_required BOOLEAN NOT NULL DEFAULT FALSE,
  retention_object_type TEXT NOT NULL,
  compliance_basis TEXT NOT NULL DEFAULT 'DCAA audit evidence',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_required_event_coverage_event_unique
    UNIQUE (domain_key, object_type, required_event_type)
);

CREATE INDEX IF NOT EXISTS audit_required_event_coverage_domain_idx
  ON public.audit_required_event_coverage (domain_key);
CREATE INDEX IF NOT EXISTS audit_required_event_coverage_object_idx
  ON public.audit_required_event_coverage (object_type);

INSERT INTO public.audit_required_event_coverage (
  domain_key, object_type, lifecycle_stage, required_event_type, required_source_service,
  evidence_requirement, required_actor_role, signature_required, retention_object_type, compliance_basis
) VALUES
  ('inventory', 'inventory_lot', 'receipt inspection', 'INVENTORY_LOT_RECEIVED', 'receiving.route', 'Receipt timestamp, quantity, lot/batch/heat/serial traceability, supplier, PO link, and receiving user.', 'RECEIVING', false, 'procurement', 'DCAA material traceability and AS9100 receiving evidence'),
  ('inventory', 'inventory_lot', 'hold/release', 'INVENTORY_HOLD_RELEASED', 'receiving.route', 'Hold reason, missing-document clearance, release user, linked cert/report records, and downstream putaway state.', 'QUALITY', true, 'quality', 'DCAA/quality evidence for controlled material release'),
  ('inventory', 'inventory_transaction', 'issue/consume/scrap', 'INVENTORY_TRANSACTION_POSTED', 'materialIssueService', 'Operator identity, source lot, destination WAD/traveler, quantity, UOM, reason, and approval override if used.', 'FLOOR_OPERATOR', false, 'traveler', 'DCAA material consumption and cost objective traceability'),
  ('procurement', 'purchase_requisition', 'stage approval', 'REQUISITION_STAGE_APPROVED', 'purchaseRequisitions.route', 'Approver, role, threshold tier, reason, linked project/contract, requested items, and segregation-of-duties result.', 'PURCHASING_BUYER', true, 'procurement', 'DCAA procurement authorization evidence'),
  ('procurement', 'vendor_po', 'PO approval/release', 'VENDOR_PO_RELEASED', 'vendorPOs.route', 'PO approver, vendor status, AVL/P2 check, FAR/DFARS flowdown, linked requisition, and release timestamp.', 'PURCHASING_MANAGER', true, 'procurement', 'DCAA purchasing system evidence'),
  ('labor', 'punch_ledger', 'supervisor approval', 'LABOR_APPROVAL_RECORDED', 'laborApprovals.route', 'Employee, supervisor, charge code, WAD/traveler, before/after approval state, reason, and signed approval metadata.', 'SUPERVISOR', true, 'labor', 'DCAA timekeeping approval evidence'),
  ('labor', 'labor_budget_override', 'override approval', 'LABOR_BUDGET_OVERRIDE_APPROVED', 'workOrders.route', 'Overrun amount, requester, approver, reason, linked WAD/project, and budget impact.', 'SUPERVISOR', true, 'labor', 'DCAA labor-cost override evidence'),
  ('approvals', 'approval_request', 'decision', 'APPROVAL_REQUEST_APPROVED', 'escalationService', 'Meaning, reason, signer username, signer role, timestamp, linked object, and optional digital signature id.', 'APPROVER', true, 'contract', 'Electronic signature attribution and approval evidence'),
  ('quality', 'nonconformance_record', 'closure', 'NCR_CLOSED', 'quality.route', 'NCR disposition, CAPA link, closure approver, effectiveness evidence, and affected serial/lot/traveler objects.', 'QUALITY_MANAGER', true, 'quality', 'AS9100/DCAA quality escape closure evidence'),
  ('quality', 'calibration_record', 'certification', 'CALIBRATION_CERT_RECORDED', 'quality.route', 'Asset, cert, calibration result, due date, performed-by, reviewer, and out-of-tolerance disposition.', 'QUALITY', true, 'cert', 'Calibration cert retention and traceability evidence'),
  ('engineering', 'engineering_revision', 'revision release', 'ENGINEERING_REVISION_RELEASED', 'engineering.route', 'Revision, ECO, affected documents/travelers, release approver, reason, and effective date.', 'ENGINEERING_MANAGER', true, 'engineering', 'Engineering change control evidence'),
  ('engineering', 'controlled_document', 'document approval', 'CONTROLLED_DOCUMENT_APPROVED', 'controlledDocuments.route', 'Document revision, approver role, signature, approval meaning, distribution scope, and obsolete supersession.', 'DOCUMENT_MANAGER', true, 'engineering', 'Controlled document release evidence'),
  ('shipping', 'shipment', 'release', 'SHIPMENT_RELEASED', 'shipping.route', 'Shipment release approver, packing slip/cert package, serial/lot contents, customer/contract, and export/quality blockers.', 'SHIPPING_MANAGER', true, 'procurement', 'Shipment release and contract-deliverable evidence'),
  ('shipping', 'cert_package', 'customer delivery', 'CERT_PACKAGE_DELIVERED', 'shipping.route', 'Certificate package hash, contents, recipient, delivery timestamp, and shipment/contract link.', 'SHIPPING', false, 'cert', 'Certificate package retention evidence'),
  ('security', 'vault_document', 'access grant', 'VAULT_ACCESS_GRANTED', 'vault.route', 'Grantor, grantee, classification, document id, reason, expiration, and least-privilege scope.', 'SECURITY_ADMIN', true, 'contract', 'CMMC/DCAA controlled evidence access record'),
  ('security', 'session', 'auth/session', 'SESSION_EXTENDED', 'auth.service', 'User, role, session id, IP/user-agent, timestamp, and expiration boundary.', 'AUTHENTICATED_USER', false, 'contract', 'Security accountability and access audit evidence')
ON CONFLICT (domain_key, object_type, required_event_type) DO UPDATE SET
  lifecycle_stage = EXCLUDED.lifecycle_stage,
  required_source_service = EXCLUDED.required_source_service,
  evidence_requirement = EXCLUDED.evidence_requirement,
  required_actor_role = EXCLUDED.required_actor_role,
  signature_required = EXCLUDED.signature_required,
  retention_object_type = EXCLUDED.retention_object_type,
  compliance_basis = EXCLUDED.compliance_basis,
  is_active = TRUE,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Object-type retention/archive policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_object_retention_policies (
  id SERIAL PRIMARY KEY,
  object_type TEXT NOT NULL UNIQUE,
  min_retention_days INTEGER NOT NULL DEFAULT 2555,
  archive_after_days INTEGER,
  legal_hold_supported BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.audit_object_retention_policies (
  object_type, min_retention_days, archive_after_days, legal_hold_supported, description, updated_by
) VALUES
  ('contract', 3650, NULL, TRUE, 'Contract, customer approval, security access, and contract-linked audit evidence. Default 10-year floor.', 'migration:0130'),
  ('cert', 3650, NULL, TRUE, 'Certificates of conformance, calibration certs, material certs, SDS/TDS, and delivered cert packages.', 'migration:0130'),
  ('traveler', 3650, NULL, TRUE, 'Traveler execution, material consumption, production signatures, and lot/serial traceability.', 'migration:0130'),
  ('labor', 2555, NULL, TRUE, 'Punch ledger, labor approvals, corrections, payroll export, and labor override evidence.', 'migration:0130'),
  ('procurement', 2555, NULL, TRUE, 'Purchase requisitions, vendor POs, supplier approval evidence, invoice-match, and closeout records.', 'migration:0130'),
  ('quality', 3650, NULL, TRUE, 'NCR, CAPA, inspection, hold/release, calibration, and quality escape evidence.', 'migration:0130'),
  ('engineering', 3650, NULL, TRUE, 'ECO, revision release, controlled document approvals, and engineering authority evidence.', 'migration:0130')
ON CONFLICT (object_type) DO UPDATE SET
  min_retention_days = EXCLUDED.min_retention_days,
  archive_after_days = EXCLUDED.archive_after_days,
  legal_hold_supported = EXCLUDED.legal_hold_supported,
  description = EXCLUDED.description,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

INSERT INTO public.audit_retention_policies (event_type, min_retention_days, archive_after_days, description)
VALUES
  ('INVENTORY_LOT_RECEIVED', 3650, NULL, 'Receiving inspection evidence with lot/batch/heat traceability'),
  ('INVENTORY_HOLD_RELEASED', 3650, NULL, 'Document hold/release and quality disposition evidence'),
  ('INVENTORY_TRANSACTION_POSTED', 3650, NULL, 'Material issue/consume/scrap evidence linked to traveler/WAD'),
  ('VENDOR_PO_RELEASED', 2555, NULL, 'PO approval/release evidence'),
  ('LABOR_APPROVAL_RECORDED', 2555, NULL, 'Signed labor approval evidence'),
  ('LABOR_BUDGET_OVERRIDE_APPROVED', 2555, NULL, 'Signed labor override evidence'),
  ('APPROVAL_REQUEST_APPROVED', 2555, NULL, 'Electronic signature decision evidence'),
  ('NCR_CLOSED', 3650, NULL, 'NCR closure and CAPA evidence'),
  ('ENGINEERING_REVISION_RELEASED', 3650, NULL, 'Engineering revision release evidence'),
  ('SHIPMENT_RELEASED', 3650, NULL, 'Shipment release and cert package evidence'),
  ('VAULT_ACCESS_GRANTED', 3650, NULL, 'Controlled evidence vault access grants')
ON CONFLICT (event_type) DO UPDATE SET
  min_retention_days = EXCLUDED.min_retention_days,
  archive_after_days = EXCLUDED.archive_after_days,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Capability matrix expansion
-- ---------------------------------------------------------------------------
INSERT INTO public.perm_capabilities (key, description, category)
VALUES
  ('approvals.override', 'Perform privileged approval overrides after explicit reason capture and audit logging', 'approvals'),
  ('labor.override', 'Approve labor overrides, labor budget overruns, and charge-code override exceptions', 'labor'),
  ('engineering.release_revision', 'Release controlled engineering revisions and ECO-backed document revisions', 'engineering'),
  ('procurement.approve_po', 'Approve and release vendor purchase orders', 'procurement'),
  ('quality.close_ncr', 'Close NCR/CAPA records after disposition and effectiveness evidence is attached', 'quality'),
  ('vault.access', 'Grant or use access to controlled secure-vault evidence objects', 'security'),
  ('shipping.release_shipment', 'Release customer shipments and certify shipment evidence packages', 'shipping')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category;

INSERT INTO public.perm_roles (name, description, is_system)
VALUES
  ('ENGINEERING_MANAGER', 'Engineering manager role - can release controlled revisions', TRUE),
  ('PURCHASING_MANAGER', 'Purchasing manager role - can approve and release vendor POs', TRUE),
  ('QUALITY_MANAGER', 'Quality manager role - can close NCR/CAPA records', TRUE),
  ('SHIPPING_MANAGER', 'Shipping manager role - can release shipments', TRUE),
  ('SECURITY_ADMIN', 'Security admin role - can grant secure evidence vault access', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.perm_role_capabilities (role_id, capability_id)
SELECT pr.id, pc.id
FROM public.perm_roles pr
JOIN public.perm_capabilities pc ON (
  (pr.name IN ('ADMIN', 'OWNER') AND pc.key IN (
    'approvals.override',
    'labor.override',
    'engineering.release_revision',
    'procurement.approve_po',
    'quality.close_ncr',
    'vault.access',
    'shipping.release_shipment'
  ))
  OR (pr.name IN ('SUPERVISOR', 'MANAGER') AND pc.key IN ('approvals.override', 'labor.override'))
  OR (pr.name = 'ENGINEERING_MANAGER' AND pc.key = 'engineering.release_revision')
  OR (pr.name = 'PURCHASING_MANAGER' AND pc.key = 'procurement.approve_po')
  OR (pr.name = 'QUALITY_MANAGER' AND pc.key = 'quality.close_ncr')
  OR (pr.name = 'DOCUMENT_MANAGER' AND pc.key = 'vault.access')
  OR (pr.name = 'SECURITY_ADMIN' AND pc.key = 'vault.access')
  OR (pr.name = 'SHIPPING_MANAGER' AND pc.key = 'shipping.release_shipment')
)
ON CONFLICT (role_id, capability_id) DO NOTHING;
