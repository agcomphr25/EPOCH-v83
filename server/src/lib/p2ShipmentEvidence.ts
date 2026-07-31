export const P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL = `
  WITH shipped_lots AS (
    SELECT
      lot.po_id,
      COALESCE(lot.serialized_item_ids, '[]'::jsonb) AS serialized_item_ids,
      slip.line_items
    FROM p2_lot_numbers lot
    LEFT JOIN p2_packing_slips slip ON slip.id = lot.packing_slip_id
    WHERE lot.po_id = ANY($1)
      AND (
        COALESCE(UPPER(lot.status), '') = 'SHIPPED'
        OR lot.shipped_at IS NOT NULL
        OR COALESCE(UPPER(slip.status), '') = 'SHIPPED'
      )
  ), explicit_membership AS (
    SELECT
      lot.po_id AS "poId",
      shipped_item.id AS "serializedItemId"
    FROM shipped_lots lot
    CROSS JOIN LATERAL jsonb_array_elements_text(lot.serialized_item_ids) AS shipped_item(id)
  ), packing_slip_serials AS (
    SELECT
      lot.po_id AS "poId",
      UPPER(TRIM(serial.value)) AS "serialNumber"
    FROM shipped_lots lot
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(lot.line_items) = 'array' THEN lot.line_items ELSE '[]'::jsonb END
    ) AS line_item(value)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(line_item.value -> 'serialNumbers') = 'array'
          THEN line_item.value -> 'serialNumbers'
        ELSE '[]'::jsonb
      END
    ) AS serial(value)
  ), packing_slip_membership AS (
    SELECT DISTINCT
      evidence."poId",
      item.id::text AS "serializedItemId"
    FROM packing_slip_serials evidence
    JOIN p2_serialized_items item
      ON UPPER(TRIM(item.serial_number)) = evidence."serialNumber"
  )
  SELECT "poId", "serializedItemId" FROM explicit_membership
  UNION
  SELECT "poId", "serializedItemId" FROM packing_slip_membership
`;

export function indexP2ShippedSerializedItemIds(
  rows: readonly { poId?: unknown; serializedItemId?: unknown }[],
): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const row of rows) {
    const poId = Number(row.poId);
    const serializedItemId = String(row.serializedItemId ?? '').trim().toLowerCase();
    if (!Number.isFinite(poId) || !serializedItemId) continue;
    const ids = result.get(poId) ?? new Set<string>();
    ids.add(serializedItemId);
    result.set(poId, ids);
  }
  return result;
}
