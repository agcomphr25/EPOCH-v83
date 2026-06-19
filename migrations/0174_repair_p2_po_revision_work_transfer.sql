-- Repair P2 PO revision work transfer.
--
-- When a PO revision is created after production has started, the current
-- revision should carry the serialized units and P2 production orders from
-- the superseded PO. If a full fresh set was already generated on the current
-- revision, remove only the matching unstarted duplicates first. Quantity
-- increases remain as pending rows on the new revision.

BEGIN;

WITH revision_families AS (
  SELECT
    current_po.id AS new_po_id,
    current_po.po_number AS new_po_number,
    COALESCE(current_po.parent_po_id, current_po.id) AS root_po_id
  FROM p2_purchase_orders current_po
  WHERE current_po.is_current_revision IS TRUE
    AND current_po.parent_po_id IS NOT NULL
),
old_pos AS (
  SELECT
    old_po.id AS old_po_id,
    rf.new_po_id,
    rf.new_po_number
  FROM revision_families rf
  JOIN p2_purchase_orders old_po
    ON old_po.id = rf.root_po_id
    OR old_po.parent_po_id = rf.root_po_id
  WHERE old_po.id <> rf.new_po_id
    AND old_po.is_current_revision IS FALSE
),
old_items AS (
  SELECT
    op.old_po_id,
    op.new_po_id,
    op.new_po_number,
    poi.id AS old_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY op.old_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM old_pos op
  JOIN p2_purchase_order_items poi ON poi.po_id = op.old_po_id
),
new_items AS (
  SELECT
    rf.new_po_id,
    poi.id AS new_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY rf.new_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM revision_families rf
  JOIN p2_purchase_order_items poi ON poi.po_id = rf.new_po_id
),
item_map AS (
  SELECT
    oi.old_po_id,
    oi.new_po_id,
    oi.new_po_number,
    oi.old_item_id,
    ni.new_item_id
  FROM old_items oi
  JOIN new_items ni
    ON ni.new_po_id = oi.new_po_id
   AND ni.part_key = oi.part_key
   AND ni.part_rank = oi.part_rank
),
old_serialized AS (
  SELECT
    psi.id,
    psi.sequence_number,
    im.old_po_id,
    im.new_po_id,
    im.new_po_number,
    im.old_item_id,
    im.new_item_id
  FROM item_map im
  JOIN p2_serialized_items psi
    ON psi.po_id = im.old_po_id
   AND psi.po_item_id = im.old_item_id
),
deleted_new_serialized AS (
  DELETE FROM p2_serialized_items new_psi
  USING old_serialized old_psi
  WHERE new_psi.po_id = old_psi.new_po_id
    AND new_psi.po_item_id = old_psi.new_item_id
    AND new_psi.sequence_number = old_psi.sequence_number
    AND COALESCE(UPPER(new_psi.status), '') = 'ACTIVE'
    AND COALESCE(new_psi.current_stage_index, 0) = 0
    AND LOWER(TRIM(COALESCE(new_psi.current_department, ''))) = 'pending layup'
    AND NOT EXISTS (
      SELECT 1
      FROM travelers t
      WHERE t.serial_number IS NOT NULL
        AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(new_psi.serial_number))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM p2_serialized_item_events e
      WHERE e.serialized_item_id = new_psi.id
        AND COALESCE(UPPER(e.event_type), '') NOT IN ('', 'GENERATED')
    )
  RETURNING new_psi.id
)
UPDATE p2_serialized_items psi
SET po_id = old_psi.new_po_id,
    po_item_id = old_psi.new_item_id,
    po_number = old_psi.new_po_number,
    updated_at = NOW()
FROM old_serialized old_psi
WHERE psi.id = old_psi.id
  AND psi.po_id = old_psi.old_po_id
  AND psi.po_item_id = old_psi.old_item_id;

WITH revision_families AS (
  SELECT
    current_po.id AS new_po_id,
    COALESCE(current_po.parent_po_id, current_po.id) AS root_po_id
  FROM p2_purchase_orders current_po
  WHERE current_po.is_current_revision IS TRUE
    AND current_po.parent_po_id IS NOT NULL
),
old_pos AS (
  SELECT old_po.id AS old_po_id, rf.new_po_id
  FROM revision_families rf
  JOIN p2_purchase_orders old_po
    ON old_po.id = rf.root_po_id
    OR old_po.parent_po_id = rf.root_po_id
  WHERE old_po.id <> rf.new_po_id
    AND old_po.is_current_revision IS FALSE
),
old_items AS (
  SELECT
    op.old_po_id,
    op.new_po_id,
    poi.id AS old_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY op.old_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM old_pos op
  JOIN p2_purchase_order_items poi ON poi.po_id = op.old_po_id
),
new_items AS (
  SELECT
    rf.new_po_id,
    poi.id AS new_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY rf.new_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM revision_families rf
  JOIN p2_purchase_order_items poi ON poi.po_id = rf.new_po_id
),
item_map AS (
  SELECT
    oi.old_po_id,
    oi.new_po_id,
    oi.old_item_id,
    ni.new_item_id
  FROM old_items oi
  JOIN new_items ni
    ON ni.new_po_id = oi.new_po_id
   AND ni.part_key = oi.part_key
   AND ni.part_rank = oi.part_rank
),
old_orders AS (
  SELECT
    p2po.id,
    im.old_po_id,
    im.new_po_id,
    im.old_item_id,
    im.new_item_id,
    p2po.sku,
    p2po.department,
    p2po.bom_definition_id,
    p2po.bom_item_id,
    ROW_NUMBER() OVER (
      PARTITION BY im.old_po_id, im.old_item_id, p2po.sku, p2po.department,
                   p2po.bom_definition_id, p2po.bom_item_id
      ORDER BY p2po.id
    ) AS work_rank
  FROM item_map im
  JOIN p2_production_orders p2po
    ON p2po.p2_po_id = im.old_po_id
   AND p2po.p2_po_item_id = im.old_item_id
),
new_unstarted_orders AS (
  SELECT
    p2po.id,
    im.new_po_id,
    im.new_item_id,
    p2po.sku,
    p2po.department,
    p2po.bom_definition_id,
    p2po.bom_item_id,
    ROW_NUMBER() OVER (
      PARTITION BY im.new_po_id, im.new_item_id, p2po.sku, p2po.department,
                   p2po.bom_definition_id, p2po.bom_item_id
      ORDER BY p2po.id
    ) AS work_rank
  FROM item_map im
  JOIN p2_production_orders p2po
    ON p2po.p2_po_id = im.new_po_id
   AND p2po.p2_po_item_id = im.new_item_id
  WHERE COALESCE(UPPER(p2po.status), '') = 'PENDING'
    AND COALESCE(p2po.quantity_manufactured, 0) = 0
    AND p2po.started_at IS NULL
    AND p2po.completed_at IS NULL
),
deleted_new_orders AS (
  DELETE FROM p2_production_orders new_p2po
  USING old_orders old_p2po
  JOIN new_unstarted_orders new_match
    ON new_match.new_po_id = old_p2po.new_po_id
   AND new_match.new_item_id = old_p2po.new_item_id
   AND COALESCE(new_match.sku, '') = COALESCE(old_p2po.sku, '')
   AND COALESCE(new_match.department, '') = COALESCE(old_p2po.department, '')
   AND COALESCE(new_match.bom_definition_id::text, '') = COALESCE(old_p2po.bom_definition_id::text, '')
   AND COALESCE(new_match.bom_item_id::text, '') = COALESCE(old_p2po.bom_item_id::text, '')
   AND new_match.work_rank = old_p2po.work_rank
  WHERE new_p2po.id = new_match.id
  RETURNING new_p2po.id
)
UPDATE p2_production_orders p2po
SET p2_po_id = old_p2po.new_po_id,
    p2_po_item_id = old_p2po.new_item_id,
    updated_at = NOW()
FROM old_orders old_p2po
WHERE p2po.id = old_p2po.id
  AND p2po.p2_po_id = old_p2po.old_po_id
  AND p2po.p2_po_item_id = old_p2po.old_item_id;

WITH current_revisions AS (
  SELECT
    current_po.id AS new_po_id,
    COALESCE(current_po.parent_po_id, current_po.id) AS root_po_id
  FROM p2_purchase_orders current_po
  WHERE current_po.is_current_revision IS TRUE
    AND current_po.parent_po_id IS NOT NULL
),
old_pos AS (
  SELECT
    old_po.id AS old_po_id,
    cr.new_po_id
  FROM current_revisions cr
  JOIN p2_purchase_orders old_po
    ON old_po.id = cr.root_po_id
    OR old_po.parent_po_id = cr.root_po_id
  WHERE old_po.id <> cr.new_po_id
    AND old_po.is_current_revision IS FALSE
),
old_items AS (
  SELECT
    op.old_po_id,
    op.new_po_id,
    poi.id AS old_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY op.old_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM old_pos op
  JOIN p2_purchase_order_items poi ON poi.po_id = op.old_po_id
),
new_items AS (
  SELECT
    cr.new_po_id,
    poi.id AS new_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY cr.new_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM current_revisions cr
  JOIN p2_purchase_order_items poi ON poi.po_id = cr.new_po_id
),
item_map AS (
  SELECT
    oi.old_po_id,
    oi.new_po_id,
    oi.old_item_id,
    ni.new_item_id
  FROM old_items oi
  JOIN new_items ni
    ON ni.new_po_id = oi.new_po_id
   AND ni.part_key = oi.part_key
   AND ni.part_rank = oi.part_rank
)
UPDATE manufacturing_queue mq
SET p2_po_id = item_map.new_po_id,
    p2_po_item_id = item_map.new_item_id,
    updated_at = NOW()
FROM item_map
WHERE mq.p2_po_id = item_map.old_po_id
  AND mq.p2_po_item_id = item_map.old_item_id;

ALTER TABLE p2_lot_numbers ADD COLUMN IF NOT EXISTS po_item_id INTEGER;

WITH current_revisions AS (
  SELECT
    current_po.id AS new_po_id,
    current_po.po_number AS new_po_number,
    COALESCE(current_po.parent_po_id, current_po.id) AS root_po_id
  FROM p2_purchase_orders current_po
  WHERE current_po.is_current_revision IS TRUE
    AND current_po.parent_po_id IS NOT NULL
),
old_pos AS (
  SELECT
    old_po.id AS old_po_id,
    cr.new_po_id,
    cr.new_po_number
  FROM current_revisions cr
  JOIN p2_purchase_orders old_po
    ON old_po.id = cr.root_po_id
    OR old_po.parent_po_id = cr.root_po_id
  WHERE old_po.id <> cr.new_po_id
    AND old_po.is_current_revision IS FALSE
),
old_items AS (
  SELECT
    op.old_po_id,
    op.new_po_id,
    op.new_po_number,
    poi.id AS old_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY op.old_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM old_pos op
  JOIN p2_purchase_order_items poi ON poi.po_id = op.old_po_id
),
new_items AS (
  SELECT
    cr.new_po_id,
    poi.id AS new_item_id,
    LOWER(TRIM(poi.part_number)) AS part_key,
    ROW_NUMBER() OVER (
      PARTITION BY cr.new_po_id, LOWER(TRIM(poi.part_number))
      ORDER BY poi.id
    ) AS part_rank
  FROM current_revisions cr
  JOIN p2_purchase_order_items poi ON poi.po_id = cr.new_po_id
),
item_map AS (
  SELECT
    oi.old_po_id,
    oi.new_po_id,
    oi.new_po_number,
    oi.old_item_id,
    ni.new_item_id
  FROM old_items oi
  JOIN new_items ni
    ON ni.new_po_id = oi.new_po_id
   AND ni.part_key = oi.part_key
   AND ni.part_rank = oi.part_rank
)
UPDATE p2_lot_numbers lot
SET po_id = item_map.new_po_id,
    po_item_id = item_map.new_item_id,
    po_number = item_map.new_po_number,
    updated_at = NOW()
FROM item_map
WHERE lot.po_id = item_map.old_po_id
  AND lot.po_item_id = item_map.old_item_id;

COMMIT;
