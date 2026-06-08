/**
 * Repair P2 packing slip / invoice number references for historical unsent records.
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
 *   - Updates only packing slip invoice_number and packing_slip_number to the
 *     linked invoice number.
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
  number_conflict: boolean;
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

async function loadCandidates(includePosted: boolean): Promise<CandidateRow[]> {
  const result = await pgPool.query<CandidateRow>(`
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
      AND (
        ps.packing_slip_number IS DISTINCT FROM inv.invoice_number
        OR ps.invoice_number IS DISTINCT FROM inv.invoice_number
      )
    ORDER BY inv.invoice_number, ps.id
  `);

  return result.rows;
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
      `slipInvoice=${row.packing_slip_invoice_number || '(null)'}`,
    );
  }
  if (candidates.length > 25) {
    console.log(`  ... ${candidates.length - 25} more candidate(s) omitted from console preview`);
  }

  if (blocked.length > 0) {
    console.log('[repair-p2-packslip-invoice-links] blocked rows were skipped because another packing slip already uses the target invoice number.');
  }

  let packingSlipsUpdated = 0;

  if (repairable.length > 0) {
    if (args.apply) {
      await pgPool.query('BEGIN');
      try {
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
        await pgPool.query('COMMIT');
      } catch (error) {
        await pgPool.query('ROLLBACK');
        throw error;
      }
    } else {
      packingSlipsUpdated = repairable.length;
    }
  }

  console.log('[repair-p2-packslip-invoice-links] summary');
  console.log(`  packing slips number-linked : ${packingSlipsUpdated}${args.apply ? '' : ' (dry-run estimate)'}`);
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
