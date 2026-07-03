-- Repair legacy P2 serialized items generated in PO-UNIT format.
--
-- The canonical P2 serial is PREFIX + YY + NNNNN, where PREFIX comes from the
-- customer RFQ prefix (or customer name fallback), YY is the created year, and
-- NNNNN is the customer/year sequence. This migration only rewrites rows whose
-- serial/barcode/traveler barcode are still in the old PO-UNIT shape.

ALTER TABLE p2_customers
  ADD COLUMN IF NOT EXISTS serial_sequences JSONB DEFAULT '{}'::jsonb;

WITH candidates AS (
  SELECT
    si.id,
    si.customer_id,
    COALESCE(si.created_at, NOW()) AS created_at,
    EXTRACT(YEAR FROM COALESCE(si.created_at, NOW()))::int AS serial_year,
    RIGHT(EXTRACT(YEAR FROM COALESCE(si.created_at, NOW()))::int::text, 2) AS year_suffix,
    COALESCE(
      NULLIF(
        UPPER(LEFT(REGEXP_REPLACE(COALESCE(c.rfq_prefix, c.customer_name, si.customer_name, 'UNK'), '[^a-zA-Z0-9]', '', 'g'), 3)),
        ''
      ),
      'UNK'
    ) AS serial_prefix
  FROM p2_serialized_items si
  LEFT JOIN p2_customers c ON c.customer_id = si.customer_id::text
  WHERE COALESCE(si.serial_number, '') ~ '^[^-]+-UNIT-[0-9]+$'
     OR COALESCE(si.barcode, '') ~ '^[^-]+-UNIT-[0-9]+$'
     OR COALESCE(si.traveler_barcode, '') ~ '^[^-]+-UNIT-[0-9]+$'
),
candidate_groups AS (
  SELECT DISTINCT customer_id, serial_year, year_suffix, serial_prefix
  FROM candidates
),
existing_valid AS (
  SELECT
    g.customer_id,
    g.serial_year,
    COALESCE(
      MAX(
        (SUBSTRING(
          UPPER(si.serial_number)
          FROM ('^' || g.serial_prefix || g.year_suffix || '([0-9]{5})$')
        ))::int
      ),
      0
    ) AS max_sequence
  FROM candidate_groups g
  LEFT JOIN p2_serialized_items si
    ON si.customer_id = g.customer_id
   AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.id = si.id)
   AND UPPER(COALESCE(si.serial_number, '')) ~ ('^' || g.serial_prefix || g.year_suffix || '[0-9]{5}$')
  GROUP BY g.customer_id, g.serial_year
),
group_base AS (
  SELECT
    g.customer_id,
    g.serial_year,
    g.year_suffix,
    g.serial_prefix,
    GREATEST(
      COALESCE((pc.serial_sequences->>g.serial_year::text)::int, 0),
      COALESCE(ev.max_sequence, 0)
    ) AS base_sequence
  FROM candidate_groups g
  LEFT JOIN p2_customers pc ON pc.customer_id = g.customer_id::text
  LEFT JOIN existing_valid ev
    ON ev.customer_id = g.customer_id
   AND ev.serial_year = g.serial_year
),
numbered AS (
  SELECT
    c.id,
    c.customer_id,
    c.serial_year,
    gb.base_sequence
      + ROW_NUMBER() OVER (
          PARTITION BY c.customer_id, c.serial_year
          ORDER BY c.created_at, c.id
        ) AS new_sequence,
    c.serial_prefix || c.year_suffix ||
      LPAD(
        (
          gb.base_sequence
            + ROW_NUMBER() OVER (
                PARTITION BY c.customer_id, c.serial_year
                ORDER BY c.created_at, c.id
              )
        )::text,
        5,
        '0'
      ) AS new_serial
  FROM candidates c
  JOIN group_base gb
    ON gb.customer_id = c.customer_id
   AND gb.serial_year = c.serial_year
),
updated_items AS (
  UPDATE p2_serialized_items si
  SET
    serial_number = n.new_serial,
    barcode = n.new_serial,
    traveler_barcode = n.new_serial,
    sequence_number = n.new_sequence,
    updated_at = NOW()
  FROM numbered n
  WHERE si.id = n.id
  RETURNING si.customer_id, n.serial_year, n.new_sequence
),
sequence_updates AS (
  SELECT customer_id, serial_year, MAX(new_sequence) AS max_sequence
  FROM updated_items
  GROUP BY customer_id, serial_year
),
customer_sequences AS (
  SELECT
    customer_id,
    jsonb_object_agg(serial_year::text, max_sequence) AS sequence_patch
  FROM sequence_updates
  GROUP BY customer_id
)
UPDATE p2_customers pc
SET serial_sequences = COALESCE(pc.serial_sequences, '{}'::jsonb) ||
  cs.sequence_patch
FROM customer_sequences cs
WHERE pc.customer_id = cs.customer_id::text;
