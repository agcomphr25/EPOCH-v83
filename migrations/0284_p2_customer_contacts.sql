-- One-time forward migration for the P2 customer contact feature.
-- Idempotent so a republish is safe after the table has been created.

CREATE TABLE IF NOT EXISTS p2_customer_contacts (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT p2_customer_contacts_customer_id_p2_customers_id_fk
    FOREIGN KEY (customer_id)
    REFERENCES p2_customers(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS p2_customer_contacts_customer_id_idx
  ON p2_customer_contacts (customer_id);

CREATE INDEX IF NOT EXISTS p2_customer_contacts_customer_primary_idx
  ON p2_customer_contacts (customer_id, is_primary);
