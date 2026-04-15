-- Migration: Canonical Customer Key (Fix G1)
-- Adds a normalized, uppercase, underscore-separated customer_key column to the
-- customers table. This provides a reliable canonical identifier for joining
-- against tables that store customerId as free-form text.
--
-- NOTE: Not unique — production has customers whose names normalize identically
-- (e.g. names differing only by punctuation). Plain index only.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_key TEXT;

UPDATE customers
  SET customer_key = UPPER(REPLACE(TRIM(name), ' ', '_'))
  WHERE customer_key IS NULL;

CREATE INDEX IF NOT EXISTS customers_customer_key_idx
  ON customers (customer_key);
