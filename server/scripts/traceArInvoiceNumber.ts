/**
 * Read-only trace for duplicate AR invoice numbers.
 *
 * Usage:
 *   npx tsx server/scripts/traceArInvoiceNumber.ts ROC26-0007
 *
 * Prints invoice lifecycle fields, linked P2 packing slip/lot, line items,
 * payments/credits, and all AR invoice journal entries with account lines.
 */

import { pgPool } from '../db';

type TraceRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: string;
  discount_amount: string;
  freight_amount: string;
  tax_amount: string;
  retainage_amount: string;
  total_amount: string;
  customer_id: string;
  customer_name: string | null;
  po_id: string | null;
  po_override: string | null;
  sent_at: string | null;
  sent_by: string | null;
  sent_to: string | null;
  sent_cc: string[] | null;
  sendgrid_message_id: string | null;
  posted_at: string | null;
  posted_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  packing_slip_id: string | null;
  packing_slip_number: string | null;
  packing_slip_invoice_number: string | null;
  packing_slip_status: string | null;
  lot_id: string | null;
  lot_number: string | null;
  lot_po_number: string | null;
  invoice_lines: unknown;
  payments: unknown;
  credit_memos: unknown;
  journal_entries: unknown;
};

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value ?? '');
}

function formatDate(value: unknown) {
  return value ? String(value) : '';
}

function jsonArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function loadTrace(invoiceNumber: string): Promise<TraceRow[]> {
  const result = await pgPool.query<TraceRow>(
    `
      SELECT
        inv.id::text AS invoice_id,
        inv.invoice_number,
        inv.status AS invoice_status,
        inv.invoice_date::text AS invoice_date,
        inv.due_date::text AS due_date,
        inv.subtotal::text,
        inv.discount_amount::text,
        inv.freight_amount::text,
        inv.tax_amount::text,
        inv.retainage_amount::text,
        inv.total_amount::text,
        inv.customer_id,
        COALESCE(p2c.customer_name, c.customer_name, inv.customer_id) AS customer_name,
        inv.po_id,
        inv.po_override,
        inv.sent_at::text,
        inv.sent_by,
        inv.sent_to,
        inv.sent_cc,
        inv.sendgrid_message_id,
        inv.posted_at::text,
        inv.posted_by,
        inv.voided_at::text,
        inv.voided_by,
        inv.void_reason,
        inv.packing_slip_id::text,
        ps.packing_slip_number,
        ps.invoice_number AS packing_slip_invoice_number,
        ps.status AS packing_slip_status,
        COALESCE(inv.lot_id, ps.lot_number_id)::text AS lot_id,
        COALESCE(l_inv.lot_number, l_ps.lot_number, ps.lot_number) AS lot_number,
        COALESCE(l_inv.po_number, l_ps.po_number, ps.po_number) AS lot_po_number,
        COALESCE(lines.invoice_lines, '[]'::json) AS invoice_lines,
        COALESCE(payments.payments, '[]'::json) AS payments,
        COALESCE(credits.credit_memos, '[]'::json) AS credit_memos,
        COALESCE(journals.journal_entries, '[]'::json) AS journal_entries
      FROM ar_invoices inv
      LEFT JOIN p2_customers p2c ON p2c.customer_id = inv.customer_id
      LEFT JOIN customers c ON inv.customer_id ~ '^[0-9]+$' AND c.id = inv.customer_id::int
      LEFT JOIN p2_packing_slips ps ON ps.id = inv.packing_slip_id
      LEFT JOIN p2_lot_numbers l_inv ON l_inv.id = inv.lot_id
      LEFT JOIN p2_lot_numbers l_ps ON l_ps.id = ps.lot_number_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', ail.id,
            'description', ail.description,
            'qty', ail.qty,
            'unitPrice', ail.unit_price,
            'lineTotal', ail.line_total,
            'productionLine', ail.production_line,
            'partNumber', ail.part_number,
            'poItemId', ail.po_item_id,
            'dimensionTags', ail.dimension_tags
          )
          ORDER BY ail.created_at, ail.id
        ) AS invoice_lines
        FROM ar_invoice_lines ail
        WHERE ail.invoice_id = inv.id
      ) lines ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'paymentId', p.id,
            'paymentDate', p.payment_date,
            'paymentMethod', p.payment_method,
            'referenceNumber', p.reference_number,
            'paymentStatus', p.status,
            'amountApplied', a.amount_applied
          )
          ORDER BY p.payment_date, p.created_at, p.id
        ) AS payments
        FROM ar_payment_allocations a
        JOIN ar_payments p ON p.id = a.payment_id
        WHERE a.invoice_id = inv.id
      ) payments ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', cm.id,
            'creditMemoNumber', cm.credit_memo_number,
            'status', cm.status,
            'amount', cm.amount,
            'reason', cm.reason,
            'createdAt', cm.created_at
          )
          ORDER BY cm.created_at, cm.id
        ) AS credit_memos
        FROM credit_memos cm
        WHERE cm.ar_invoice_id = inv.id
      ) credits ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', je.id,
            'transactionType', je.transaction_type,
            'referenceType', je.reference_type,
            'referenceId', je.reference_id,
            'referenceUuid', je.reference_uuid,
            'effectiveDate', je.effective_date,
            'status', je.status,
            'memo', je.memo,
            'sourceDocumentType', je.source_document_type,
            'sourceDocumentNumber', je.source_document_number,
            'postingMode', je.posting_mode,
            'postedAt', je.posted_at,
            'postedBy', je.posted_by,
            'reversalOfJournalEntryId', je.reversal_of_journal_entry_id,
            'voidedAt', je.voided_at,
            'voidedBy', je.voided_by,
            'voidReason', je.void_reason,
            'lines', COALESCE(jl.lines, '[]'::json)
          )
          ORDER BY je.created_at, je.id
        ) AS journal_entries
        FROM journal_entries je
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'id', line.id,
              'accountNumber', coa.account_number,
              'accountName', coa.account_name,
              'accountType', coa.account_type,
              'debitAmount', line.debit_amount,
              'creditAmount', line.credit_amount,
              'productionLine', line.production_line,
              'partNumber', line.part_number,
              'dimensionTags', line.dimension_tags
            )
            ORDER BY line.id
          ) AS lines
          FROM journal_lines line
          LEFT JOIN chart_of_accounts coa ON coa.id = line.account_id
          WHERE line.journal_entry_id = je.id
        ) jl ON TRUE
        WHERE je.transaction_type = 'AR_INVOICE'
          AND (
            je.reference_uuid = inv.id
            OR je.source_document_number = inv.invoice_number
          )
      ) journals ON TRUE
      WHERE inv.invoice_number = $1
      ORDER BY inv.invoice_date, inv.created_at, inv.id
    `,
    [invoiceNumber],
  );

  return result.rows;
}

function printTrace(invoiceNumber: string, rows: TraceRow[]) {
  console.log(`[trace-ar-invoice-number] invoiceNumber=${invoiceNumber} matches=${rows.length}`);
  if (rows.length === 0) return;

  for (const row of rows) {
    console.log('');
    console.log(`Invoice ${row.invoice_number} | ${row.invoice_status} | id=${row.invoice_id}`);
    console.log(`  customer=${row.customer_name || row.customer_id} | invoiceDate=${formatDate(row.invoice_date)} | dueDate=${formatDate(row.due_date)} | total=$${money(row.total_amount)}`);
    console.log(`  PO=${row.po_override || row.po_id || row.lot_po_number || ''} | lot=${row.lot_number || row.lot_id || ''}`);
    console.log(`  packingSlip=${row.packing_slip_number || ''} (${row.packing_slip_id || 'none'}) | slipStatus=${row.packing_slip_status || ''}`);
    console.log(`  sentAt=${formatDate(row.sent_at)} | sentTo=${row.sent_to || ''} | sendgrid=${row.sendgrid_message_id || ''}`);
    console.log(`  postedAt=${formatDate(row.posted_at)} | postedBy=${row.posted_by || ''}`);
    if (row.voided_at) {
      console.log(`  VOIDED at=${row.voided_at} by=${row.voided_by || ''} reason=${row.void_reason || ''}`);
    }

    const lines = jsonArray(row.invoice_lines);
    console.log(`  invoiceLines=${lines.length}`);
    for (const line of lines) {
      console.log(`    - ${line.description} | qty=${line.qty} | unit=${line.unitPrice} | total=${line.lineTotal} | prod=${line.productionLine}`);
    }

    const payments = jsonArray(row.payments);
    const credits = jsonArray(row.credit_memos);
    if (payments.length || credits.length) {
      console.log(`  payments=${payments.length} creditMemos=${credits.length}`);
      for (const payment of payments) {
        console.log(`    payment ${payment.paymentDate || ''} ${payment.paymentMethod || ''} ref=${payment.referenceNumber || ''} applied=$${money(payment.amountApplied)} status=${payment.paymentStatus || ''}`);
      }
      for (const credit of credits) {
        console.log(`    creditMemo ${credit.creditMemoNumber || credit.id} amount=$${money(credit.amount)} status=${credit.status || ''} reason=${credit.reason || ''}`);
      }
    }

    const journalEntries = jsonArray(row.journal_entries);
    console.log(`  journalEntries=${journalEntries.length}`);
    for (const entry of journalEntries) {
      console.log(`    JE #${entry.id} | ${entry.status} | mode=${entry.postingMode} | effective=${formatDate(entry.effectiveDate)} | posted=${formatDate(entry.postedAt)} | reverses=${entry.reversalOfJournalEntryId || ''}`);
      console.log(`      memo=${entry.memo || ''}`);
      for (const line of jsonArray(entry.lines)) {
        console.log(`      ${line.accountNumber || ''} ${line.accountName || ''} | Dr ${money(line.debitAmount)} | Cr ${money(line.creditAmount)} | prod=${line.productionLine || ''}`);
      }
    }
  }
}

async function main() {
  const invoiceNumber = process.argv[2] || 'ROC26-0007';
  const rows = await loadTrace(invoiceNumber);
  printTrace(invoiceNumber, rows);
  console.log('');
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((err) => {
    console.error('[trace-ar-invoice-number] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
