/**
 * Repair P2 packing slip / invoice references for historical unsent records.
 *
 * Background:
 *   P2 packing slips previously generated their own PS... number and later
 *   invoices could receive a separate invoice number. The intended behavior is
 *   the P1-style relationship: the packing slip reserves/references the invoice
 *   number, and the invoice pulls that number from the packing slip.
 *
 * Behavior:
 *   - Default scope is P2 invoices in DRAFT or REVIEW with a linked P2 packing slip.
 *   - Sent/paid/voided invoices are always excluded.
 *   - Updates packing slip invoice_number and packing_slip_number to the linked
 *     invoice number.
 *   - Updates invoice line part_number/description from linked PO item customer
 *     part numbers where po_item_id exists.
 *   - Updates stored packing slip line_items JSON to prefer customer PO part
 *     numbers, preserving the old value in internalPartNumber/agPartNumber.
 *
 * Usage:
 *   npx tsx server/scripts/repairP2PackingSlipInvoiceLinks.ts
 *   npx tsx server/scripts/repairP2PackingSlipInvoiceLinks.ts --apply
 *   npx tsx server/scripts/repairP2PackingSlipInvoiceLinks.ts --apply --include-posted
 */

import { pgPool } from '../db';

type CliArgs = {
  apply: boolean;
  includePosted: boolean;
};

type CandidateRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  packing_slip_id: string;
  packing_slip_number: string | null;
  packing_slip_invoice_number: string | null;
  line_part_mismatches: number;
  slip_line_mismatches: number;
  number_conflict: boolean;
};

type SlipLineRepairRow = {
  packing_slip_id: string;
  invoice_number: string;
  line_items: unknown;
};

type PoItemRow = {
  id: number;
  part_number: string;
  part_name: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    includePosted: argv.includes('--include-posted'),
  };
}

function scopedStatusSql(includePosted: boolean) {
  return includePosted
    ? "inv.status IN ('DRAFT', 'REVIEW', 'POSTED')"
    : "inv.status IN ('DRAFT', 'REVIEW')";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getPoItemId(item: Record<string, unknown>): number | null {
  const value = item.poItemId;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function loadCandidates(includePosted: boolean): Promise<CandidateRow[]> {
  const result = await pgPool.query<CandidateRow>(`
    WITH scoped AS (
      SELECT
        inv.id AS invoice_id,
        inv.invoice_number,
        inv.status AS invoice_status,
        ps.id AS packing_slip_id,
        ps.packing_slip_number,
        ps.invoice_number AS packing_slip_invoice_number,
        EXISTS (
          SELECT 1
          FROM p2_packing_slips ps_conflict
          WHERE ps_conflict.id <> ps.id
            AND ps_conflict.packing_slip_number = inv.invoice_number
        ) AS number_conflict
      FROM ar_invoices inv
      JOIN p2_packing_slips ps ON ps.id = inv.packing_slip_id
      WHERE ${scopedStatusSql(includePosted)}
        AND inv.sent_at IS NULL
        AND inv.voided_at IS NULL
        AND inv.status NOT IN ('SENT', 'PAID', 'VOID')
        AND inv.invoice_number IS NOT NULL
        AND TRIM(inv.invoice_number) <> ''
    )
    SELECT
      scoped.*,
      (
        SELECT COUNT(*)::int
        FROM ar_invoice_lines ail
        JOIN p2_purchase_order_items poi ON poi.id = ail.po_item_id
        WHERE ail.invoice_id = scoped.invoice_id
          AND ail.part_number IS DISTINCT FROM poi.part_number
      ) AS line_part_mismatches,
      (
        SELECT COUNT(*)::int
        FROM jsonb_array_elements(COALESCE(ps.line_items, '[]'::jsonb)) item
        JOIN p2_purchase_order_items poi
          ON poi.id = CASE WHEN item->>'poItemId' ~ '^[0-9]+$' THEN (item->>'poItemId')::int ELSE NULL END
        WHERE ps.id = scoped.packing_slip_id
          AND item->>'partNumber' IS DISTINCT FROM poi.part_number
      ) AS slip_line_mismatches
    FROM scoped
    JOIN p2_packing_slips ps ON ps.id = scoped.packing_slip_id
    WHERE scoped.packing_slip_number IS DISTINCT FROM scoped.invoice_number
       OR scoped.packing_slip_invoice_number IS DISTINCT FROM scoped.invoice_number
       OR EXISTS (
          SELECT 1
          FROM ar_invoice_lines ail
          JOIN p2_purchase_order_items poi ON poi.id = ail.po_item_id
          WHERE ail.invoice_id = scoped.invoice_id
            AND ail.part_number IS DISTINCT FROM poi.part_number
       )
       OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(ps.line_items, '[]'::jsonb)) item
          JOIN p2_purchase_order_items poi
            ON poi.id = CASE WHEN item->>'poItemId' ~ '^[0-9]+$' THEN (item->>'poItemId')::int ELSE NULL END
          WHERE item->>'partNumber' IS DISTINCT FROM poi.part_number
       )
    ORDER BY scoped.invoice_number, scoped.packing_slip_id
  `);

  return result.rows;
}

async function repairPackingSlipLineItems(candidateSlipIds: string[], apply: boolean): Promise<number> {
  if (candidateSlipIds.length === 0) return 0;

  const slipRows = await pgPool.query<SlipLineRepairRow>(
    `
      SELECT ps.id AS packing_slip_id, inv.invoice_number, ps.line_items
      FROM p2_packing_slips ps
      JOIN ar_invoices inv ON inv.packing_slip_id = ps.id
      WHERE ps.id = ANY($1::uuid[])
    `,
    [candidateSlipIds],
  );

  const poItemIds = new Set<number>();
  for (const row of slipRows.rows) {
    const items = Array.isArray(row.line_items) ? row.line_items : [];
    for (const item of items) {
      if (!isObject(item)) continue;
      const poItemId = getPoItemId(item);
      if (poItemId) poItemIds.add(poItemId);
    }
  }

  if (poItemIds.size === 0) return 0;

  const poRows = await pgPool.query<PoItemRow>(
    `
      SELECT id, part_number, part_name
      FROM p2_purchase_order_items
      WHERE id = ANY($1::int[])
    `,
    [Array.from(poItemIds)],
  );
  const poItemById = new Map(poRows.rows.map((item) => [item.id, item]));

  let repaired = 0;
  for (const row of slipRows.rows) {
    const items = Array.isArray(row.line_items) ? row.line_items : [];
    let changed = false;
    const repairedItems = items.map((item) => {
      if (!isObject(item)) return item;
      const poItemId = getPoItemId(item);
      const poItem = poItemId ? poItemById.get(poItemId) : undefined;
      if (!poItem || item.partNumber === poItem.part_number) return item;

      changed = true;
      const oldPart = typeof item.partNumber === 'string' ? item.partNumber : null;
      return {
        ...item,
        internalPartNumber: item.internalPartNumber || item.agPartNumber || oldPart,
        agPartNumber: item.agPartNumber || item.internalPartNumber || oldPart,
        partNumber: poItem.part_number,
        partName: poItem.part_name || item.partName || poItem.part_number,
      };
    });

    if (!changed) continue;
    repaired++;
    if (apply) {
      await pgPool.query(
        `
          UPDATE p2_packing_slips
          SET line_items = $1::jsonb,
              updated_at = NOW()
          WHERE id = $2::uuid
        `,
        [JSON.stringify(repairedItems), row.packing_slip_id],
      );
    }
  }

  return repaired;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[repair-p2-packslip-invoice-links] mode=${mode} includePosted=${args.includePosted}`);

  const candidates = await loadCandidates(args.includePosted);
  const blocked = candidates.filter((row) => row.number_conflict);
  const repairable = candidates.filter((row) => !row.number_conflict);

  console.log(`[repair-p2-packslip-invoice-links] candidates=${candidates.length} repairable=${repairable.length} blocked=${blocked.length}`);
  for (const row of candidates.slice(0, 25)) {
    const marker = row.number_conflict ? 'BLOCKED' : args.apply ? 'APPLY' : 'dry-run';
    console.log(
      `  [${marker}] invoice=${row.invoice_number} status=${row.invoice_status} ` +
      `slip=${row.packing_slip_id} slipNo=${row.packing_slip_number || '(null)'} ` +
      `slipInvoice=${row.packing_slip_invoice_number || '(null)'} ` +
      `invoiceLineMismatches=${row.line_part_mismatches} slipLineMismatches=${row.slip_line_mismatches}`,
    );
  }
  if (candidates.length > 25) {
    console.log(`  ... ${candidates.length - 25} more candidate(s) omitted from console preview`);
  }

  if (blocked.length > 0) {
    console.log('[repair-p2-packslip-invoice-links] blocked rows were skipped because another packing slip already uses the target invoice number.');
  }

  let packingSlipsUpdated = 0;
  let invoiceLinesUpdated = 0;
  let slipLineItemsUpdated = 0;

  if (repairable.length > 0) {
    if (args.apply) await pgPool.query('BEGIN');
    try {
      if (args.apply) {
        const slipUpdate = await pgPool.query(
          `
            UPDATE p2_packing_slips ps
            SET invoice_number = inv.invoice_number,
                packing_slip_number = inv.invoice_number,
                updated_at = NOW()
            FROM ar_invoices inv
            WHERE inv.packing_slip_id = ps.id
              AND ps.id = ANY($1::uuid[])
              AND (ps.invoice_number IS DISTINCT FROM inv.invoice_number
                   OR ps.packing_slip_number IS DISTINCT FROM inv.invoice_number)
          `,
          [repairable.map((row) => row.packing_slip_id)],
        );
        packingSlipsUpdated = slipUpdate.rowCount ?? 0;

        const lineUpdate = await pgPool.query(
          `
            UPDATE ar_invoice_lines ail
            SET part_number = poi.part_number,
                description = CASE
                  WHEN poi.part_name IS NOT NULL AND TRIM(poi.part_name) <> ''
                    THEN poi.part_number || ' - ' || poi.part_name
                  ELSE poi.part_number
                END
            FROM ar_invoices inv, p2_purchase_order_items poi
            WHERE ail.invoice_id = inv.id
              AND poi.id = ail.po_item_id
              AND inv.packing_slip_id = ANY($1::uuid[])
              AND ail.part_number IS DISTINCT FROM poi.part_number
          `,
          [repairable.map((row) => row.packing_slip_id)],
        );
        invoiceLinesUpdated = lineUpdate.rowCount ?? 0;
      } else {
        packingSlipsUpdated = repairable.filter((row) =>
          row.packing_slip_number !== row.invoice_number ||
          row.packing_slip_invoice_number !== row.invoice_number
        ).length;
        invoiceLinesUpdated = repairable.reduce((sum, row) => sum + row.line_part_mismatches, 0);
      }

      slipLineItemsUpdated = await repairPackingSlipLineItems(
        repairable.map((row) => row.packing_slip_id),
        args.apply,
      );

      if (args.apply) await pgPool.query('COMMIT');
    } catch (error) {
      if (args.apply) await pgPool.query('ROLLBACK');
      throw error;
    }
  }

  console.log('[repair-p2-packslip-invoice-links] summary');
  console.log(`  packing slips number-linked : ${packingSlipsUpdated}${args.apply ? '' : ' (dry-run estimate)'}`);
  console.log(`  invoice lines corrected     : ${invoiceLinesUpdated}${args.apply ? '' : ' (dry-run estimate)'}`);
  console.log(`  slip JSON line groups fixed : ${slipLineItemsUpdated}${args.apply ? '' : ' (dry-run estimate)'}`);
  console.log(`  blocked conflicts           : ${blocked.length}`);
  if (!args.apply) {
    console.log('[repair-p2-packslip-invoice-links] dry-run only. Re-run with --apply to write changes.');
  }
}

main()
  .then(async () => {
    await pgPool.end();
    console.log('[repair-p2-packslip-invoice-links] done');
    process.exit(0);
  })
  .catch(async (error) => {
    await pgPool.end().catch(() => undefined);
    console.error('[repair-p2-packslip-invoice-links] failed:', error);
    process.exit(1);
  });
