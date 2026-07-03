-- Repair Rock West P2 serialized items that were created with a PO/revision
-- unit barcode as the serial number. P2 serial identity should stay on the
-- continuous customer/year sequence: PREFIX + YY + NNNNN.

ALTER TABLE p2_customers
  ADD COLUMN IF NOT EXISTS serial_sequences JSONB DEFAULT '{}'::jsonb;

DROP TABLE IF EXISTS tmp_rock_west_serial_repair;

CREATE TEMP TABLE tmp_rock_west_serial_repair AS
WITH target AS (
  SELECT
    si.id,
    si.customer_id,
    si.serial_number AS old_serial_number,
    si.barcode AS old_barcode,
    COALESCE(NULLIF(LEFT(regexp_replace(upper(COALESCE(pc.rfq_prefix, pc.customer_name, si.customer_name, 'UNK')), '[^A-Z0-9]', '', 'g'), 3), ''), 'UNK') AS prefix,
    EXTRACT(YEAR FROM COALESCE(po.po_date::timestamp, si.created_at, now()))::int AS serial_year,
    RIGHT(EXTRACT(YEAR FROM COALESCE(po.po_date::timestamp, si.created_at, now()))::int::text, 2) AS year_suffix,
    si.created_at,
    si.sequence_number
  FROM p2_serialized_items si
  JOIN p2_purchase_orders po ON po.id = si.po_id
  LEFT JOIN p2_customers pc ON pc.customer_id = si.customer_id
  WHERE (
      si.customer_name ILIKE 'Rock West%'
      OR po.customer_name ILIKE 'Rock West%'
      OR pc.customer_name ILIKE 'Rock West%'
    )
    AND (
      upper(si.serial_number) LIKE '%-UNIT-%'
      OR upper(si.barcode) LIKE '%-UNIT-%'
    )
),
existing_max AS (
  SELECT
    target.customer_id,
    target.prefix,
    target.serial_year,
    target.year_suffix,
    COALESCE(
      MAX((substring(upper(si.serial_number) from ('^' || target.prefix || target.year_suffix || '([0-9]{5})$')))::int),
      0
    ) AS max_sequence
  FROM target
  LEFT JOIN p2_serialized_items si
    ON si.customer_id = target.customer_id
   AND si.id NOT IN (SELECT id FROM target)
   AND upper(si.serial_number) ~ ('^' || target.prefix || target.year_suffix || '[0-9]{5}$')
  GROUP BY target.customer_id, target.prefix, target.serial_year, target.year_suffix
),
ordered AS (
  SELECT
    target.*,
    existing_max.max_sequence,
    row_number() OVER (
      PARTITION BY target.customer_id, target.serial_year
      ORDER BY target.created_at NULLS LAST, target.sequence_number NULLS LAST, target.id
    ) AS repair_offset
  FROM target
  JOIN existing_max
    ON existing_max.customer_id = target.customer_id
   AND existing_max.prefix = target.prefix
   AND existing_max.serial_year = target.serial_year
)
SELECT
  id,
  customer_id,
  old_serial_number,
  old_barcode,
  prefix || year_suffix || lpad((max_sequence + repair_offset)::text, 5, '0') AS new_serial_number,
  max_sequence + repair_offset AS new_sequence_number,
  serial_year::text AS year_key
FROM ordered
WHERE old_serial_number IS DISTINCT FROM prefix || year_suffix || lpad((max_sequence + repair_offset)::text, 5, '0');

UPDATE p2_serialized_items si
SET
  serial_number = repair.new_serial_number,
  barcode = repair.new_serial_number,
  traveler_barcode = repair.new_serial_number,
  sequence_number = repair.new_sequence_number,
  updated_at = now()
FROM tmp_rock_west_serial_repair repair
WHERE si.id = repair.id;

UPDATE p2_serialized_item_events ev
SET barcode = repair.new_serial_number
FROM tmp_rock_west_serial_repair repair
WHERE ev.serialized_item_id = repair.id;

WITH sequence_updates AS (
  SELECT
    customer_id,
    jsonb_object_agg(year_key, max_sequence) AS serial_sequences
  FROM (
    SELECT customer_id, year_key, MAX(new_sequence_number) AS max_sequence
    FROM tmp_rock_west_serial_repair
    GROUP BY customer_id, year_key
  ) yearly
  GROUP BY customer_id
)
UPDATE p2_customers pc
SET serial_sequences = COALESCE(pc.serial_sequences, '{}'::jsonb) || sequence_updates.serial_sequences
FROM sequence_updates
WHERE pc.customer_id = sequence_updates.customer_id;

DROP TABLE IF EXISTS tmp_rock_west_serial_repair;
