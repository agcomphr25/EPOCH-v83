import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  accountingExpenseTransactions,
  chartOfAccounts,
} from '../../schema';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';
import { recordAuditEvent } from '../services/auditLedgerService';

const router = Router();

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error('[accountingControl]', err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
}

function actor(req: Request) {
  const user = (req as any).user;
  return {
    id: user?.id ?? null,
    username: user?.username ?? user?.displayName ?? 'unknown',
    role: user?.role ?? null,
  };
}

function transactionNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ACC-${stamp}-${suffix}`;
}

const transactionInputSchema = z.object({
  transactionType: z.enum(['EMPLOYEE_REIMBURSEMENT', 'PETTY_CASH', 'OWNER_EXPENSE']),
  transactionDate: z.string().min(1),
  direction: z.enum(['IN', 'OUT']).default('OUT'),
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CLOSED']).default('SUBMITTED').optional(),
  paidByType: z.enum(['EMPLOYEE', 'OWNER', 'PETTY_CASH', 'COMPANY']),
  paidByName: z.string().min(1),
  employeeId: z.number().int().nullable().optional(),
  employeeDisplayName: z.string().nullable().optional(),
  vendorName: z.string().min(1),
  amount: z.union([z.string(), z.number()]).transform(v => String(v)),
  paymentMethod: z.string().nullable().optional(),
  businessPurpose: z.string().min(1),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  contractNumber: z.string().nullable().optional(),
  costObjective: z.string().nullable().optional(),
  directIndirect: z.enum(['DIRECT', 'INDIRECT', 'UNASSIGNED']).default('DIRECT'),
  costCategory: z.string().min(1).default('MATERIALS'),
  reimbursementRequired: z.boolean().default(false),
  payrollReimbursement: z.boolean().default(false),
  payrollStatus: z.enum(['NOT_APPLICABLE', 'READY', 'EXPORTED', 'PAID', 'BLOCKED']).optional(),
  receiptStatus: z.enum(['MISSING', 'ATTACHED', 'EXCEPTION_APPROVED']).default('MISSING'),
  receiptUrl: z.string().nullable().optional(),
  glAccountId: z.number().int().nullable().optional(),
  glAccountNameSnapshot: z.string().nullable().optional(),
  glPostingStatus: z.enum(['PENDING_COA', 'READY', 'POSTED', 'HELD']).optional(),
  allowabilityStatus: z.enum(['PENDING_REVIEW', 'ALLOWABLE', 'UNALLOWABLE', 'NEEDS_REVIEW']).default('PENDING_REVIEW'),
  dcaaReviewStatus: z.enum(['NEEDS_REVIEW', 'COMPLETE', 'EXCEPTION']).default('NEEDS_REVIEW'),
  notes: z.string().nullable().optional(),
  submittedByUserId: z.number().int().nullable().optional(),
  submittedByDisplayName: z.string().min(1),
});

const updateFields = transactionInputSchema.partial().omit({
  submittedByDisplayName: true,
  submittedByUserId: true,
});

router.get('/summary', requireExecutiveAccess, h(async (_req, res) => {
  const rows = await db.select().from(accountingExpenseTransactions);

  const signedAmount = (row: typeof rows[number]) => {
    const amount = Number(row.amount ?? 0);
    return row.direction === 'IN' ? amount : -amount;
  };

  res.json({
    totalCount: rows.length,
    submittedCount: rows.filter(r => r.status === 'SUBMITTED').length,
    payrollReadyCount: rows.filter(r => r.payrollStatus === 'READY').length,
    glPendingCount: rows.filter(r => r.glPostingStatus === 'PENDING_COA' || r.glPostingStatus === 'HELD').length,
    dcaaNeedsReviewCount: rows.filter(r => r.dcaaReviewStatus !== 'COMPLETE').length,
    reimbursableTotal: rows
      .filter(r => r.reimbursementRequired && r.status !== 'REJECTED')
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    pettyCashBalanceImpact: rows
      .filter(r => r.transactionType === 'PETTY_CASH')
      .reduce((sum, r) => sum + signedAmount(r), 0),
    ownerExpenseTotal: rows
      .filter(r => r.transactionType === 'OWNER_EXPENSE' && r.status !== 'REJECTED')
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
  });
}));

router.get('/', requireExecutiveAccess, h(async (req, res) => {
  const { type, status, glStatus, dcaaStatus, payrollStatus, fromDate, toDate } = req.query;
  const conditions = [];

  if (type && type !== 'all') conditions.push(eq(accountingExpenseTransactions.transactionType, String(type)));
  if (status && status !== 'all') conditions.push(eq(accountingExpenseTransactions.status, String(status)));
  if (glStatus && glStatus !== 'all') conditions.push(eq(accountingExpenseTransactions.glPostingStatus, String(glStatus)));
  if (dcaaStatus && dcaaStatus !== 'all') conditions.push(eq(accountingExpenseTransactions.dcaaReviewStatus, String(dcaaStatus)));
  if (payrollStatus && payrollStatus !== 'all') conditions.push(eq(accountingExpenseTransactions.payrollStatus, String(payrollStatus)));
  if (fromDate) conditions.push(gte(accountingExpenseTransactions.transactionDate, String(fromDate)));
  if (toDate) conditions.push(lte(accountingExpenseTransactions.transactionDate, String(toDate)));

  const rows = await db
    .select({
      id: accountingExpenseTransactions.id,
      transactionNumber: accountingExpenseTransactions.transactionNumber,
      transactionType: accountingExpenseTransactions.transactionType,
      transactionDate: accountingExpenseTransactions.transactionDate,
      direction: accountingExpenseTransactions.direction,
      status: accountingExpenseTransactions.status,
      paidByType: accountingExpenseTransactions.paidByType,
      paidByName: accountingExpenseTransactions.paidByName,
      employeeId: accountingExpenseTransactions.employeeId,
      employeeDisplayName: accountingExpenseTransactions.employeeDisplayName,
      vendorName: accountingExpenseTransactions.vendorName,
      amount: accountingExpenseTransactions.amount,
      paymentMethod: accountingExpenseTransactions.paymentMethod,
      businessPurpose: accountingExpenseTransactions.businessPurpose,
      projectId: accountingExpenseTransactions.projectId,
      projectName: accountingExpenseTransactions.projectName,
      contractNumber: accountingExpenseTransactions.contractNumber,
      costObjective: accountingExpenseTransactions.costObjective,
      directIndirect: accountingExpenseTransactions.directIndirect,
      costCategory: accountingExpenseTransactions.costCategory,
      reimbursementRequired: accountingExpenseTransactions.reimbursementRequired,
      payrollReimbursement: accountingExpenseTransactions.payrollReimbursement,
      payrollStatus: accountingExpenseTransactions.payrollStatus,
      receiptStatus: accountingExpenseTransactions.receiptStatus,
      receiptUrl: accountingExpenseTransactions.receiptUrl,
      glAccountId: accountingExpenseTransactions.glAccountId,
      glAccountNameSnapshot: accountingExpenseTransactions.glAccountNameSnapshot,
      glAccountName: chartOfAccounts.accountName,
      glPostingStatus: accountingExpenseTransactions.glPostingStatus,
      allowabilityStatus: accountingExpenseTransactions.allowabilityStatus,
      dcaaReviewStatus: accountingExpenseTransactions.dcaaReviewStatus,
      notes: accountingExpenseTransactions.notes,
      submittedByDisplayName: accountingExpenseTransactions.submittedByDisplayName,
      submittedAt: accountingExpenseTransactions.submittedAt,
      approvedByDisplayName: accountingExpenseTransactions.approvedByDisplayName,
      approvedAt: accountingExpenseTransactions.approvedAt,
      reviewedByDisplayName: accountingExpenseTransactions.reviewedByDisplayName,
      reviewedAt: accountingExpenseTransactions.reviewedAt,
    })
    .from(accountingExpenseTransactions)
    .leftJoin(chartOfAccounts, eq(accountingExpenseTransactions.glAccountId, chartOfAccounts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accountingExpenseTransactions.transactionDate), desc(accountingExpenseTransactions.createdAt));

  res.json(rows);
}));

router.get('/accounts', requireExecutiveAccess, h(async (_req, res) => {
  const accounts = await db
    .select()
    .from(chartOfAccounts)
    .orderBy(chartOfAccounts.accountName);
  res.json(accounts);
}));

router.post('/', requireExecutiveAccess, h(async (req, res) => {
  const currentActor = actor(req);
  const parsed = transactionInputSchema.safeParse({
    ...req.body,
    submittedByUserId: currentActor.id,
    submittedByDisplayName: currentActor.username ?? 'unknown',
  });

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid accounting transaction', details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const glAccount = body.glAccountId
    ? (await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, body.glAccountId)).limit(1))[0]
    : null;

  const payrollStatus = body.payrollReimbursement
    ? (body.receiptStatus === 'MISSING' ? 'BLOCKED' : 'READY')
    : 'NOT_APPLICABLE';

  const [created] = await db.insert(accountingExpenseTransactions).values({
    ...body,
    transactionNumber: transactionNumber(),
    glAccountNameSnapshot: glAccount?.accountName ?? body.glAccountNameSnapshot ?? null,
    glPostingStatus: body.glAccountId ? 'READY' : 'PENDING_COA',
    payrollStatus,
  } as any).returning();

  await recordAuditEvent({
    eventType: 'ACCOUNTING_EXPENSE_CREATED',
    subjectType: 'accounting_expense_transaction',
    subjectId: created.id,
    sourceService: 'accountingControl.routes',
    actor: currentActor,
    payload: {
      transactionNumber: created.transactionNumber,
      transactionType: created.transactionType,
      amount: String(created.amount),
      reimbursementRequired: created.reimbursementRequired,
      payrollReimbursement: created.payrollReimbursement,
      glPostingStatus: created.glPostingStatus,
      dcaaReviewStatus: created.dcaaReviewStatus,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.status(201).json(created);
}));

router.patch('/:id', requireExecutiveAccess, h(async (req, res) => {
  const currentActor = actor(req);
  const parsed = updateFields.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid accounting transaction update', details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db
    .select()
    .from(accountingExpenseTransactions)
    .where(eq(accountingExpenseTransactions.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: 'Accounting transaction not found' });
    return;
  }

  const patch: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (parsed.data.glAccountId) {
    const [account] = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, parsed.data.glAccountId));
    patch.glAccountNameSnapshot = account?.accountName ?? null;
    patch.glPostingStatus = account ? 'READY' : existing.glPostingStatus;
  }

  if (parsed.data.status === 'APPROVED') {
    patch.approvedByUserId = currentActor.id;
    patch.approvedByDisplayName = currentActor.username;
    patch.approvedAt = new Date();
  }

  if (parsed.data.dcaaReviewStatus === 'COMPLETE' || parsed.data.dcaaReviewStatus === 'EXCEPTION') {
    patch.reviewedByUserId = currentActor.id;
    patch.reviewedByDisplayName = currentActor.username;
    patch.reviewedAt = new Date();
  }

  if (parsed.data.payrollReimbursement !== undefined || parsed.data.receiptStatus !== undefined) {
    const payrollReimbursement = parsed.data.payrollReimbursement ?? existing.payrollReimbursement;
    const receiptStatus = parsed.data.receiptStatus ?? existing.receiptStatus;
    patch.payrollStatus = payrollReimbursement
      ? (receiptStatus === 'MISSING' ? 'BLOCKED' : 'READY')
      : 'NOT_APPLICABLE';
  }

  const [updated] = await db
    .update(accountingExpenseTransactions)
    .set(patch as any)
    .where(eq(accountingExpenseTransactions.id, req.params.id))
    .returning();

  await recordAuditEvent({
    eventType: 'ACCOUNTING_EXPENSE_UPDATED',
    subjectType: 'accounting_expense_transaction',
    subjectId: updated.id,
    sourceService: 'accountingControl.routes',
    actor: currentActor,
    fieldsChanged: Object.fromEntries(
      Object.entries(patch)
        .filter(([key]) => key !== 'updatedAt')
        .map(([key, value]) => [key, { before: (existing as Record<string, unknown>)[key], after: value }]),
    ),
    payload: {
      transactionNumber: updated.transactionNumber,
      status: updated.status,
      payrollStatus: updated.payrollStatus,
      glPostingStatus: updated.glPostingStatus,
      dcaaReviewStatus: updated.dcaaReviewStatus,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.json(updated);
}));

router.get('/export.csv', requireExecutiveAccess, h(async (_req, res) => {
  const rows = await db.select().from(accountingExpenseTransactions).orderBy(desc(accountingExpenseTransactions.transactionDate));
  const headers = [
    'transactionNumber',
    'transactionType',
    'transactionDate',
    'direction',
    'status',
    'paidByType',
    'paidByName',
    'vendorName',
    'amount',
    'businessPurpose',
    'projectId',
    'contractNumber',
    'directIndirect',
    'costCategory',
    'reimbursementRequired',
    'payrollReimbursement',
    'payrollStatus',
    'receiptStatus',
    'glAccountNameSnapshot',
    'glPostingStatus',
    'allowabilityStatus',
    'dcaaReviewStatus',
  ];

  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map((key) => {
      const value = (row as Record<string, unknown>)[key];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="accounting-control-transactions.csv"');
  res.send(csv);
}));

export default router;
