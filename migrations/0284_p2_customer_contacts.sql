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
  updated_at timestamp DEFAULT now()
);

-- Production contains a legacy p2_customers layout where the numeric id is
-- not guaranteed by a database-level unique constraint. The application uses
-- that stable numeric id to address customers, but adding a foreign key to it
-- would fail migration 0284 and prevent startup. Keep the lookup indexed and
-- enforce customer existence in the authenticated API route.

CREATE INDEX IF NOT EXISTS p2_customer_contacts_customer_id_idx
  ON p2_customer_contacts (customer_id);

CREATE INDEX IF NOT EXISTS p2_customer_contacts_customer_primary_idx
  ON p2_customer_contacts (customer_id, is_primary);
