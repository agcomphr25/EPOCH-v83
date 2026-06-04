-- Add optional P1 customer contacts without changing existing customer records.
-- This table is additive and safe for current CSR workflows: existing customers
-- continue to use customers.email unless contacts are added.

CREATE TABLE IF NOT EXISTS customer_contacts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  receives_invoices BOOLEAN NOT NULL DEFAULT TRUE,
  receives_shipping_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  receives_order_confirmations BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id
  ON customer_contacts(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_invoice_recipients
  ON customer_contacts(customer_id, receives_invoices, active);
