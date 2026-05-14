import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  arPaymentAllocations,
  arPayments,
  chartOfAccounts,
  journalEntries,
  journalLines,
} from '../../schema';
import { assertPostingAllowedForPeriod } from './accountingPeriodService';

type DbExecutor = typeof db | any;

type ArPaymentRecord = typeof arPayments.$inferSelect;

function paymentEffectiveDate(payment: Pick<ArPaymentRecord, 'paymentDate'>): Date {
  const rawPaymentDate = payment.paymentDate as unknown;
  return rawPaymentDate instanceof Date
    ? rawPaymentDate
    : new Date(`${payment.paymentDate}T00:00:00`);
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

async function getPaymentAllocations(tx: DbExecutor, paymentId: string) {
  return tx
    .select()
    .from(arPaymentAllocations)
    .where(eq(arPaymentAllocations.paymentId, paymentId));
}

export async function createOrUpdateArPaymentJournalEntry(
  paymentId: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const [payment] = await tx
    .select()
    .from(arPayments)
    .where(eq(arPayments.id, paymentId))
    .limit(1);

  if (!payment) {
    throw new Error(`AR payment ${paymentId} not found`);
  }
  if (payment.status === 'voided') {
    return null;
  }

  const effectiveDate = paymentEffectiveDate(payment);
  await assertPostingAllowedForPeriod({
    effectiveDate,
    user,
    postingMode: 'STANDARD',
  });

  const customerPaymentClearing = await getRequiredAccount(tx, '10300', 'Customer Payment Clearing');
  const accountsReceivable = await getRequiredAccount(tx, '11000', 'Accounts Receivable');
  const allocations = await getPaymentAllocations(tx, paymentId);
  const amount = Math.round(Number(payment.amount) * 100) / 100;

  if (amount <= 0) {
    throw new Error(`AR payment ${paymentId} amount must be positive to post`);
  }

  const [existingEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'AR_PAYMENT'),
        eq(journalEntries.referenceType, 'ar_payment'),
        eq(journalEntries.referenceUuid, paymentId),
      ),
    )
    .limit(1);

  if (existingEntry?.status === 'EXPORTED') {
    throw new Error(`AR payment journal entry ${existingEntry.id} is EXPORTED and cannot be changed`);
  }

  const allocatedAmount = Math.round(
    allocations.reduce((sum: number, allocation: typeof arPaymentAllocations.$inferSelect) => (
      sum + Number(allocation.amountApplied)
    ), 0) * 100,
  ) / 100;

  const commonDimensions = {
    customerId: payment.customerId,
    allowability: 'ALLOWABLE',
    directIndirect: 'UNASSIGNED',
    costPool: 'NONE',
    dimensionTags: {
      source: 'ar_payment',
      paymentId,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber,
      allocatedAmount,
      unappliedAmount: Math.round((amount - allocatedAmount) * 100) / 100,
      allocationIds: allocations.map((allocation: typeof arPaymentAllocations.$inferSelect) => allocation.id),
      invoiceIds: allocations.map((allocation: typeof arPaymentAllocations.$inferSelect) => allocation.invoiceId),
    } as Record<string, unknown>,
  };

  const entryValues = {
    transactionType: 'AR_PAYMENT',
    referenceType: 'ar_payment',
    referenceId: 0,
    referenceUuid: paymentId,
    effectiveDate,
    memo: `AR payment ${payment.referenceNumber || paymentId} - customer ${payment.customerId}`,
    status: 'POSTED',
    sourceSystem: 'EPOCH',
    sourceDocumentType: 'AR_PAYMENT',
    sourceDocumentNumber: payment.referenceNumber || paymentId,
    postingMode: 'STANDARD',
    postedAt: new Date(),
    postedBy: user?.username || payment.createdBy || null,
    createdBy: user?.username || payment.createdBy || null,
  };

  let entryId: number;
  if (existingEntry) {
    entryId = existingEntry.id;
    await tx
      .update(journalEntries)
      .set({
        ...entryValues,
        updatedAt: new Date(),
      })
      .where(eq(journalEntries.id, existingEntry.id));
    await tx.delete(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));
  } else {
    const [entry] = await tx.insert(journalEntries).values(entryValues).returning();
    entryId = entry.id;
  }

  const lines = [
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
      accountId: accountsReceivable.id,
      debitAmount: 0,
      creditAmount: amount,
    },
  ];

  await tx.insert(journalLines).values(lines);

  return {
    journalEntryId: entryId,
    amount,
    allocatedAmount,
    unappliedAmount: Math.round((amount - allocatedAmount) * 100) / 100,
  };
}

export async function reverseArPaymentJournalEntry(
  paymentId: string,
  voidReason: string,
  user?: { username?: string | null } | null,
  tx: DbExecutor = db,
) {
  const [payment] = await tx
    .select()
    .from(arPayments)
    .where(eq(arPayments.id, paymentId))
    .limit(1);

  if (!payment) {
    throw new Error(`AR payment ${paymentId} not found`);
  }

  const [originalEntry] = await tx
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.transactionType, 'AR_PAYMENT'),
        eq(journalEntries.referenceType, 'ar_payment'),
        eq(journalEntries.referenceUuid, paymentId),
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
        eq(journalEntries.transactionType, 'AR_PAYMENT_REVERSAL'),
        eq(journalEntries.referenceType, 'ar_payment'),
        eq(journalEntries.referenceUuid, paymentId),
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
      transactionType: 'AR_PAYMENT_REVERSAL',
      referenceType: 'ar_payment',
      referenceId: 0,
      referenceUuid: paymentId,
      effectiveDate,
      memo: `Void AR payment ${payment.referenceNumber || paymentId}: ${voidReason}`,
      status: 'POSTED',
      sourceSystem: 'EPOCH',
      sourceDocumentType: 'AR_PAYMENT_VOID',
      sourceDocumentNumber: payment.referenceNumber || paymentId,
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
        source: 'ar_payment_void',
        reversalOfJournalEntryId: originalEntry.id,
        voidReason,
      },
    })),
  );

  return { journalEntryId: reversal.id, alreadyReversed: false };
}
