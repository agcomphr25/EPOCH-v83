import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { accountingPeriods, chartOfAccounts, journalEntries, journalLines } from '../../schema';
import { authenticateToken } from '../../middleware/auth';
import { requireAccountingAdmin } from '../middleware/requireAccountingAdmin';
import { recordAuditEvent } from '../services/auditLedgerService';

const router = Router();

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error('[chartOfAccounts]', err?.message ?? err);
    if (!res.headersSent) res.status(err?.statusCode ?? 500).json({ error: err?.message ?? 'Internal server error' });
  });
}

function actor(req: Request) {
  const user = (req as any).user;
  return {
    id: user?.id ?? null,
    username: user?.username ?? 'unknown',
    role: user?.role ?? null,
  };
}

const accountInputSchema = z.object({
  accountNumber: z.string().regex(/^\d{5}$/, 'Account number must be 5 digits'),
  accountName: z.string().trim().min(1),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE']),
  parentAccountId: z.number().int().nullable().optional(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  financialStatementSection: z.string().trim().min(1),
  costPool: z.enum(['NONE', 'DIRECT', 'FRINGE', 'OVERHEAD', 'G_AND_A', 'UNALLOWABLE', 'OTHER']).default('NONE'),
  defaultAllowability: z.enum(['ALLOWABLE', 'UNALLOWABLE', 'NEEDS_REVIEW']).default('ALLOWABLE'),
  defaultDirectIndirect: z.enum(['DIRECT', 'INDIRECT', 'UNASSIGNED']).default('UNASSIGNED'),
  billingTreatment: z.enum(['BILLABLE', 'NON_BILLABLE', 'PASS_THROUGH', 'NOT_BILLABLE']).default('NOT_BILLABLE'),
  requiresDocumentation: z.boolean().default(false),
  requiresReview: z.boolean().default(false),
  systemControlled: z.boolean().default(false),
  isActive: z.boolean().default(true),
  description: z.string().nullable().optional(),
});

const accountPatchSchema = accountInputSchema.partial().extend({
  changeReason: z.string().trim().min(1, 'A change reason is required for COA changes'),
});

const periodPatchSchema = z.object({
  status: z.enum(['OPEN', 'MIGRATION', 'SOFT_CLOSED', 'HARD_CLOSED', 'FINAL_LOCKED']),
  notes: z.string().nullable().optional(),
  reason: z.string().trim().min(1),
  paymentEntryGraceBusinessDays: z.number().int().min(0).max(10).optional(),
});

function extractOrderNumber(memo: string | null): string | null {
  if (!memo) return null;
  const orderMatch = memo.match(/\border\s+([A-Z]{1,4}\d{2,})\b/i);
  if (orderMatch?.[1]) return orderMatch[1].toUpperCase();
  const compactMatch = memo.match(/\b([A-Z]{1,4}\d{3,})\b/);
  return compactMatch?.[1]?.toUpperCase() ?? null;
}

function sourceLabel(source: {
  transactionType: string;
  referenceType: string;
  referenceId: number;
  sourceDocumentNumber: string | null;
  memo: string | null;
}) {
  const orderNumber = extractOrderNumber(source.memo);
  if (orderNumber) return `Order ${orderNumber}`;
  if (source.sourceDocumentNumber) {
    const prefix = source.transactionType === 'AR_INVOICE' ? 'Invoice' : 'Document';
    return `${prefix} ${source.sourceDocumentNumber}`;
  }
  const reference = source.referenceType.replace(/_/g, ' ');
  return `${reference} #${source.referenceId}`;
}

function sourceContributionAmount(
  normalBalance: string,
  debitAmount: string | number | null,
  creditAmount: string | number | null,
) {
  const debit = Number(debitAmount ?? 0);
  const credit = Number(creditAmount ?? 0);
  return normalBalance === 'DEBIT' ? debit - credit : credit - debit;
}

router.use(authenticateToken);

router.get('/accounts', h(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const activeOnly = req.query.activeOnly !== 'false';

  const rows = await db
    .select()
    .from(chartOfAccounts)
    .where(and(
      activeOnly ? eq(chartOfAccounts.isActive, true) : undefined,
      search
        ? or(
            ilike(chartOfAccounts.accountName, `%${search}%`),
            ilike(chartOfAccounts.accountNumber, `%${search}%`),
          )
        : undefined,
    ))
    .orderBy(asc(chartOfAccounts.accountNumber), asc(chartOfAccounts.accountName));

  res.json(rows);
}));

router.get('/accounts-with-balances', h(async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';

  // Get all accounts
  const accounts = await db
    .select()
    .from(chartOfAccounts)
    .where(activeOnly ? eq(chartOfAccounts.isActive, true) : undefined)
    .orderBy(asc(chartOfAccounts.accountNumber), asc(chartOfAccounts.accountName));

  // Get balance for each account by summing posted journal lines
  const accountsWithBalances = await Promise.all(
    accounts.map(async (account) => {
      const balanceResult = await db
        .select({
          totalDebit: sql<number>`COALESCE(SUM(CAST(${journalLines.debitAmount} AS DECIMAL)), 0)`,
          totalCredit: sql<number>`COALESCE(SUM(CAST(${journalLines.creditAmount} AS DECIMAL)), 0)`,
          postedLineCount: sql<number>`COUNT(${journalLines.id})`,
          postedEntryCount: sql<number>`COUNT(DISTINCT ${journalEntries.id})`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .where(and(
          eq(journalLines.accountId, account.id),
          eq(journalEntries.status, 'POSTED'),
        ));

      const sourceRows = await db
        .select({
          journalEntryId: journalEntries.id,
          transactionType: journalEntries.transactionType,
          referenceType: journalEntries.referenceType,
          referenceId: journalEntries.referenceId,
          sourceDocumentNumber: journalEntries.sourceDocumentNumber,
          effectiveDate: journalEntries.effectiveDate,
          postedAt: journalEntries.postedAt,
          memo: journalEntries.memo,
          debitAmount: journalLines.debitAmount,
          creditAmount: journalLines.creditAmount,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .where(and(
          eq(journalLines.accountId, account.id),
          eq(journalEntries.status, 'POSTED'),
        ))
        .orderBy(desc(journalEntries.effectiveDate), desc(journalEntries.id), desc(journalLines.id))
        .limit(250);

      const [balance] = balanceResult;
      const totalDebit = Number(balance?.totalDebit ?? 0);
      const totalCredit = Number(balance?.totalCredit ?? 0);
      const postedLineCount = Number(balance?.postedLineCount ?? 0);
      const postedEntryCount = Number(balance?.postedEntryCount ?? 0);

      // Calculate balance based on normal balance direction
      let currentBalance = 0;
      if (account.normalBalance === 'DEBIT') {
        currentBalance = totalDebit - totalCredit;
      } else {
        // CREDIT normal balance
        currentBalance = totalCredit - totalDebit;
      }

      const sourceGroups = new Map<string, {
        label: string;
        amount: number;
        debitAmount: number;
        creditAmount: number;
        lineCount: number;
        journalEntryIds: number[];
        transactionType: string;
        referenceType: string;
        referenceId: number;
        sourceDocumentNumber: string | null;
        effectiveDate: Date | string | null;
      }>();

      for (const row of sourceRows) {
        const label = sourceLabel(row);
        const key = label.startsWith('Order ')
          ? label
          : `${label}|${row.referenceType}|${row.referenceId}`;
        const debit = Number(row.debitAmount ?? 0);
        const credit = Number(row.creditAmount ?? 0);
        const amount = sourceContributionAmount(
          account.normalBalance,
          row.debitAmount,
          row.creditAmount
        );
        const existing = sourceGroups.get(key);
        if (existing) {
          existing.amount += amount;
          existing.debitAmount += debit;
          existing.creditAmount += credit;
          existing.lineCount += 1;
          if (!existing.journalEntryIds.includes(row.journalEntryId)) {
            existing.journalEntryIds.push(row.journalEntryId);
          }
          continue;
        }
        sourceGroups.set(key, {
          label,
          amount,
          debitAmount: debit,
          creditAmount: credit,
          lineCount: 1,
          journalEntryIds: [row.journalEntryId],
          transactionType: row.transactionType,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          sourceDocumentNumber: row.sourceDocumentNumber,
          effectiveDate: row.effectiveDate,
        });
      }

      return {
        ...account,
        currentBalance,
        balanceAudit: {
          totalDebit,
          totalCredit,
          postedLineCount,
          postedEntryCount,
          normalBalance: account.normalBalance,
          formula: account.normalBalance === 'DEBIT'
            ? 'totalDebit - totalCredit'
            : 'totalCredit - totalDebit',
          latestPostedActivity: sourceRows[0] ?? null,
          sources: Array.from(sourceGroups.values())
            .map((source) => ({
              ...source,
              amount: Math.round(source.amount * 100) / 100,
              debitAmount: Math.round(source.debitAmount * 100) / 100,
              creditAmount: Math.round(source.creditAmount * 100) / 100,
              journalEntryId: source.journalEntryIds[0],
            }))
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        },
      };
    })
  );

  res.json(accountsWithBalances);
}));

router.post('/accounts', requireAccountingAdmin, h(async (req, res) => {
  const parsed = accountInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid account data', details: parsed.error.flatten() });
    return;
  }

  const [created] = await db.insert(chartOfAccounts).values(parsed.data).returning();
  await recordAuditEvent({
    eventType: 'COA_ACCOUNT_CREATED',
    subjectType: 'chart_of_accounts',
    subjectId: String(created.id),
    sourceService: 'chartOfAccounts.routes',
    actor: actor(req),
    fieldsChanged: Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, { before: null, after: value }])),
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: created,
  });
  res.status(201).json(created);
}));

router.patch('/accounts/:id', requireAccountingAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid account id' });
    return;
  }

  const parsed = accountPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid account data', details: parsed.error.flatten() });
    return;
  }

  const { changeReason, ...patch } = parsed.data;
  const [existing] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const [updated] = await db
    .update(chartOfAccounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(chartOfAccounts.id, id))
    .returning();

  const fieldsChanged: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, after] of Object.entries(patch)) {
    const before = (existing as Record<string, unknown>)[key];
    if (before !== after) fieldsChanged[key] = { before, after };
  }

  await recordAuditEvent({
    eventType: 'COA_ACCOUNT_UPDATED',
    subjectType: 'chart_of_accounts',
    subjectId: String(id),
    sourceService: 'chartOfAccounts.routes',
    actor: actor(req),
    reason: changeReason,
    fieldsChanged,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: { id, fieldsChanged } as any,
  });

  res.json(updated);
}));

router.get('/periods', requireAccountingAdmin, h(async (_req, res) => {
  const rows = await db
    .select()
    .from(accountingPeriods)
    .orderBy(asc(accountingPeriods.periodYear), asc(accountingPeriods.periodMonth));
  res.json(rows);
}));

router.patch('/periods/:year/:month', requireAccountingAdmin, h(async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid accounting period' });
    return;
  }

  const parsed = periodPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid period data', details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.periodYear, year), eq(accountingPeriods.periodMonth, month)))
    .limit(1);

  const currentActor = actor(req);
  const values = {
    periodYear: year,
    periodMonth: month,
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
    paymentEntryGraceBusinessDays: parsed.data.paymentEntryGraceBusinessDays ?? existing?.paymentEntryGraceBusinessDays ?? 3,
    closedBy: ['SOFT_CLOSED', 'HARD_CLOSED', 'FINAL_LOCKED'].includes(parsed.data.status) ? currentActor.username : null,
    closedAt: ['SOFT_CLOSED', 'HARD_CLOSED', 'FINAL_LOCKED'].includes(parsed.data.status) ? new Date() : null,
    reopenedBy: parsed.data.status === 'OPEN' && existing && existing.status !== 'OPEN' ? currentActor.username : null,
    reopenedAt: parsed.data.status === 'OPEN' && existing && existing.status !== 'OPEN' ? new Date() : null,
    updatedAt: new Date(),
  };

  const [updated] = existing
    ? await db
        .update(accountingPeriods)
        .set(values)
        .where(eq(accountingPeriods.id, existing.id))
        .returning()
    : await db.insert(accountingPeriods).values(values).returning();

  await recordAuditEvent({
    eventType: 'ACCOUNTING_PERIOD_STATUS_CHANGED',
    subjectType: 'accounting_period',
    subjectId: `${year}-${String(month).padStart(2, '0')}`,
    sourceService: 'chartOfAccounts.routes',
    actor: currentActor,
    reason: parsed.data.reason,
    fieldsChanged: {
      status: { before: existing?.status ?? null, after: updated.status },
      notes: { before: existing?.notes ?? null, after: updated.notes },
      paymentEntryGraceBusinessDays: { before: existing?.paymentEntryGraceBusinessDays ?? null, after: updated.paymentEntryGraceBusinessDays },
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: updated,
  });

  res.json(updated);
}));

export default router;
