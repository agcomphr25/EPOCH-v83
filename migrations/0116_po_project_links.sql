-- Link P2 purchase orders directly to projects.

ALTER TABLE p2_purchase_orders
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS p2_purchase_orders_project_id_idx
  ON p2_purchase_orders(project_id);

-- Backfill from projects already hard-linked by P2 PO id.
UPDATE p2_purchase_orders p2po
SET project_id = p.id,
    project_name = COALESCE(p2po.project_name, p.project_code || ' - ' || p.project_name)
FROM projects p
WHERE p2po.project_id IS NULL
  AND p.po_id = p2po.id;
