-- Phase 9C: additive p2_v2 Shipping, delivery reconciliation, and controlled closeout.
-- Existing legacy shipment, packing-slip, carrier, invoice, and project-closing records
-- remain authoritative and unchanged. These tables provide V2 review, linkage, and
-- immutable reconciliation evidence only.

CREATE TABLE IF NOT EXISTS project_shipping_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'BLOCKED' CHECK (status IN
    ('BLOCKED','READY_TO_PACK','READY_TO_SHIP','PARTIALLY_SHIPPED',
     'SHIPPED','DELIVERED','STALE','SUPERSEDED')),
  selected_release_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_allocation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  packaging_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ship_to_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  carrier_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  packaging_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  packaging_verified_by_display_name TEXT,
  packaging_verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_shipping_review_current_unique
  ON project_shipping_reviews(project_id, workflow_instance_id)
  WHERE status NOT IN ('STALE','SUPERSEDED','DELIVERED');
CREATE INDEX IF NOT EXISTS project_shipping_review_history_idx
  ON project_shipping_reviews(project_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS project_shipment_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_number TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  shipping_review_id UUID NOT NULL REFERENCES project_shipping_reviews(id) ON DELETE RESTRICT,
  shipping_review_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'AUTHORIZED' CHECK (status IN
    ('AUTHORIZED','CONFIRMED','DELIVERED','DELIVERY_EXCEPTION','VOIDED','RETURNED')),
  authoritative_shipment_id UUID REFERENCES shipment_records(id) ON DELETE RESTRICT,
  product_release_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  allocation_snapshot JSONB NOT NULL,
  package_snapshot JSONB NOT NULL,
  ship_to_snapshot JSONB NOT NULL,
  carrier_snapshot JSONB NOT NULL,
  document_manifest JSONB NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  authorized_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  authorized_by_display_name TEXT NOT NULL,
  authorized_at TIMESTAMP NOT NULL DEFAULT now(),
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by_display_name TEXT,
  confirmed_at TIMESTAMP,
  delivered_at TIMESTAMP,
  delivery_evidence_source TEXT,
  proof_of_delivery_reference TEXT,
  delivery_exception TEXT,
  void_reason TEXT,
  voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_by_display_name TEXT,
  voided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS project_shipment_authorizations_project_idx
  ON project_shipment_authorizations(project_id, authorized_at DESC);

CREATE TABLE IF NOT EXISTS project_shipment_allocation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  shipment_authorization_id UUID NOT NULL REFERENCES project_shipment_authorizations(id) ON DELETE RESTRICT,
  product_release_id UUID NOT NULL REFERENCES project_product_releases(id) ON DELETE RESTRICT,
  release_allocation_id UUID NOT NULL REFERENCES project_product_release_allocations(id) ON DELETE RESTRICT,
  serial_number TEXT,
  batch_lot TEXT,
  part_number TEXT NOT NULL,
  po_line_id INTEGER,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'AUTHORIZED' CHECK (status IN
    ('AUTHORIZED','SHIPPED','DELIVERED','RETURNED','VOIDED')),
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (shipment_authorization_id, release_allocation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_shipment_allocation_shipped_unique
  ON project_shipment_allocation_links(release_allocation_id)
  WHERE status IN ('SHIPPED','DELIVERED');

CREATE TABLE IF NOT EXISTS project_shipping_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  shipping_review_id UUID REFERENCES project_shipping_reviews(id) ON DELETE RESTRICT,
  shipment_authorization_id UUID REFERENCES project_shipment_authorizations(id) ON DELETE RESTRICT,
  product_release_id UUID REFERENCES project_product_releases(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','SUPERSEDED')),
  disposition TEXT,
  placed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  placed_by_display_name TEXT NOT NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT now(),
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_display_name TEXT,
  release_authorization TEXT,
  released_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS project_shipping_holds_active_idx
  ON project_shipping_holds(project_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS project_closeout_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN
    ('IN_PROGRESS','BLOCKED','READY_FOR_CLOSEOUT_REVIEW','PENDING_APPROVAL',
     'CLOSED','REOPENED','STALE','SUPERSEDED')),
  reconciliation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_archive_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_action_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  submitted_at TIMESTAMP,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_by_display_name TEXT,
  close_decision TEXT,
  closed_at TIMESTAMP,
  reopened_at TIMESTAMP,
  reopen_reason TEXT,
  responsible_owner TEXT,
  supersedes_closeout_id UUID REFERENCES project_closeout_reviews(id) ON DELETE RESTRICT,
  idempotency_key TEXT,
  request_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_closeout_review_current_unique
  ON project_closeout_reviews(project_id, workflow_instance_id)
  WHERE status IN ('IN_PROGRESS','BLOCKED','READY_FOR_CLOSEOUT_REVIEW','PENDING_APPROVAL');
CREATE UNIQUE INDEX IF NOT EXISTS project_closeout_idempotency_unique
  ON project_closeout_reviews(project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_closeout_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  closeout_review_id UUID NOT NULL REFERENCES project_closeout_reviews(id) ON DELETE RESTRICT,
  closeout_revision INTEGER NOT NULL,
  approval_type TEXT NOT NULL CHECK (approval_type IN
    ('PROJECT_MANAGEMENT','QUALITY','OPERATIONS','SHIPPING_LOGISTICS','FINANCE','SUPPLY_CHAIN')),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  signature_meaning TEXT NOT NULL,
  reason TEXT,
  evidence_snapshot_hash TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_employee_id INTEGER,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (closeout_review_id, approval_type)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_closeout_approval_actor_unique
  ON project_closeout_approvals(closeout_review_id, actor_user_id)
  WHERE actor_user_id IS NOT NULL AND decision='APPROVED';

CREATE TABLE IF NOT EXISTS project_closeout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  closeout_review_id UUID NOT NULL REFERENCES project_closeout_reviews(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('CLOSED','REOPENED')),
  reason TEXT NOT NULL,
  responsible_owner TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_display_name TEXT NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.shipping_v2.manage','Manage P2 V2 Shipping readiness and packaging evidence','shipping'),
 ('projects.shipping_v2.authorize','Authorize a P2 V2 shipment','shipping'),
 ('projects.shipping_v2.confirm','Confirm a P2 V2 shipment','shipping'),
 ('projects.shipping_v2.delivery','Record P2 V2 delivery evidence or exception','shipping'),
 ('projects.shipping_v2.hold','Place or release a P2 V2 Shipping hold','shipping'),
 ('projects.closeout_v2.manage','Manage P2 V2 project closeout review','projects'),
 ('projects.closeout_v2.pm_decide','Approve P2 V2 closeout for Project Management','projects'),
 ('projects.closeout_v2.quality_decide','Approve P2 V2 closeout for Quality','quality'),
 ('projects.closeout_v2.operations_decide','Approve P2 V2 closeout for Operations','operations'),
 ('projects.closeout_v2.shipping_decide','Approve P2 V2 closeout for Shipping','shipping'),
 ('projects.closeout_v2.finance_decide','Approve P2 V2 closeout for Finance','finance'),
 ('projects.closeout_v2.supply_chain_decide','Approve P2 V2 closeout for Supply Chain','procurement'),
 ('projects.closeout_v2.close','Close a reconciled P2 V2 project','projects'),
 ('projects.closeout_v2.reopen','Reopen a closed P2 V2 project through controlled review','projects')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND
   (pc.key LIKE 'projects.shipping_v2.%' OR pc.key LIKE 'projects.closeout_v2.%')) OR
 (pr.name IN ('SHIPPING','SHIPPING_MANAGER','LOGISTICS') AND pc.key IN
   ('projects.shipping_v2.manage','projects.shipping_v2.authorize','projects.shipping_v2.confirm',
    'projects.shipping_v2.delivery','projects.shipping_v2.hold',
    'projects.closeout_v2.shipping_decide')) OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key='projects.closeout_v2.quality_decide') OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER')
   AND pc.key='projects.closeout_v2.operations_decide') OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER') AND pc.key IN
   ('projects.closeout_v2.manage','projects.closeout_v2.pm_decide','projects.closeout_v2.close')) OR
 (pr.name IN ('FINANCE','ACCOUNTING') AND pc.key='projects.closeout_v2.finance_decide') OR
 (pr.name IN ('SUPPLY_CHAIN','PROCUREMENT','PURCHASING') AND pc.key='projects.closeout_v2.supply_chain_decide')
) ON CONFLICT (role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION protect_v2_shipment_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('CONFIRMED','DELIVERED','DELIVERY_EXCEPTION','RETURNED') AND (
    NEW.authorization_number IS DISTINCT FROM OLD.authorization_number OR
    NEW.project_id IS DISTINCT FROM OLD.project_id OR
    NEW.shipping_review_id IS DISTINCT FROM OLD.shipping_review_id OR
    NEW.shipping_review_revision IS DISTINCT FROM OLD.shipping_review_revision OR
    NEW.authoritative_shipment_id IS DISTINCT FROM OLD.authoritative_shipment_id OR
    NEW.product_release_ids IS DISTINCT FROM OLD.product_release_ids OR
    NEW.allocation_snapshot IS DISTINCT FROM OLD.allocation_snapshot OR
    NEW.package_snapshot IS DISTINCT FROM OLD.package_snapshot OR
    NEW.ship_to_snapshot IS DISTINCT FROM OLD.ship_to_snapshot OR
    NEW.carrier_snapshot IS DISTINCT FROM OLD.carrier_snapshot OR
    NEW.document_manifest IS DISTINCT FROM OLD.document_manifest OR
    NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
    NEW.request_hash IS DISTINCT FROM OLD.request_hash OR
    NEW.authorized_by IS DISTINCT FROM OLD.authorized_by OR
    NEW.authorized_at IS DISTINCT FROM OLD.authorized_at OR
    NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR
    NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
  ) THEN
    RAISE EXCEPTION 'Confirmed shipment identity and evidence are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_v2_shipment_evidence_trigger ON project_shipment_authorizations;
CREATE TRIGGER protect_v2_shipment_evidence_trigger BEFORE UPDATE ON project_shipment_authorizations
FOR EACH ROW EXECUTE FUNCTION protect_v2_shipment_evidence();

CREATE OR REPLACE FUNCTION protect_closed_project_closeout()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='CLOSED' AND NEW.status <> 'REOPENED' THEN
    IF ROW(NEW.reconciliation_snapshot,NEW.document_archive_manifest,NEW.open_action_snapshot,
      NEW.blockers,NEW.close_decision,NEW.closed_at,NEW.closed_by)
      IS DISTINCT FROM
      ROW(OLD.reconciliation_snapshot,OLD.document_archive_manifest,OLD.open_action_snapshot,
      OLD.blockers,OLD.close_decision,OLD.closed_at,OLD.closed_by)
    THEN RAISE EXCEPTION 'Closed project closeout evidence is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_closed_project_closeout_trigger ON project_closeout_reviews;
CREATE TRIGGER protect_closed_project_closeout_trigger BEFORE UPDATE ON project_closeout_reviews
FOR EACH ROW EXECUTE FUNCTION protect_closed_project_closeout();
