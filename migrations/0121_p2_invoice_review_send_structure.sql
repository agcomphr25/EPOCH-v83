ALTER TABLE ar_invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retainage_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retainage_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_visible_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS wad_id uuid,
  ADD COLUMN IF NOT EXISTS sendgrid_message_id text,
  ADD COLUMN IF NOT EXISTS sent_to text,
  ADD COLUMN IF NOT EXISTS sent_cc text[];

ALTER TABLE ar_invoice_lines
  ADD COLUMN IF NOT EXISTS po_item_id integer REFERENCES p2_purchase_order_items(id),
  ADD COLUMN IF NOT EXISTS part_number text;

CREATE INDEX IF NOT EXISTS ar_invoice_lines_po_item_id_idx
  ON ar_invoice_lines(po_item_id);

CREATE INDEX IF NOT EXISTS ar_invoices_wad_id_idx
  ON ar_invoices(wad_id);
