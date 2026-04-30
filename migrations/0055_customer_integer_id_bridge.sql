-- Migration: Add customers_integer_id bridge column to quotes and projects
-- This bridges the text-based customer_id on quotes/projects back to the
-- integer PK on the master customers table, enabling enforced joins across
-- the estimating (RFQ) → quoting → project commercial flow.

-- Ensure the customers table has a primary key on id so FK references work.
-- The Drizzle schema declares serial().primaryKey() but the PK may be missing
-- in the live database if the table was created via a schema push that did not
-- emit the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'customers'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE customers ADD PRIMARY KEY (id);
  END IF;
END;
$$;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customers_integer_id integer REFERENCES customers(id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS customers_integer_id integer REFERENCES customers(id);

-- ── Backfill quotes ────────────────────────────────────────────────────────
-- Pass 1: numeric-string IDs (e.g. '123') stored by the RFQ→quote conversion
-- that did String(rfq.customerId). Cast directly to customers.id.
UPDATE quotes q
SET customers_integer_id = c.id
FROM customers c
WHERE q.customers_integer_id IS NULL
  AND q.customer_id ~ '^\d+$'
  AND CAST(q.customer_id AS integer) = c.id;

-- Pass 2: text ID matches customers.customer_key (case-insensitive).
UPDATE quotes q
SET customers_integer_id = c.id
FROM customers c
WHERE q.customers_integer_id IS NULL
  AND c.customer_key IS NOT NULL
  AND lower(trim(q.customer_id)) = lower(trim(c.customer_key));

-- Pass 3: fallback — match against customers.name (case-insensitive).
UPDATE quotes q
SET customers_integer_id = c.id
FROM customers c
WHERE q.customers_integer_id IS NULL
  AND lower(trim(q.customer_id)) = lower(trim(c.name));

-- ── Backfill projects ──────────────────────────────────────────────────────
-- Pass 1: numeric-string IDs.
UPDATE projects p
SET customers_integer_id = c.id
FROM customers c
WHERE p.customers_integer_id IS NULL
  AND p.customer_id ~ '^\d+$'
  AND CAST(p.customer_id AS integer) = c.id;

-- Pass 2: customer_key match.
UPDATE projects p
SET customers_integer_id = c.id
FROM customers c
WHERE p.customers_integer_id IS NULL
  AND c.customer_key IS NOT NULL
  AND lower(trim(p.customer_id)) = lower(trim(c.customer_key));

-- Pass 3: name match fallback.
UPDATE projects p
SET customers_integer_id = c.id
FROM customers c
WHERE p.customers_integer_id IS NULL
  AND lower(trim(p.customer_id)) = lower(trim(c.name));
