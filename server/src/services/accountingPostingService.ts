import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { chartOfAccounts, journalEntries, journalLines } from '../../schema';
import { assertPostingAllowedForPeriod, type PostingMode } from './accountingPeriodService';

type DbExecutor = typeof db | any;

export type AccountingPostingStatus = 'DRAFT' | 'POSTED';

export type AccountingPostingActor = {
  id?: number | null;
  username?: string | null;
} | null;

export type AccountingAccountRef = {
  accountNumber: string;
  accountName: string;
};

export type AccountingPostingLineInput = AccountingAccountRef & {
  debitAmount?: number | string | null;
  creditAmount?: number | string | null;
  customerId?: string | null;
  customerNameSnapshot?: string | null;
  customerType?: string | null;
  projectId?: string | null;
  projectNameSnapshot?: string | null;
  contractNumber?: string | null;
  productionLine?: string | null;
  department?: string | null;
  chargeCodeId?: number | null;
  inventoryItemId?: string | null;
  partNumber?: string | null;
  salespersonUserId?: number | null;
  salespersonNameSnapshot?: string | null;
  csrUserId?: number | null;
  csrNameSnapshot?: string | null;
  allowability?: string | null;
  directIndirect?: string | null;
  costPool?: string | null;
  dimensionTags?: Record<string, unknown> | null;
};

export type AccountingPostingInput = {
  transactionType: string;
  referenceType: string;
  referenceId?: number;
  referenceUuid?: string | null;
  effectiveDate: Date | string;
  memo?: string | null;
  status?: AccountingPostingStatus;
  sourceSystem?: string;
  sourceDocumentType?: string | null;
  sourceDocumentNumber?: string | null;
  migrationBatchId?: string | null;
  postingMode?: PostingMode;
  reversalOfJournalEntryId?: number | null;
  createdBy?: string | null;
  postedBy?: string | null;
  lines: AccountingPostingLineInput[];
};

export type AccountingPostingResult = {
  journalEntryId: number;
  totalDebits: number;
  totalCredits: number;
  lineCount: number;
  created: boolean;
};

type ExistingEntryLookup = Pick<
  AccountingPostingInput,
  'transactionType' | 'referenceType' | 'referenceId' | 'referenceUuid' | 'sourceDocumentNumber'
>;

function money(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid accounting amount: ${String(value)}`);
  }
  return Math.round(n * 100) / 100;
}

function assertReference(input: AccountingPostingInput): void {
  const hasIntegerReference = Number.isInteger(input.referenceId) && Number(input.referenceId) >= 0;
  const hasUuidReference = typeof input.referenceUuid === 'string' && input.referenceUuid.trim().length > 0;
  if (!hasIntegerReference && !hasUuidReference) {
    throw new Error('Accounting posting requires referenceId or referenceUuid');
  }
}

export function validateBalancedPosting(lines: AccountingPostingLineInput[]): {
  totalDebits: number;
  totalCredits: number;
} {
  if (!lines.length) {
    throw new Error('Accounting posting requires at least one journal line');
  }

  const totalDebits = money(lines.reduce((sum, line) => sum + money(line.debitAmount), 0));
  const totalCredits = money(lines.reduce((sum, line) => sum + money(line.creditAmount), 0));

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new Error(
      `Accounting posting is imbalanced: debits=${totalDebits.toFixed(2)}, credits=${totalCredits.toFixed(2)}`,
    );
  }
  if (totalDebits <= 0) {
    throw new Error('Accounting posting total must be positive');
  }

  for (const line of lines) {
    const debit = money(line.debitAmount);
    const credit = money(line.creditAmount);
    if (debit < 0 || credit < 0) {
      throw new Error('Accounting posting lines cannot contain negative debit or credit amounts');
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Accounting line for ${line.accountNumber} cannot contain both debit and credit amounts`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Accounting line for ${line.accountNumber} must contain a debit or credit amount`);
    }
  }

  return { totalDebits, totalCredits };
}

export function buildReversalLines(
  originalLines: Array<typeof journalLines.$inferSelect>,
  extraTags: Record<string, unknown> = {},
): Array<Omit<typeof journalLines.$inferInsert, 'journalEntryId'>> {
  return originalLines.map((line) => ({
    accountId: line.accountId,
    debitAmount: money(line.creditAmount),
    creditAmount: money(line.debitAmount),
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
      ...((line.dimensionTags as Record<string, unknown> | null) ?? {}),
      ...extraTags,
    },
  }));
}

export async function getRequiredAccountingAccount(
  tx: DbExecutor,
  accountNumber: string,
  accountName: string,
) {
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

async function findExistingEntry(tx: DbExecutor, input: ExistingEntryLookup) {
  const conditions = [
    eq(journalEntries.transactionType, input.transactionType),
    eq(journalEntries.referenceType, input.referenceType),
  ];

  if (input.referenceUuid) {
    conditions.push(eq(journalEntries.referenceUuid, input.referenceUuid));
  } else if (Number.isInteger(input.referenceId)) {
    conditions.push(eq(journalEntries.referenceId, input.referenceId as number));
  }

  if (input.sourceDocumentNumber) {
    conditions.push(eq(journalEntries.sourceDocumentNumber, input.sourceDocumentNumber));
  }

  const [existing] = await tx
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .limit(1);
  return existing ?? null;
}

export async function createOrReplaceAccountingPosting(
  input: AccountingPostingInput,
  actor: AccountingPostingActor = null,
  tx: DbExecutor = db,
): Promise<AccountingPostingResult> {
  assertReference(input);
  const totals = validateBalancedPosting(input.lines);
  const postingMode = input.postingMode ?? 'STANDARD';
  const status = input.status ?? 'POSTED';
  const effectiveDate = input.effectiveDate instanceof Date ? input.effectiveDate : new Date(`${input.effectiveDate}T00:00:00`);
  if (Number.isNaN(effectiveDate.getTime())) {
    throw new Error(`Invalid accounting effective date: ${String(input.effectiveDate)}`);
  }

  await assertPostingAllowedForPeriod({ effectiveDate, user: actor, postingMode });

  const existingEntry = await findExistingEntry(tx, input);
  if (existingEntry?.status === 'EXPORTED') {
    throw new Error(`Journal entry ${existingEntry.id} is EXPORTED and cannot be changed`);
  }
  if (existingEntry?.status === 'POSTED' && postingMode !== 'REVERSAL') {
    throw new Error(`Journal entry ${existingEntry.id} is POSTED and cannot be replaced outside a reversal flow`);
  }

  const entryValues = {
    transactionType: input.transactionType,
    referenceType: input.referenceType,
    referenceId: input.referenceId ?? 0,
    referenceUuid: input.referenceUuid ?? null,
    effectiveDate,
    memo: input.memo ?? null,
    status,
    sourceSystem: input.sourceSystem ?? 'EPOCH',
    sourceDocumentType: input.sourceDocumentType ?? null,
    sourceDocumentNumber: input.sourceDocumentNumber ?? null,
    migrationBatchId: input.migrationBatchId ?? null,
    postingMode,
    postedAt: status === 'POSTED' ? new Date() : null,
    postedBy: status === 'POSTED' ? input.postedBy ?? actor?.username ?? null : null,
    reversalOfJournalEntryId: input.reversalOfJournalEntryId ?? null,
    createdBy: input.createdBy ?? actor?.username ?? null,
  };

  let journalEntryId: number;
  let created = false;
  if (existingEntry) {
    journalEntryId = existingEntry.id;
    await tx
      .update(journalEntries)
      .set({ ...entryValues, updatedAt: new Date() })
      .where(eq(journalEntries.id, existingEntry.id));
    await tx.delete(journalLines).where(eq(journalLines.journalEntryId, existingEntry.id));
  } else {
    const [entry] = await tx.insert(journalEntries).values(entryValues).returning();
    journalEntryId = entry.id;
    created = true;
  }

  const linesToInsert = [];
  for (const line of input.lines) {
    const account = await getRequiredAccountingAccount(tx, line.accountNumber, line.accountName);
    linesToInsert.push({
      journalEntryId,
      accountId: account.id,
      debitAmount: money(line.debitAmount),
      creditAmount: money(line.creditAmount),
      customerId: line.customerId ?? null,
      customerNameSnapshot: line.customerNameSnapshot ?? null,
      customerType: line.customerType ?? null,
      projectId: line.projectId ?? null,
      projectNameSnapshot: line.projectNameSnapshot ?? null,
      contractNumber: line.contractNumber ?? null,
      productionLine: line.productionLine ?? null,
      department: line.department ?? null,
      chargeCodeId: line.chargeCodeId ?? null,
      inventoryItemId: line.inventoryItemId ?? null,
      partNumber: line.partNumber ?? null,
      salespersonUserId: line.salespersonUserId ?? null,
      salespersonNameSnapshot: line.salespersonNameSnapshot ?? null,
      csrUserId: line.csrUserId ?? null,
      csrNameSnapshot: line.csrNameSnapshot ?? null,
      allowability: line.allowability ?? account.defaultAllowability ?? 'ALLOWABLE',
      directIndirect: line.directIndirect ?? account.defaultDirectIndirect ?? 'UNASSIGNED',
      costPool: line.costPool ?? account.costPool ?? null,
      dimensionTags: line.dimensionTags ?? {},
    });
  }

  await tx.insert(journalLines).values(linesToInsert);

  return {
    journalEntryId,
    totalDebits: totals.totalDebits,
    totalCredits: totals.totalCredits,
    lineCount: linesToInsert.length,
    created,
  };
}
