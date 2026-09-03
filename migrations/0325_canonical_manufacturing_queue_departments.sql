-- Preserve the complete legacy department baseline while adding the canonical
-- Kitting, Core, and Sub Assembly manufacturing queues. Existing aliases,
-- including intentionally inactive/disabled rows, remain authoritative.

BEGIN;

-- Serialize safe-boot migration replay with shared-department administration.
SELECT pg_advisory_xact_lock(1145394256);

WITH canonical_departments(name, department_code, preferred_order, aliases) AS (
  VALUES
    ('Production Queue', 'PRODUCTION_QUEUE', 1, ARRAY['productionqueue', 'p1productionqueue']::text[]),
    ('Layup', 'LAYUP', 2, ARRAY['layup', 'layupplugging']::text[]),
    ('Barcode', 'BARCODE', 3, ARRAY['barcode']::text[]),
    ('CNC', 'CNC', 4, ARRAY['cnc']::text[]),
    ('Gunsmith', 'GUNSMITH', 5, ARRAY['gunsmith']::text[]),
    ('Paint', 'PAINT', 6, ARRAY['paint']::text[]),
    ('Finish', 'FINISH', 7, ARRAY['finish']::text[]),
    ('Finish QC', 'FINISH_QC', 8, ARRAY['finishqc']::text[]),
    ('Shipping QC', 'SHIPPING_QC', 9, ARRAY['shippingqc']::text[]),
    ('Shipping', 'SHIPPING', 10, ARRAY['shipping']::text[]),
    ('Cutting Table', 'CUTTING_TABLE', 11, ARRAY['cuttingtable', 'cutting']::text[]),
    ('Office', 'OFFICE', 12, ARRAY['office']::text[]),
    ('Assembly', 'ASSEMBLY', 13, ARRAY['assembly']::text[]),
    ('Kitting', 'KITTING', 14, ARRAY['kitting', 'kit', 'kits']::text[]),
    ('Core', 'CORE', 15, ARRAY['core', 'cores']::text[]),
    ('Sub Assembly', 'SUB_ASSEMBLY', 16, ARRAY['subassembly', 'subassemblies', 'subassy']::text[])
),
missing_departments AS (
  SELECT canonical.*
  FROM canonical_departments canonical
  WHERE NOT EXISTS (
    SELECT 1
    FROM inventory_departments department
    WHERE regexp_replace(lower(btrim(department.name)), '[^a-z0-9]+', '', 'g')
            = ANY(canonical.aliases)
       OR regexp_replace(
            lower(btrim(COALESCE(department.department_code, ''))),
            '[^a-z0-9]+',
            '',
            'g'
          ) = ANY(canonical.aliases)
  )
),
numbered_departments AS (
  SELECT
    missing.*,
    row_number() OVER (ORDER BY missing.preferred_order) AS missing_order
  FROM missing_departments missing
),
current_order AS (
  SELECT COALESCE(MAX(sort_order), 0) AS maximum_sort_order
  FROM inventory_departments
)
INSERT INTO inventory_departments
  (name, department_code, is_active, routing_enabled, production_enabled,
   scheduling_enabled, sort_order, created_by, updated_by)
SELECT
  missing.name,
  missing.department_code,
  true,
  true,
  true,
  true,
  current_order.maximum_sort_order + missing.missing_order,
  'migration:0325',
  'migration:0325'
FROM numbered_departments missing
CROSS JOIN current_order
ORDER BY missing.preferred_order
ON CONFLICT DO NOTHING;

COMMIT;
