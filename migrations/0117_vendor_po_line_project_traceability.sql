-- Task #173: procurement-to-project traceability for vendor PO line items.
-- Adds optional cost-objective links so every related procurement line can point
-- to the P2 project, WAD/work order, and charge code it supports.

ALTER TABLE vendor_po_items
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_work_order_id uuid REFERENCES production_work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charge_code_id integer REFERENCES charge_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendor_po_items_project_id_idx
  ON vendor_po_items(project_id);

CREATE INDEX IF NOT EXISTS vendor_po_items_production_work_order_id_idx
  ON vendor_po_items(production_work_order_id);

CREATE INDEX IF NOT EXISTS vendor_po_items_charge_code_id_idx
  ON vendor_po_items(charge_code_id);
