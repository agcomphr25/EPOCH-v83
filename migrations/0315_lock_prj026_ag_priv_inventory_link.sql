-- Restore the PRJ-026 AG-PRIV-01 Rev A source-part identity to AG 26336.
-- Preserve the generated inventory item and all history; only the PO-family
-- source link is corrected. Replays are idempotent.
DO $$
DECLARE
  target_inventory_item_id integer;
  target_line_count integer;
BEGIN
  SELECT id
    INTO STRICT target_inventory_item_id
  FROM inventory_items
  WHERE LOWER(TRIM(ag_part_number)) = '26336';

  WITH project_family_roots AS (
    SELECT DISTINCT COALESCE(po.parent_po_id, po.id) AS family_root_id
    FROM p2_purchase_orders po
    WHERE po.project_id = 'f65ab210-e67e-4907-8f6f-0ae22762857c'::uuid
  ),
  project_family_pos AS (
    SELECT po.id
    FROM p2_purchase_orders po
    JOIN project_family_roots roots
      ON COALESCE(po.parent_po_id, po.id) = roots.family_root_id
  )
  SELECT COUNT(*)::integer
    INTO target_line_count
  FROM p2_purchase_order_items poi
  JOIN project_family_pos family_po ON family_po.id = poi.po_id
  WHERE LOWER(TRIM(poi.part_number)) = 'ag-priv-01 rev a';

  IF target_line_count = 0 THEN
    RAISE EXCEPTION
      'PRJ-026 source part AG-PRIV-01 Rev A was not found; no inventory link changed';
  END IF;

  WITH project_family_roots AS (
    SELECT DISTINCT COALESCE(po.parent_po_id, po.id) AS family_root_id
    FROM p2_purchase_orders po
    WHERE po.project_id = 'f65ab210-e67e-4907-8f6f-0ae22762857c'::uuid
  ),
  project_family_pos AS (
    SELECT po.id
    FROM p2_purchase_orders po
    JOIN project_family_roots roots
      ON COALESCE(po.parent_po_id, po.id) = roots.family_root_id
  )
  UPDATE p2_purchase_order_items poi
     SET inventory_item_id = target_inventory_item_id,
         updated_at = NOW()
  FROM project_family_pos family_po
  WHERE family_po.id = poi.po_id
    AND LOWER(TRIM(poi.part_number)) = 'ag-priv-01 rev a'
    AND poi.inventory_item_id IS DISTINCT FROM target_inventory_item_id;
END
$$;
