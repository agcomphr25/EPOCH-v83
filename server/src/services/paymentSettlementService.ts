import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { arPaymentSettlementItems, arPaymentSettlements } from '../../schema';
import { createOrReplaceAccountingPosting } from './accountingPostingService';

type SettlementItemInput = {
  paymentSource: 'AR_PAYMENT' | 'P1_PAYMENT';
  paymentId: string;
  amount: number;
};

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export async function getPaymentSettlementWorkspace() {
  const payments = await db.execute(sql`
    WITH eligible AS (
      SELECT 'AR_PAYMENT'::text AS "paymentSource", ap.id::text AS "paymentId",
             ap.payment_date::text AS "paymentDate", ap.customer_id AS "customerId",
             ap.payment_method AS "paymentMethod", ap.reference_number AS "referenceNumber",
             ap.amount::numeric AS amount
        FROM ar_payments ap
       WHERE ap.status = 'posted'
         AND EXISTS (
           SELECT 1 FROM journal_entries je
            WHERE je.reference_uuid = ap.id
              AND je.transaction_type = 'AR_PAYMENT'
              AND je.status IN ('POSTED', 'EXPORTED')
         )
      UNION ALL
      SELECT 'P1_PAYMENT'::text, p.id::text, p.payment_date::date::text,
             ao.customer_id, p.payment_type, p.reference_number, p.payment_amount::numeric
        FROM payments p
        JOIN all_orders ao ON ao.order_id = p.order_id
       WHERE p.status = 'posted'
         AND EXISTS (
           SELECT 1 FROM journal_entries je
            WHERE je.reference_id = p.id
              AND je.transaction_type = 'P1_CUSTOMER_PAYMENT'
              AND je.status IN ('POSTED', 'EXPORTED')
         )
    )
    SELECT e.*,
           COALESCE((
             SELECT SUM(psi.amount::numeric)
               FROM ar_payment_settlement_items psi
               JOIN ar_payment_settlements ps ON ps.id = psi.settlement_id
              WHERE psi.payment_source = e."paymentSource"
                AND psi.payment_id = e."paymentId"
                AND ps.status = 'POSTED'
           ), 0)::numeric AS "settledAmount",
           (e.amount - COALESCE((
             SELECT SUM(psi.amount::numeric)
               FROM ar_payment_settlement_items psi
               JOIN ar_payment_settlements ps ON ps.id = psi.settlement_id
              WHERE psi.payment_source = e."paymentSource"
                AND psi.payment_id = e."paymentId"
                AND ps.status = 'POSTED'
           ), 0))::numeric AS "availableAmount"
      FROM eligible e
     WHERE e.amount - COALESCE((
       SELECT SUM(psi.amount::numeric)
         FROM ar_payment_settlement_items psi
         JOIN ar_payment_settlements ps ON ps.id = psi.settlement_id
        WHERE psi.payment_source = e."paymentSource"
          AND psi.payment_id = e."paymentId"
          AND ps.status = 'POSTED'
     ), 0) > 0.005
     ORDER BY e."paymentDate", e."paymentId"
  `);

  const settlements = await db.execute(sql`
    SELECT ps.id, ps.settlement_date AS "settlementDate", ps.processor,
           ps.bank_reference AS "bankReference", ps.gross_amount::numeric AS "grossAmount",
           ps.fee_amount::numeric AS "feeAmount", ps.net_amount::numeric AS "netAmount",
           ps.status, ps.journal_entry_id AS "journalEntryId", ps.reason,
           ps.created_by AS "createdBy", ps.created_at AS "createdAt",
           COUNT(psi.id)::int AS "paymentCount"
      FROM ar_payment_settlements ps
      LEFT JOIN ar_payment_settlement_items psi ON psi.settlement_id = ps.id
     GROUP BY ps.id
     ORDER BY ps.settlement_date DESC, ps.created_at DESC
     LIMIT 100
  `);

  return { payments: payments.rows, settlements: settlements.rows };
}

export async function createPaymentSettlement(input: {
  settlementDate: string;
  processor: string;
  bankReference: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  reason: string;
  items: SettlementItemInput[];
  createdBy?: string | null;
}) {
  const grossAmount = money(input.grossAmount);
  const feeAmount = money(input.feeAmount);
  const netAmount = money(input.netAmount);
  if (!input.processor?.trim() || !input.bankReference?.trim()) throw new Error('Processor and bank reference are required');
  if (!input.reason?.trim()) throw new Error('An audit reason is required');
  if (grossAmount <= 0 || feeAmount < 0 || netAmount < 0) throw new Error('Settlement amounts are invalid');
  if (Math.abs(grossAmount - feeAmount - netAmount) > 0.005) throw new Error('Net deposit must equal gross payments minus fees');
  if (!input.items.length) throw new Error('Select at least one payment');
  const itemTotal = money(input.items.reduce((sum, item) => sum + money(item.amount), 0));
  if (Math.abs(itemTotal - grossAmount) > 0.005) throw new Error('Selected payment total must equal the gross settlement amount');

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('customer-payment-settlement'), hashtext(${`${input.processor}:${input.bankReference}`}))`);
    const settlementId = randomUUID();

    for (const item of input.items) {
      const availableResult = item.paymentSource === 'AR_PAYMENT'
        ? await tx.execute(sql`
            SELECT ap.amount::numeric - COALESCE((SELECT SUM(psi.amount::numeric) FROM ar_payment_settlement_items psi JOIN ar_payment_settlements ps ON ps.id = psi.settlement_id WHERE psi.payment_source = 'AR_PAYMENT' AND psi.payment_id = ap.id::text AND ps.status = 'POSTED'), 0) AS available
              FROM ar_payments ap WHERE ap.id = ${item.paymentId}::uuid AND ap.status = 'posted'
          `)
        : await tx.execute(sql`
            SELECT p.payment_amount::numeric - COALESCE((SELECT SUM(psi.amount::numeric) FROM ar_payment_settlement_items psi JOIN ar_payment_settlements ps ON ps.id = psi.settlement_id WHERE psi.payment_source = 'P1_PAYMENT' AND psi.payment_id = p.id::text AND ps.status = 'POSTED'), 0) AS available
              FROM payments p WHERE p.id = ${Number(item.paymentId)} AND p.status = 'posted'
          `);
      const available = money(availableResult.rows[0]?.available);
      if (money(item.amount) <= 0 || money(item.amount) > available + 0.005) {
        throw new Error(`Payment ${item.paymentId} has only $${available.toFixed(2)} available to settle`);
      }
    }

    const [settlement] = await tx.insert(arPaymentSettlements).values({
      id: settlementId,
      settlementDate: input.settlementDate,
      processor: input.processor.trim(),
      bankReference: input.bankReference.trim(),
      grossAmount: grossAmount.toFixed(2),
      feeAmount: feeAmount.toFixed(2),
      netAmount: netAmount.toFixed(2),
      reason: input.reason.trim(),
      createdBy: input.createdBy || null,
    }).returning();

    await tx.insert(arPaymentSettlementItems).values(input.items.map((item) => ({
      settlementId,
      paymentSource: item.paymentSource,
      paymentId: item.paymentId,
      amount: money(item.amount).toFixed(2),
    })));

    const postingLines = [
      { accountNumber: '10100', accountName: 'Bank Checking', debitAmount: netAmount, creditAmount: 0, directIndirect: 'UNASSIGNED', costPool: 'NONE', dimensionTags: { source: 'customer_payment_settlement', settlementId, processor: input.processor, bankReference: input.bankReference } },
      ...(feeAmount > 0 ? [{ accountNumber: '77000', accountName: 'Bank Service Charges', debitAmount: feeAmount, creditAmount: 0, directIndirect: 'INDIRECT', costPool: 'G_AND_A', dimensionTags: { source: 'customer_payment_settlement', settlementId, processor: input.processor } }] : []),
      { accountNumber: '10300', accountName: 'Customer Payment Clearing', debitAmount: 0, creditAmount: grossAmount, directIndirect: 'UNASSIGNED', costPool: 'NONE', dimensionTags: { source: 'customer_payment_settlement', settlementId, paymentIds: input.items.map((item) => `${item.paymentSource}:${item.paymentId}`) } },
    ];
    const posting = await createOrReplaceAccountingPosting({
      transactionType: 'CUSTOMER_PAYMENT_SETTLEMENT',
      referenceType: 'ar_payment_settlement',
      referenceId: 0,
      referenceUuid: settlementId,
      effectiveDate: input.settlementDate,
      memo: `Payment settlement ${input.processor} ${input.bankReference}`,
      status: 'POSTED',
      sourceSystem: 'EPOCH',
      sourceDocumentType: 'PAYMENT_SETTLEMENT',
      sourceDocumentNumber: input.bankReference,
      postingMode: 'STANDARD',
      postedBy: input.createdBy || null,
      createdBy: input.createdBy || null,
      lines: postingLines,
    }, { username: input.createdBy || 'system' }, tx);

    await tx.update(arPaymentSettlements).set({ journalEntryId: posting.journalEntryId }).where(eq(arPaymentSettlements.id, settlementId));
    return { ...settlement, journalEntryId: posting.journalEntryId };
  });
}
