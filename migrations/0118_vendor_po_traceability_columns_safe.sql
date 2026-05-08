-- Safe repair for production databases where the FK-bearing 0117 traceability
-- migration can fail before creating the columns needed by the PO/RFQ viewer.

ALTER TABLE vendor_po_items
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS production_work_order_id UUID,
  ADD COLUMN IF NOT EXISTS charge_code_id INTEGER;

CREATE INDEX IF NOT EXISTS vendor_po_items_project_id_idx
  ON vendor_po_items(project_id);

CREATE INDEX IF NOT EXISTS vendor_po_items_production_work_order_id_idx
  ON vendor_po_items(production_work_order_id);

CREATE INDEX IF NOT EXISTS vendor_po_items_charge_code_id_idx
  ON vendor_po_items(charge_code_id);
