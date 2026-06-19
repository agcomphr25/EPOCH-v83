import { queryRows } from '../../db';

type SyncRow = {
  id: number;
  previous_status: string;
  next_status: string;
};

export async function syncLinkedPartsRequestsReceivedForVendorPo(
  vendorPoId: number,
  actor: string,
): Promise<SyncRow[]> {
  const updated = await queryRows<SyncRow>(
    `
    WITH line_receipts AS (
      SELECT
        vpi.id AS vendor_po_item_id,
        GREATEST(
          COALESCE(vpi.received_quantity, 0),
          COALESCE(SUM(CASE WHEN r.vendor_po_id = vpi.vendor_po_id THEN rl.received_qty ELSE 0 END), 0)
        )::float AS received_qty
      FROM vendor_po_items vpi
      LEFT JOIN receipt_lines rl
        ON rl.vendor_po_item_id = vpi.id
      LEFT JOIN receipts r
        ON r.id = rl.receipt_id
      WHERE vpi.vendor_po_id = $1
      GROUP BY vpi.id, vpi.received_quantity
    ),
    po_totals AS (
      SELECT
        pr.id,
        pr.status AS previous_status,
        pr.quantity,
        COALESCE(SUM(line_receipts.received_qty), 0)::float AS received_qty
      FROM parts_requests pr
      JOIN vendor_po_items vpi
        ON vpi.vendor_po_id = pr.vendor_po_id
       AND (
         (pr.ag_part_number IS NOT NULL AND vpi.ag_part_number = pr.ag_part_number)
         OR (pr.part_number IS NOT NULL AND vpi.ag_part_number = pr.part_number)
         OR (pr.part_number IS NOT NULL AND vpi.description = pr.part_number)
         OR (pr.part_name IS NOT NULL AND vpi.description = pr.part_name)
       )
      LEFT JOIN line_receipts
        ON line_receipts.vendor_po_item_id = vpi.id
      WHERE pr.vendor_po_id = $1
        AND pr.status IN ('PENDING', 'APPROVED', 'ORDERED', 'ORDERED_PARTIAL', 'RECEIVED_PARTIAL')
      GROUP BY pr.id, pr.status, pr.quantity
    ),
    next_values AS (
      SELECT
        id,
        previous_status,
        LEAST(quantity, FLOOR(received_qty)::int) AS qty_received,
        CASE
          WHEN received_qty >= quantity THEN 'RECEIVED'
          WHEN received_qty > 0 THEN 'RECEIVED_PARTIAL'
          ELSE previous_status
        END AS next_status
      FROM po_totals
      WHERE received_qty > 0
    )
    UPDATE parts_requests pr
       SET qty_received = next_values.qty_received,
           qty_ordered = GREATEST(COALESCE(pr.qty_ordered, 0), next_values.qty_received),
           status = next_values.next_status,
           order_date = COALESCE(pr.order_date, NOW()),
           actual_delivery = CASE WHEN next_values.next_status = 'RECEIVED' THEN CURRENT_DATE ELSE pr.actual_delivery END,
           updated_at = NOW()
      FROM next_values
     WHERE pr.id = next_values.id
       AND (
         pr.status <> next_values.next_status
         OR COALESCE(pr.qty_received, 0) <> next_values.qty_received
       )
    RETURNING pr.id, next_values.previous_status, next_values.next_status
    `,
    [vendorPoId],
  );

  if (updated.length === 0) return updated;

  await queryRows(
    `
    INSERT INTO parts_request_status_history (parts_request_id, from_status, to_status, changed_by, reason)
    SELECT id, previous_status, next_status, $2, $3
      FROM jsonb_to_recordset($1::jsonb) AS x(id int, previous_status text, next_status text)
    `,
    [
      JSON.stringify(updated),
      actor,
      `Linked Vendor PO #${vendorPoId} receipt updated the parts request automatically.`,
    ],
  );

  return updated;
}

export async function backfillLinkedPartsRequestReceiptStatuses(
  actor = 'system:parts-request-vendor-po-backfill',
): Promise<{ vendorPoCount: number; requestUpdateCount: number }> {
  const linkedPos = await queryRows<{ vendor_po_id: number }>(
    `
    SELECT DISTINCT vendor_po_id
      FROM parts_requests
     WHERE vendor_po_id IS NOT NULL
       AND is_active = true
       AND status IN ('PENDING', 'APPROVED', 'ORDERED', 'ORDERED_PARTIAL', 'RECEIVED_PARTIAL')
     ORDER BY vendor_po_id
    `,
  );

  let requestUpdateCount = 0;
  for (const row of linkedPos) {
    const updated = await syncLinkedPartsRequestsReceivedForVendorPo(row.vendor_po_id, actor);
    requestUpdateCount += updated.length;
  }

  return {
    vendorPoCount: linkedPos.length,
    requestUpdateCount,
  };
}
