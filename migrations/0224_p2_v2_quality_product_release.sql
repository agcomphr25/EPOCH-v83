-- Phase 9B: additive P2 V2 Quality review and controlled Product Release.
-- Inspection, FAI, NCR, certificate, genealogy and shipping records remain
-- authoritative in their existing tables. These records snapshot their evidence.

CREATE TABLE IF NOT EXISTS project_quality_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  workflow_step_instance_id UUID NOT NULL,
  production_review_id UUID NOT NULL REFERENCES project_production_stage_reviews(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN
    ('IN_PROGRESS','BLOCKED','READY_FOR_REVIEW','READY_FOR_RELEASE',
     'PARTIALLY_RELEASED','COMPLETE','STALE','INVALIDATED','SUPERSEDED')),
  production_completion_revision INTEGER NOT NULL,
  production_plan_revision INTEGER NOT NULL,
  wad_revision INTEGER NOT NULL,
  configuration_baseline_id TEXT NOT NULL,
  effectivity_reference TEXT NOT NULL,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name TEXT NOT NULL,
  submitted_at TIMESTAMP,
  completed_at TIMESTAMP,
  invalidated_at TIMESTAMP,
  invalidation_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_step_instance_id, project_id)
    REFERENCES project_workflow_step_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, workflow_instance_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_quality_review_current_unique
  ON project_quality_reviews(project_id, workflow_instance_id)
  WHERE status IN ('IN_PROGRESS','BLOCKED','READY_FOR_REVIEW','READY_FOR_RELEASE','PARTIALLY_RELEASED');
CREATE INDEX IF NOT EXISTS project_quality_review_history_idx
  ON project_quality_reviews(project_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS project_quality_review_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  quality_review_id UUID NOT NULL REFERENCES project_quality_reviews(id) ON DELETE RESTRICT,
  quality_review_revision INTEGER NOT NULL,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('QUALITY','OPERATIONS','PROJECT_MANAGEMENT')),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  signature_meaning TEXT NOT NULL,
  reason TEXT,
  evidence_snapshot_hash TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_employee_id INTEGER,
  actor_display_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (quality_review_id, approval_type)
);

CREATE TABLE IF NOT EXISTS project_product_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_number TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  workflow_instance_id UUID NOT NULL,
  quality_review_id UUID NOT NULL REFERENCES project_quality_reviews(id) ON DELETE RESTRICT,
  quality_review_revision INTEGER NOT NULL,
  production_completion_revision INTEGER NOT NULL,
  customer_po_id INTEGER NOT NULL REFERENCES p2_purchase_orders(id) ON DELETE RESTRICT,
  customer_po_line_id INTEGER,
  part_number TEXT NOT NULL,
  part_revision TEXT,
  released_quantity NUMERIC NOT NULL CHECK (released_quantity > 0),
  serial_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  batch_lots JSONB NOT NULL DEFAULT '[]'::jsonb,
  configuration_baseline_id TEXT NOT NULL,
  effectivity_reference TEXT NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  document_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_decision TEXT NOT NULL DEFAULT 'RELEASED' CHECK (release_decision IN ('RELEASED','HELD','REVOKED')),
  signature_meaning TEXT NOT NULL,
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_employee_id INTEGER,
  released_by_display_name TEXT NOT NULL,
  released_by_role TEXT NOT NULL,
  released_at TIMESTAMP NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  shipping_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK
    (shipping_status IN ('AVAILABLE','PARTIALLY_CONSUMED','CONSUMED','BLOCKED')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, project_id)
    REFERENCES project_workflow_instances(id, project_id) ON DELETE RESTRICT,
  UNIQUE (project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS project_product_releases_project_idx
  ON project_product_releases(project_id, released_at DESC);

CREATE TABLE IF NOT EXISTS project_product_release_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_release_id UUID NOT NULL REFERENCES project_product_releases(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  po_line_id INTEGER,
  part_number TEXT NOT NULL,
  serial_number TEXT,
  batch_lot TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_product_release_serial_unique
  ON project_product_release_allocations(project_id, serial_number)
  WHERE serial_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_product_release_batch_unique
  ON project_product_release_allocations(project_id, batch_lot, part_number)
  WHERE batch_lot IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_product_release_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  product_release_id UUID NOT NULL REFERENCES project_product_releases(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  reason TEXT NOT NULL,
  affected_serials JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_batches JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_quantity NUMERIC NOT NULL CHECK (affected_quantity > 0),
  placed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  placed_by_display_name TEXT NOT NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT now(),
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_by_display_name TEXT,
  release_reason TEXT,
  released_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS project_product_release_holds_active_idx
  ON project_product_release_holds(project_id, product_release_id) WHERE status='ACTIVE';

INSERT INTO perm_capabilities (key, description, category) VALUES
 ('projects.quality_release.manage','Manage P2 V2 Quality reviews','quality'),
 ('projects.quality_release.quality_decide','Approve P2 V2 Quality review','quality'),
 ('projects.quality_release.operations_decide','Confirm Production evidence for Quality review','operations'),
 ('projects.quality_release.pm_decide','Confirm customer deliverables for Quality review','projects'),
 ('projects.quality_release.release_product','Authorize immutable P2 V2 Product Release','quality'),
 ('projects.quality_release.hold','Place a controlled hold on released P2 V2 product','quality'),
 ('projects.quality_release.release_hold','Release a controlled P2 V2 Product Release hold','quality')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT pr.id,pc.id FROM perm_roles pr JOIN perm_capabilities pc ON (
 (pr.name IN ('ADMIN','OWNER') AND pc.key LIKE 'projects.quality_release.%') OR
 (pr.name IN ('QUALITY','QC','QUALITY_MANAGER') AND pc.key IN
   ('projects.quality_release.manage','projects.quality_release.quality_decide',
    'projects.quality_release.release_product','projects.quality_release.hold',
    'projects.quality_release.release_hold')) OR
 (pr.name IN ('OPERATIONS','OPERATIONS_MANAGER','PRODUCTION_MANAGER','MANAGER')
   AND pc.key='projects.quality_release.operations_decide') OR
 (pr.name IN ('PROJECT_MANAGER','PROGRAM_MANAGER')
   AND pc.key='projects.quality_release.pm_decide')
) ON CONFLICT (role_id,capability_id) DO NOTHING;
