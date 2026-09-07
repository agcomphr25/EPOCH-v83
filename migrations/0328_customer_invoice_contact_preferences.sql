-- Invoice delivery preferences belong to ordinary P1/P2 customer contacts.
-- Forward-only: existing contact data and the earlier finance recipient table are preserved.

ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS invoice_delivery_role text NOT NULL DEFAULT 'TO';

ALTER TABLE customer_contacts
  ALTER COLUMN receives_invoices SET DEFAULT false;

ALTER TABLE p2_customer_contacts
  ADD COLUMN IF NOT EXISTS receives_invoices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_delivery_role text NOT NULL DEFAULT 'TO',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_contacts_invoice_delivery_role_check'
  ) THEN
    ALTER TABLE customer_contacts
      ADD CONSTRAINT customer_contacts_invoice_delivery_role_check
      CHECK (invoice_delivery_role IN ('TO', 'CC'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'p2_customer_contacts_invoice_delivery_role_check'
  ) THEN
    ALTER TABLE p2_customer_contacts
      ADD CONSTRAINT p2_customer_contacts_invoice_delivery_role_check
      CHECK (invoice_delivery_role IN ('TO', 'CC'));
  END IF;
END $$;
