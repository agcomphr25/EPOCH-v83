import { db } from '../../db';
import { chartOfAccounts, journalEntries, journalLines } from '../../schema';
import { eq, and } from 'drizzle-orm';

export type PaymentRecord = {
  id: number;
  paymentType: string;
  paymentAmount: number;
  processingFee?: number | null;
  paymentDate: Date | string;
  notes?: string | null;
  orderId: string;
};

export async function createOrUpdateFromPayment(
  paymentRecord: PaymentRecord,
  user?: { id?: number; username?: string } | null
): Promise<void> {
  if (paymentRecord.paymentType !== 'wire') {
    return;
  }

  const gross = paymentRecord.paymentAmount;
  const fee = paymentRecord.processingFee || 0;
  const net = Math.round((gross - fee) * 100) / 100;

  if (net < 0) {
    console.error(
      `[AccountingService] Net amount is negative for payment ${paymentRecord.id}: net=${net}, gross=${gross}, fee=${fee}. Aborting.`
    );
    return;
  }

  const allAccounts = await db.select().from(chartOfAccounts);
  const bankChecking = allAccounts.find((a) => a.accountName === 'Bank Checking');
  const arOther = allAccounts.find((a) => a.accountName === 'Accounts Receivable – Other');
  const bankServiceCharges = allAccounts.find((a) => a.accountName === 'Bank Service Charges');

  if (!bankChecking || !arOther || !bankServiceCharges) {
    console.error(
      '[AccountingService] Required chart-of-accounts entries not found. Ensure boot seeding has run.'
    );
    return;
  }

  const [existingEntry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.referenceType, 'payment'),
        eq(journalEntries.referenceId, paymentRecord.id)
      )
    )
    .limit(1);

  let entryId: number;
  const isUpdate = !!existingEntry;

  if (existingEntry) {
    if (existingEntry.status === 'EXPORTED') {
      console.warn(
        `[AccountingService] Journal entry ${existingEntry.id} for payment ${paymentRecord.id} is EXPORTED — skipping mutation.`
      );
      return;
    }
    await db
      .delete(journalLines)
      .where(eq(journalLines.journalEntryId, existingEntry.id));
    entryId = existingEntry.id;
  } else {
    const effectiveDate =
      paymentRecord.paymentDate instanceof Date
        ? paymentRecord.paymentDate
        : new Date(paymentRecord.paymentDate);

    const [newEntry] = await db
      .insert(journalEntries)
      .values({
        transactionType: 'WIRE_PAYMENT',
        referenceType: 'payment',
        referenceId: paymentRecord.id,
        effectiveDate,
        memo: paymentRecord.notes || null,
        status: 'DRAFT',
        createdBy: user?.username || null,
      })
      .returning();
    entryId = newEntry.id;
  }

  type LineInsert = { journalEntryId: number; accountId: number; debitAmount: number; creditAmount: number };
  const linesToInsert: LineInsert[] = [];

  linesToInsert.push({
    journalEntryId: entryId,
    accountId: bankChecking.id,
    debitAmount: net,
    creditAmount: 0,
  });

  if (fee > 0) {
    linesToInsert.push({
      journalEntryId: entryId,
      accountId: bankServiceCharges.id,
      debitAmount: fee,
      creditAmount: 0,
    });
  }

  linesToInsert.push({
    journalEntryId: entryId,
    accountId: arOther.id,
    debitAmount: 0,
    creditAmount: gross,
  });

  const totalDebits = linesToInsert.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredits = linesToInsert.reduce((s, l) => s + l.creditAmount, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new Error(
      `[AccountingService] Journal entry imbalanced for payment ${paymentRecord.id}: debits=${totalDebits.toFixed(4)}, credits=${totalCredits.toFixed(4)}`
    );
  }

  await db.insert(journalLines).values(linesToInsert);

  console.log(
    `✅ [AccountingService] Journal entry ${entryId} ${isUpdate ? 'updated' : 'created'} for wire payment ${paymentRecord.id} — gross=${gross}, fee=${fee}, net=${net}`
  );
}

export async function createBulkWireJournalEntry({
  paymentIds,
  totalGross,
  totalFee,
  paymentDate,
  memo,
  user,
}: {
  paymentIds: number[];
  totalGross: number;
  totalFee: number;
  paymentDate: Date;
  memo: string | null;
  user?: { id?: number; username?: string } | null;
}): Promise<void> {
  try {
    const net = Math.round((totalGross - totalFee) * 100) / 100;

    if (net < 0) {
      console.error(
        `[AccountingService] Bulk wire net is negative: gross=${totalGross}, fee=${totalFee}, net=${net}. Aborting.`
      );
      return;
    }

    const allAccounts = await db.select().from(chartOfAccounts);
    const bankChecking = allAccounts.find((a) => a.accountName === 'Bank Checking');
    const arOther = allAccounts.find((a) => a.accountName === 'Accounts Receivable – Other');
    const bankServiceCharges = allAccounts.find((a) => a.accountName === 'Bank Service Charges');

    if (!bankChecking || !arOther || !bankServiceCharges) {
      console.error('[AccountingService] Required chart-of-accounts entries not found for bulk wire. Aborting.');
      return;
    }

    const [newEntry] = await db
      .insert(journalEntries)
      .values({
        transactionType: 'WIRE_PAYMENT',
        referenceType: 'bulk_wire',
        referenceId: 0, // sentinel — no single payment row; see paymentIds in memo
        effectiveDate: paymentDate,
        memo: memo || `Bulk wire — payment IDs: ${paymentIds.join(', ')}`,
        status: 'DRAFT',
        createdBy: user?.username || null,
      })
      .returning();

    type LineInsert = { journalEntryId: number; accountId: number; debitAmount: number; creditAmount: number };
    const linesToInsert: LineInsert[] = [];

    linesToInsert.push({
      journalEntryId: newEntry.id,
      accountId: bankChecking.id,
      debitAmount: net,
      creditAmount: 0,
    });

    if (totalFee > 0) {
      linesToInsert.push({
        journalEntryId: newEntry.id,
        accountId: bankServiceCharges.id,
        debitAmount: totalFee,
        creditAmount: 0,
      });
    }

    linesToInsert.push({
      journalEntryId: newEntry.id,
      accountId: arOther.id,
      debitAmount: 0,
      creditAmount: totalGross,
    });

    const totalDebits = Math.round(linesToInsert.reduce((s, l) => s + l.debitAmount, 0) * 100) / 100;
    const totalCredits = Math.round(linesToInsert.reduce((s, l) => s + l.creditAmount, 0) * 100) / 100;

    if (Math.abs(totalDebits - totalCredits) > 0.001) {
      console.error(
        `[AccountingService] Bulk wire journal entry imbalanced: debits=${totalDebits}, credits=${totalCredits}. Aborting line insert.`
      );
      return;
    }

    await db.insert(journalLines).values(linesToInsert);

    console.log(
      `✅ [AccountingService] Bulk wire journal entry ${newEntry.id} created — ${paymentIds.length} payments, gross=${totalGross}, fee=${totalFee}, net=${net}`
    );
  } catch (err) {
    console.error('[AccountingService] createBulkWireJournalEntry failed:', err);
  }
}

export async function deleteJournalEntryForPayment(paymentId: number): Promise<{ blocked: boolean }> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.referenceType, 'payment'),
        eq(journalEntries.referenceId, paymentId)
      )
    )
    .limit(1);

  if (!entry) {
    return { blocked: false };
  }

  if (entry.status === 'EXPORTED') {
    console.warn(
      `[AccountingService] Payment ${paymentId} has an EXPORTED journal entry (${entry.id}). Deletion blocked.`
    );
    return { blocked: true };
  }

  await db.delete(journalLines).where(eq(journalLines.journalEntryId, entry.id));
  await db.delete(journalEntries).where(eq(journalEntries.id, entry.id));
  console.log(`✅ [AccountingService] Deleted DRAFT journal entry ${entry.id} for payment ${paymentId}`);
  return { blocked: false };
}
