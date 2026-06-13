/**
 * Backfill P2 packing slips into the reserved-invoice-number workflow.
 *
 * Dry-run by default. Apply mode:
 *   - For slips with a draft/review/posted unsent invoice, align the slip to that invoice number.
 *   - For draft/finalized slips with no invoice, reserve a new P2 invoice number.
 *   - Sent/paid/voided invoices and shipped slips are excluded by default.
 */

import { pgPool } from '../db';
import {
  ensureP2InvoiceNumberingSchema,
  parseP2InvoiceNumber,
  recordP2InvoiceNumberAudit,
  reserveP2InvoiceNumber,
  syncP2InvoiceSequenceFromManualNumber,
} from '../src/services/p2InvoiceNumberService';

type CliArgs = {
  apply: boolean;
  includeShipped: boolean;
};

type CandidateRow = {
  packing_slip_id: string;
  packing_slip_number: string | null;
  packing_slip_invoice_number: string | null;
  packing_slip_status: string;
  customer_id: string;
  customer_name: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    includeShipped: argv.includes('--include-shipped'),
  };
}

async function loadCandidates(includeShipped: boolean): Promise<CandidateRow[]> {
  const shippedFilter = includeShipped ? 'TRUE' : "ps.status IS DISTINCT FROM 'SHIPPED'";
  const result = await pgPool.query<CandidateRow>(`
    SELECT
      ps.id AS packing_slip_id,
      ps.packing_slip_number,
      ps.invoice_number AS packing_slip_invoice_number,
      ps.status AS packing_slip_status,
      ps.customer_id,
      ps.customer_name,
      inv.id AS invoice_id,
      inv.invoice_number,
      inv.status AS invoice_status
    FROM p2_packing_slips ps
    LEFT JOIN ar_invoices inv
      ON inv.packing_slip_id = ps.id
     AND inv.status NOT IN ('SENT', 'PAID', 'VOID')
     AND inv.sent_at IS NULL
     AND inv.voided_at IS NULL
    WHERE ${shippedFilter}
      AND (
        (
          inv.id IS NOT NULL
          AND inv.invoice_number IS NOT NULL
          AND (
            ps.invoice_number IS DISTINCT FROM inv.invoice_number
            OR ps.packing_slip_number IS DISTINCT FROM inv.invoice_number
          )
        )
        OR (
          inv.id IS NULL
          AND ps.status IN ('DRAFT', 'FINALIZED')
          AND (
            ps.invoice_number IS NULL
            OR ps.packing_slip_number IS NULL
            OR ps.packing_slip_number !~ '^[A-Z0-9]{3,}[0-9]{2}-[0-9]{4,}$'
          )
        )
      )
    ORDER BY ps.created_at, ps.id
  `);

  return result.rows;
}

async function alignToExistingInvoice(row: CandidateRow, apply: boolean): Promise<string> {
  if (!row.invoice_number) throw new Error(`Missing invoice number for ${row.packing_slip_id}`);
  if (!apply) return row.invoice_number;

  await pgPool.query(
    `UPDATE p2_packing_slips
        SET invoice_number = $2,
            packing_slip_number = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [row.packing_slip_id, row.invoice_number]
  );
  await syncP2InvoiceSequenceFromManualNumber({
    customerId: row.customer_id,
    customerName: row.customer_name,
    invoiceNumber: row.invoice_number,
  });
  await recordP2InvoiceNumberAudit({
    packingSlipId: row.packing_slip_id,
    invoiceId: row.invoice_id,
    customerId: row.customer_id,
    oldPackingSlipNumber: row.packing_slip_number,
    newPackingSlipNumber: row.invoice_number,
    oldInvoiceNumber: row.packing_slip_invoice_number,
    newInvoiceNumber: row.invoice_number,
    action: 'REPAIR_ALIGN_TO_INVOICE',
    reason: 'P2 invoice number reservation repair',
    changedBy: 'repair:p2-invoice-number-reservations',
    metadata: { invoiceStatus: row.invoice_status },
  });

  return row.invoice_number;
}

async function reserveForSlip(row: CandidateRow, apply: boolean): Promise<string> {
  const existingP2Number = parseP2InvoiceNumber(row.packing_slip_number)
    ? row.packing_slip_number
    : row.packing_slip_invoice_number;

  if (existingP2Number && parseP2InvoiceNumber(existingP2Number)) {
    if (apply) {
      await pgPool.query(
        `UPDATE p2_packing_slips
            SET invoice_number = $2,
                packing_slip_number = $2,
                updated_at = NOW()
          WHERE id = $1`,
        [row.packing_slip_id, existingP2Number]
      );
      await syncP2InvoiceSequenceFromManualNumber({
        customerId: row.customer_id,
        customerName: row.customer_name,
        invoiceNumber: existingP2Number,
      });
      await recordP2InvoiceNumberAudit({
        packingSlipId: row.packing_slip_id,
        customerId: row.customer_id,
        oldPackingSlipNumber: row.packing_slip_number,
        newPackingSlipNumber: existingP2Number,
        oldInvoiceNumber: row.packing_slip_invoice_number,
        newInvoiceNumber: existingP2Number,
        action: 'REPAIR_REUSE_EXISTING_P2_NUMBER',
        reason: 'P2 invoice number reservation repair',
        changedBy: 'repair:p2-invoice-number-reservations',
      });
    }
    return existingP2Number;
  }

  if (!apply) {
    return `${row.customer_name} -> next P2 invoice number`;
  }

  const reservation = await reserveP2InvoiceNumber({
    customerId: row.customer_id,
    customerName: row.customer_name,
  });
  await pgPool.query(
    `UPDATE p2_packing_slips
        SET invoice_number = $2,
            packing_slip_number = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [row.packing_slip_id, reservation.invoiceNumber]
  );
  await recordP2InvoiceNumberAudit({
    packingSlipId: row.packing_slip_id,
    customerId: row.customer_id,
    oldPackingSlipNumber: row.packing_slip_number,
    newPackingSlipNumber: reservation.invoiceNumber,
    oldInvoiceNumber: row.packing_slip_invoice_number,
    newInvoiceNumber: reservation.invoiceNumber,
    action: 'REPAIR_RESERVE_FOR_PACKING_SLIP',
    reason: 'P2 invoice number reservation repair',
    changedBy: 'repair:p2-invoice-number-reservations',
    metadata: {
      prefix: reservation.prefix,
      year: reservation.year,
      sequenceNumber: reservation.sequenceNumber,
    },
  });

  return reservation.invoiceNumber;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureP2InvoiceNumberingSchema();

  const candidates = await loadCandidates(args.includeShipped);
  console.log(`[repair-p2-invoice-number-reservations] mode=${args.apply ? 'APPLY' : 'DRY-RUN'} candidates=${candidates.length}`);

  let aligned = 0;
  let reserved = 0;
  for (const row of candidates) {
    const target = row.invoice_id
      ? await alignToExistingInvoice(row, args.apply)
      : await reserveForSlip(row, args.apply);
    if (row.invoice_id) aligned += 1;
    else reserved += 1;

    console.log(
      `  ${args.apply ? 'fixed' : 'would fix'} slip=${row.packing_slip_id} ` +
      `oldSlip=${row.packing_slip_number || '(null)'} oldInv=${row.packing_slip_invoice_number || '(null)'} ` +
      `target=${target}`
    );
  }

  console.log('[repair-p2-invoice-number-reservations] summary');
  console.log(`  align to existing invoices : ${aligned}`);
  console.log(`  reserve missing numbers    : ${reserved}`);
  if (!args.apply) {
    console.log('  dry-run only. Re-run with --apply to write changes.');
  }
}

main()
  .then(async () => {
    await pgPool.end();
    console.log('[repair-p2-invoice-number-reservations] done');
    process.exit(0);
  })
  .catch(async (error) => {
    await pgPool.end().catch(() => undefined);
    console.error('[repair-p2-invoice-number-reservations] failed:', error);
    process.exit(1);
  });
