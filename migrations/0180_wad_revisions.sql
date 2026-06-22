CREATE TABLE IF NOT EXISTS wad_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wad_id uuid NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  revision_code text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  revision_reason text NOT NULL,
  reason_notes text,
  impact_production boolean NOT NULL DEFAULT false,
  impact_released_travelers boolean NOT NULL DEFAULT false,
  impact_completed_work boolean NOT NULL DEFAULT false,
  impact_material_issued boolean NOT NULL DEFAULT false,
  impact_inspection boolean NOT NULL DEFAULT false,
  impact_labor_budget boolean NOT NULL DEFAULT false,
  impact_delivery_date boolean NOT NULL DEFAULT false,
  impact_customer_approval boolean NOT NULL DEFAULT false,
  requires_production_hold boolean NOT NULL DEFAULT false,
  effective_date date,
  wad_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name text,
  approved_by integer REFERENCES users(id) ON DELETE SET NULL,
  approved_by_display_name text,
  approved_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT wad_revisions_status_check CHECK (status IN ('draft', 'pending_approval', 'approved', 'superseded', 'rejected')),
  CONSTRAINT wad_revisions_wad_revision_unique UNIQUE (wad_id, revision_code)
);

CREATE INDEX IF NOT EXISTS wad_revisions_wad_id_idx ON wad_revisions(wad_id);
CREATE INDEX IF NOT EXISTS wad_revisions_status_idx ON wad_revisions(status);

CREATE TABLE IF NOT EXISTS wad_revision_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wad_revision_id uuid NOT NULL REFERENCES wad_revisions(id) ON DELETE CASCADE,
  approver_role text NOT NULL,
  approver_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  comments text,
  signed_at timestamp,
  CONSTRAINT wad_revision_approval_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS wad_revision_approval_history_revision_idx
  ON wad_revision_approval_history(wad_revision_id);
CREATE INDEX IF NOT EXISTS wad_revision_approval_history_approver_idx
  ON wad_revision_approval_history(approver_role, approver_user_id);

ALTER TABLE travelers
  ADD COLUMN IF NOT EXISTS wad_revision_id uuid REFERENCES wad_revisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS travelers_wad_revision_idx ON travelers(wad_revision_id);
