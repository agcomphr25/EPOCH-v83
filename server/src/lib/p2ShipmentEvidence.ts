export const P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL = `
  WITH shipped_lots AS (
    SELECT
      lot.po_id,
      COALESCE(lot.serialized_item_ids, '[]'::jsonb) AS serialized_item_ids,
      slip.line_items,
      certificate.serial_numbers AS certificate_serial_numbers
    FROM p2_lot_numbers lot
    LEFT JOIN LATERAL (
      SELECT candidate.*
      FROM p2_packing_slips candidate
      WHERE candidate.id = lot.packing_slip_id
         OR candidate.lot_number_id = lot.id
      ORDER BY
        CASE WHEN candidate.id = lot.packing_slip_id THEN 0 ELSE 1 END,
        candidate.created_at DESC NULLS LAST
      LIMIT 1
    ) slip ON TRUE
    LEFT JOIN LATERAL (
      SELECT candidate.serial_numbers
      FROM p2_certificates_of_conformance candidate
      WHERE candidate.id = lot.certificate_id
         OR candidate.lot_number_id = lot.id
      ORDER BY candidate.created_at DESC NULLS LAST
      LIMIT 1
    ) certificate ON TRUE
    WHERE lot.po_id = ANY($1)
      AND COALESCE(UPPER(lot.status), '') <> 'VOID'
      AND (
        lot.packing_slip_id IS NOT NULL
        OR slip.id IS NOT NULL
        OR COALESCE(UPPER(lot.status), '') = 'SHIPPED'
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
      REGEXP_REPLACE(
        UPPER(TRIM(serial.value)),
        '-(?:RMA-[0-9]+|R[0-9]+)$',
        '',
        'i'
      ) AS "serialNumber"
    FROM shipped_lots lot
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(lot.line_items) = 'array' THEN lot.line_items ELSE '[]'::jsonb END
    ) AS line_item(value)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(COALESCE(
          line_item.value -> 'serialNumbers',
          line_item.value -> 'serial_numbers'
        )) = 'array'
          THEN COALESCE(
            line_item.value -> 'serialNumbers',
            line_item.value -> 'serial_numbers'
          )
        ELSE '[]'::jsonb
      END
    ) AS serial(value)
  ), certificate_serials AS (
    SELECT
      lot.po_id AS "poId",
      REGEXP_REPLACE(
        UPPER(TRIM(serial.value)),
        '-(?:RMA-[0-9]+|R[0-9]+)$',
        '',
        'i'
      ) AS "serialNumber"
    FROM shipped_lots lot
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(lot.certificate_serial_numbers) = 'array'
          THEN lot.certificate_serial_numbers
        ELSE '[]'::jsonb
      END
    ) AS serial(value)
  ), shipment_serials AS (
    SELECT "poId", "serialNumber" FROM packing_slip_serials
    UNION
    SELECT "poId", "serialNumber" FROM certificate_serials
  ), packing_slip_membership AS (
    SELECT DISTINCT
      evidence."poId",
      item.id::text AS "serializedItemId"
    FROM shipment_serials evidence
    JOIN p2_purchase_orders evidence_po
      ON evidence_po.id = evidence."poId"
    JOIN p2_serialized_items item
      ON evidence."serialNumber" = ANY(ARRAY[
        REGEXP_REPLACE(UPPER(TRIM(item.serial_number)), '-(?:RMA-[0-9]+|R[0-9]+)$', '', 'i'),
        REGEXP_REPLACE(UPPER(TRIM(item.customer_serial_number)), '-(?:RMA-[0-9]+|R[0-9]+)$', '', 'i'),
        REGEXP_REPLACE(UPPER(TRIM(item.barcode)), '-(?:RMA-[0-9]+|R[0-9]+)$', '', 'i'),
        REGEXP_REPLACE(UPPER(TRIM(item.traveler_barcode)), '-(?:RMA-[0-9]+|R[0-9]+)$', '', 'i')
      ])
    JOIN p2_purchase_orders item_po
      ON item_po.id = item.po_id
     AND COALESCE(item_po.parent_po_id, item_po.id)
       = COALESCE(evidence_po.parent_po_id, evidence_po.id)
  )
  SELECT "poId", "serializedItemId" FROM explicit_membership
  UNION
  SELECT "poId", "serializedItemId" FROM packing_slip_membership
`;

export function normalizeP2ShipmentSerialIdentity(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/-(?:RMA-\d+|R\d+)$/i, '');
}

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
