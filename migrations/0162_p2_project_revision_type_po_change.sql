ALTER TABLE p2_purchase_orders
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_po_id integer,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS is_current_revision boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revised_at timestamp,
  ADD COLUMN IF NOT EXISTS revised_by text;

ALTER TABLE project_revisions
  ADD COLUMN IF NOT EXISTS revision_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS has_po_change boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS p2_purchase_orders_revision_family_idx
  ON p2_purchase_orders(parent_po_id, revision_number);
