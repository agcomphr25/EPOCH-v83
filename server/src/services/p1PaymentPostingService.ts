import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  allOrders,
  chartOfAccounts,
  customers,
  journalEntries,
  journalLines,
  payments,
} from '../../schema';
import { assertPostingAllowedForPeriod } from './accountingPeriodService';

type DbExecutor = typeof db | any;

type PaymentRow = typeof payments.$inferSelect;

function effectivePaymentDate(payment: Pick<PaymentRow, 'paymentDate'>): Date {
  const rawPaymentDate = payment.paymentDate as unknown;
  return rawPaymentDate instanceof Date
    ? rawPaymentDate
    : new Date(rawPaymentDate as string);
}

async function getRequiredAccount(tx: DbExecutor, accountNumber: string, accountName: string) {
  const [byNumber] = await tx
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.accountNumber, accountNumber))
    .limit(1);
  if (byNumber) return byNumber;

  const [byName] = await tx
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.accountName, accountName))
    .limit(1);
  if (byName) return byName;

  throw new Error(`Required chart-of-accounts entry not found: ${accountNumber} ${accountName}`);
}

async function getPayment(tx: DbExecutor, paymentId: number): Promise<PaymentRow> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) {
    throw new Error(`P1 payment ${paymentId} not found`);
  }
  return payment;
}

async function getOrderAndCustomer(tx: DbExecutor, orderId: string) {
  const [order] = await tx
    .select()
    .from(allOrders)
    .where(eq(allOrders.orderId, orderId))
    .limit(1);

  let customer: typeof customers.$inferSelect | null = null;
  const numericCustomerId = order?.customerId ? Number(order.customerId) : Number.NaN;
  if (Number.isInteger(numericCustomerId)) {
    const [customerById] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, numericCustomerId))
      .limit(1);
    customer = customerById ?? null;
  }

  if (!customer && order?.customerId) {
    const [customerByKey] = await tx
      .select()
      .from(customers)
      .where(eq(customers.customerKey, order.customerId))
      .limit(1);
    customer = customerByKey ?? null;
  }

  return { order: order ?? null, customer };
}

function isPostableCustomerPayment(payment: PaymentRow): boolean {
  return (
    payment.status === 'posted' &&
    payment.status !== 'voided' &&
    payment.status !== 'reversal' &&
    payment.paymentType !== 'payment_reversal' &&
    Number(payment.paymentAmount) > 0
  );
}

export async function createOrUpdateP1PaymentJournalEntry(
  paymentId: number,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const payment = await getPayment(tx, paymentId);
  if (!isPostableCustomerPayment(payment)) {
    return null;
  }

  const effectiveDate = effectivePaymentDate(payment);
  await assertPostingAllowedForPeriod({
    effectiveDate,
    user,
    postingMode: 'STANDARD',
  });

  const amount = Math.round(Number(payment.paymentAmount) * 100) / 100;
  const customerPaymentClearing = await getRequiredAccount(tx, '10300', 'Customer Payment Clearing');
  const customerDeposits = await getRequiredAccount(tx, '20600', 'Customer Deposits');
  const { order, customer } = await getOrderAndCustomer(tx, payment.orderId);
  const customerId = order?.customerId ?? customer?.id?.toString() ?? null;
  const customerType = customer?.customerType ?? 'unknown';

  const [existingEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_CUSTOMER_PAYMENT'),
        eq(journalEntries.referenceType, 'p1_payment'),
        eq(journalEntries.referenceId, paymentId),
      ),
    )
    .limit(1);

  if (existingEntry?.status === 'EXPORTED') {
    throw new Error(`P1 payment journal entry ${existingEntry.id} is EXPORTED and cannot be changed`);
  }

  const commonDimensions = {
    customerId,
    customerNameSnapshot: customer?.name ?? order?.customerId ?? null,
    customerType,
    productionLine: 'P1',
    allowability: 'ALLOWABLE',
    directIndirect: 'UNASSIGNED',
    costPool: 'NONE',
    dimensionTags: {
      source: 'p1_order_payment',
      productionLine: 'P1',
      p1PaymentId: payment.id,
      p1OrderId: payment.orderId,
      paymentType: payment.paymentType,
      customerType,
      customerProfileId: customer?.id ?? null,
      customerKey: customer?.customerKey ?? null,
      customerCompany: customer?.company ?? null,
      customerIsInternational: customer?.isInternational ?? false,
      orderSource: order?.orderSource ?? null,
      customerPO: order?.customerPO ?? null,
      batchId: payment.batchId ?? null,
      feesDeferredUntilSettlement: true,
    } as Record<string, unknown>,
  };

  const entryValues = {
    transactionType: 'P1_CUSTOMER_PAYMENT',
    referenceType: 'p1_payment',
    referenceId: payment.id,
    effectiveDate,
    memo: payment.notes || `P1 payment ${payment.id} - order ${payment.orderId}`,
    status: 'POSTED',
    sourceSystem: 'EPOCH',
    sourceDocumentType: 'P1_PAYMENT',
    sourceDocumentNumber: String(payment.id),
    postingMode: 'STANDARD',
    postedAt: new Date(),
    postedBy: user?.username || null,
    createdBy: user?.username || null,
  };

  let entryId: number;
  if (existingEntry) {
    entryId = existingEntry.id;
    await tx
      .update(journalEntries)
      .set({ ...entryValues, updatedAt: new Date() })
      .where(eq(journalEntries.id, existingEntry.id));
    await tx.delete(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));
  } else {
    const [entry] = await tx.insert(journalEntries).values(entryValues).returning();
    entryId = entry.id;
  }

  await tx.insert(journalLines).values([
    {
      ...commonDimensions,
      journalEntryId: entryId,
      accountId: customerPaymentClearing.id,
      debitAmount: amount,
      creditAmount: 0,
    },
    {
      ...commonDimensions,
      journalEntryId: entryId,
      accountId: customerDeposits.id,
      debitAmount: 0,
      creditAmount: amount,
    },
  ]);

  return { journalEntryId: entryId, amount, customerType };
}

export async function reverseP1PaymentJournalEntry(
  paymentId: number,
  voidReason: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const payment = await getPayment(tx, paymentId);
  const [originalEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_CUSTOMER_PAYMENT'),
        eq(journalEntries.referenceType, 'p1_payment'),
        eq(journalEntries.referenceId, paymentId),
      ),
    )
    .limit(1);

  if (!originalEntry) {
    return null;
  }

  const [existingReversal] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'P1_CUSTOMER_PAYMENT_REVERSAL'),
        eq(journalEntries.referenceType, 'p1_payment'),
        eq(journalEntries.referenceId, paymentId),
      ),
    )
    .limit(1);

  if (existingReversal) {
    return { journalEntryId: existingReversal.id, alreadyReversed: true };
  }

  const effectiveDate = new Date();
  await assertPostingAllowedForPeriod({
    effectiveDate,
    user,
    postingMode: 'REVERSAL',
  });

  const originalLines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, originalEntry.id));

  const [reversal] = await tx
    .insert(journalEntries)
    .values({
      transactionType: 'P1_CUSTOMER_PAYMENT_REVERSAL',
      referenceType: 'p1_payment',
      referenceId: paymentId,
      effectiveDate,
      memo: `Void P1 payment ${paymentId} - order ${payment.orderId}: ${voidReason}`,
      status: 'POSTED',
      sourceSystem: 'EPOCH',
      sourceDocumentType: 'P1_PAYMENT_VOID',
      sourceDocumentNumber: String(paymentId),
      postingMode: 'REVERSAL',
      postedAt: new Date(),
      postedBy: user?.username || payment.voidedBy || null,
      reversalOfJournalEntryId: originalEntry.id,
      createdBy: user?.username || payment.voidedBy || null,
    })
    .returning();

  await tx.insert(journalLines).values(
    originalLines.map((line: typeof journalLines.$inferSelect) => ({
      journalEntryId: reversal.id,
      accountId: line.accountId,
      debitAmount: Number(line.creditAmount ?? 0),
      creditAmount: Number(line.debitAmount ?? 0),
      customerId: line.customerId,
      customerNameSnapshot: line.customerNameSnapshot,
      customerType: line.customerType,
      projectId: line.projectId,
      projectNameSnapshot: line.projectNameSnapshot,
      contractNumber: line.contractNumber,
      productionLine: line.productionLine,
      department: line.department,
      chargeCodeId: line.chargeCodeId,
      inventoryItemId: line.inventoryItemId,
      partNumber: line.partNumber,
      salespersonUserId: line.salespersonUserId,
      salespersonNameSnapshot: line.salespersonNameSnapshot,
      csrUserId: line.csrUserId,
      csrNameSnapshot: line.csrNameSnapshot,
      allowability: line.allowability,
      directIndirect: line.directIndirect,
      costPool: line.costPool,
      dimensionTags: {
        ...(line.dimensionTags as Record<string, unknown>),
        source: 'p1_order_payment_void',
        reversalOfJournalEntryId: originalEntry.id,
        voidReason,
      },
    })),
  );

  return { journalEntryId: reversal.id, alreadyReversed: false };
}
