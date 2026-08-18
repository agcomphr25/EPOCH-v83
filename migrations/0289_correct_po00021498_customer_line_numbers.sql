-- Add an explicit customer PO line / CLIN to P2 PO items, then correct the
-- first two lines of Astrion PO00021498 without changing item identities.

ALTER TABLE p2_purchase_order_items
  ADD COLUMN IF NOT EXISTS customer_po_line text;

DO $$
DECLARE
  before_rows jsonb;
  after_rows jsonb;
BEGIN
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', poi.id,
             'partNumber', poi.part_number,
             'customerPoLine', poi.customer_po_line
           ) ORDER BY poi.id
         )
    INTO before_rows
    FROM p2_purchase_order_items poi
    JOIN p2_purchase_orders po ON po.id = poi.po_id
   WHERE po.po_number = 'PO00021498'
     AND (
       poi.part_number LIKE 'AG-PRIV-01%'
       OR poi.part_number LIKE 'AG-LAUN-01%'
     );

  IF EXISTS (
    SELECT 1
      FROM p2_purchase_order_items poi
      JOIN p2_purchase_orders po ON po.id = poi.po_id
     WHERE po.po_number = 'PO00021498'
       AND (
         (poi.part_number LIKE 'AG-PRIV-01%' AND poi.customer_po_line IS DISTINCT FROM '1')
         OR (poi.part_number LIKE 'AG-LAUN-01%' AND poi.customer_po_line IS DISTINCT FROM '2')
       )
  ) THEN
    UPDATE p2_purchase_order_items poi
       SET customer_po_line = CASE
         WHEN poi.part_number LIKE 'AG-PRIV-01%' THEN '1'
         WHEN poi.part_number LIKE 'AG-LAUN-01%' THEN '2'
         ELSE poi.customer_po_line
       END,
       updated_at = now()
      FROM p2_purchase_orders po
     WHERE po.id = poi.po_id
       AND po.po_number = 'PO00021498'
       AND (
         poi.part_number LIKE 'AG-PRIV-01%'
         OR poi.part_number LIKE 'AG-LAUN-01%'
       );

    SELECT jsonb_agg(
             jsonb_build_object(
               'id', poi.id,
               'partNumber', poi.part_number,
               'customerPoLine', poi.customer_po_line
             ) ORDER BY poi.id
           )
      INTO after_rows
      FROM p2_purchase_order_items poi
      JOIN p2_purchase_orders po ON po.id = poi.po_id
     WHERE po.po_number = 'PO00021498'
       AND (
         poi.part_number LIKE 'AG-PRIV-01%'
         OR poi.part_number LIKE 'AG-LAUN-01%'
       );

    INSERT INTO schema_change_log (
      actor,
      action_type,
      table_name,
      column_name,
      before_state,
      after_state,
      approved_by,
      override_reason
    ) VALUES (
      'migration:0289',
      'OVERRIDE',
      'p2_purchase_order_items',
      'customer_po_line',
      before_rows,
      after_rows,
      'Glenn Jones',
      'Correct PO00021498 customer line order: AG-PRIV-01 is Line 1 and AG-LAUN-01 is Line 2.'
    );
  END IF;
END $$;
