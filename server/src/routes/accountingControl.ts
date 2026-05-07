import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, pgPool } from '../../db';
import {
  accountingExpenseTransactions,
  chartOfAccounts,
} from '../../schema';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';
import { recordAuditEvent } from '../services/auditLedgerService';

const router = Router();
const accountingUploadDir = path.join(process.cwd(), 'uploads', 'accounting-control');

type UploadedFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
};

if (!fs.existsSync(accountingUploadDir)) {
  fs.mkdirSync(accountingUploadDir, { recursive: true });
}

const accountingAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, accountingUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80);
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files and camera/image uploads are allowed.'));
  },
});

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

async function ensureAttachmentTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS accounting_expense_transaction_attachments (
      id SERIAL PRIMARY KEY,
      transaction_id UUID NOT NULL REFERENCES accounting_expense_transactions(id) ON DELETE CASCADE,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS acct_expense_attachments_transaction_idx
      ON accounting_expense_transaction_attachments(transaction_id, uploaded_at DESC)
  `);
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

const portalTransactionSchema = z.object({
  transactionType: z.enum(['EMPLOYEE_REIMBURSEMENT', 'OWNER_EXPENSE']).default('EMPLOYEE_REIMBURSEMENT'),
  transactionDate: z.string().min(1),
  paidByName: z.string().trim().min(1).optional(),
  vendorName: z.string().trim().min(1),
  amount: z.coerce.number().finite().nonnegative(),
  paymentMethod: z.string().trim().optional().nullable(),
  businessPurpose: z.string().trim().min(1),
  projectId: z.string().trim().optional().nullable(),
  projectName: z.string().trim().optional().nullable(),
  contractNumber: z.string().trim().optional().nullable(),
  costObjective: z.string().trim().optional().nullable(),
  directIndirect: z.enum(['DIRECT', 'INDIRECT', 'UNASSIGNED']).default('DIRECT'),
  costCategory: z.string().trim().min(1).default('MATERIALS'),
  notes: z.string().trim().optional().nullable(),
});

async function insertAttachments(
  transactionId: string,
  files: UploadedFile[],
  uploadedBy: number | null,
) {
  await ensureAttachmentTable();
  const inserted = [];
  for (const file of files) {
    const result = await pgPool.query(
      `
        INSERT INTO accounting_expense_transaction_attachments
          (transaction_id, original_file_name, stored_file_name, mime_type, file_size_bytes, file_path, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          transaction_id AS "transactionId",
          original_file_name AS "originalFileName",
          stored_file_name AS "storedFileName",
          mime_type AS "mimeType",
          file_size_bytes AS "fileSizeBytes",
          uploaded_at AS "uploadedAt"
      `,
      [transactionId, file.originalname, file.filename, file.mimetype, file.size, file.path, uploadedBy],
    );
    inserted.push(result.rows[0]);
  }

  if (inserted.length) {
    await db
      .update(accountingExpenseTransactions)
      .set({ receiptStatus: 'ATTACHED', updatedAt: new Date() } as any)
      .where(eq(accountingExpenseTransactions.id, transactionId));
  }

  return inserted;
}

router.post(
  '/portal',
  accountingAttachmentUpload.array('files', 10),
  h(async (req, res) => {
    await ensureAttachmentTable();
    const currentActor = actor(req);
    const role = String(currentActor.role ?? '').toUpperCase();
    const parsed = portalTransactionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reimbursement request', details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.transactionType === 'OWNER_EXPENSE' && role !== 'OWNER' && role !== 'ADMIN') {
      res.status(403).json({ error: 'Owner expense documentation is limited to owners and admins.' });
      return;
    }

    const userEmployee = currentActor.id
      ? await pgPool.query(
          `
            SELECT u.employee_id, COALESCE(e.name, u.username) AS display_name
            FROM users u
            LEFT JOIN employees e ON e.id = u.employee_id
            WHERE u.id = $1
            LIMIT 1
          `,
          [currentActor.id],
        )
      : null;
    const employeeId = userEmployee?.rows?.[0]?.employee_id ?? null;
    const displayName =
      parsed.data.paidByName ||
      userEmployee?.rows?.[0]?.display_name ||
      currentActor.username ||
      'unknown';

    const files = (req.files ?? []) as UploadedFile[];
    const receiptStatus = files.length ? 'ATTACHED' : 'MISSING';
    const transactionType = parsed.data.transactionType;
    const isEmployeeReimbursement = transactionType === 'EMPLOYEE_REIMBURSEMENT';

    const [created] = await db.insert(accountingExpenseTransactions).values({
      transactionNumber: transactionNumber(),
      transactionType,
      transactionDate: parsed.data.transactionDate,
      direction: 'OUT',
      status: 'SUBMITTED',
      paidByType: isEmployeeReimbursement ? 'EMPLOYEE' : 'OWNER',
      paidByName: displayName,
      employeeId: isEmployeeReimbursement ? employeeId : null,
      employeeDisplayName: isEmployeeReimbursement ? displayName : null,
      vendorName: parsed.data.vendorName,
      amount: String(parsed.data.amount),
      paymentMethod: parsed.data.paymentMethod ?? null,
      businessPurpose: parsed.data.businessPurpose,
      projectId: parsed.data.projectId ?? null,
      projectName: parsed.data.projectName ?? null,
      contractNumber: parsed.data.contractNumber ?? null,
      costObjective: parsed.data.costObjective ?? null,
      directIndirect: parsed.data.directIndirect,
      costCategory: parsed.data.costCategory,
      reimbursementRequired: isEmployeeReimbursement,
      payrollReimbursement: isEmployeeReimbursement,
      payrollStatus: isEmployeeReimbursement
        ? (receiptStatus === 'MISSING' ? 'BLOCKED' : 'READY')
        : 'NOT_APPLICABLE',
      receiptStatus,
      glPostingStatus: 'PENDING_COA',
      allowabilityStatus: 'PENDING_REVIEW',
      dcaaReviewStatus: 'NEEDS_REVIEW',
      notes: parsed.data.notes ?? null,
      submittedByUserId: currentActor.id,
      submittedByDisplayName: displayName,
    } as any).returning();

    const attachments = await insertAttachments(created.id, files, currentActor.id);

    await recordAuditEvent({
      eventType: 'ACCOUNTING_EXPENSE_PORTAL_SUBMITTED',
      subjectType: 'accounting_expense_transaction',
      subjectId: created.id,
      sourceService: 'accountingControl.routes',
      actor: currentActor,
      payload: {
        transactionNumber: created.transactionNumber,
        transactionType: created.transactionType,
        amount: String(created.amount),
        attachmentCount: attachments.length,
        receiptStatus,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    res.status(201).json({ ...created, attachmentCount: attachments.length });
  }),
);

router.get('/summary', requireExecutiveAccess, h(async (_req, res) => {
  await ensureAttachmentTable();
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
  await ensureAttachmentTable();
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
      attachmentCount: sql<number>`COALESCE(attachment_counts.count, 0)::int`,
    })
    .from(accountingExpenseTransactions)
    .leftJoin(chartOfAccounts, eq(accountingExpenseTransactions.glAccountId, chartOfAccounts.id))
    .leftJoin(
      sql`(
        SELECT transaction_id, COUNT(*) AS count
        FROM accounting_expense_transaction_attachments
        GROUP BY transaction_id
      ) attachment_counts`,
      sql`attachment_counts.transaction_id = accounting_expense_transactions.id`,
    )
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
  await ensureAttachmentTable();
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

router.get('/:id/attachments', requireExecutiveAccess, h(async (req, res) => {
  await ensureAttachmentTable();
  const result = await pgPool.query(
    `
      SELECT
        id,
        transaction_id AS "transactionId",
        original_file_name AS "originalFileName",
        stored_file_name AS "storedFileName",
        mime_type AS "mimeType",
        file_size_bytes AS "fileSizeBytes",
        uploaded_at AS "uploadedAt"
      FROM accounting_expense_transaction_attachments
      WHERE transaction_id = $1
      ORDER BY uploaded_at DESC
    `,
    [req.params.id],
  );
  res.json({ attachments: result.rows });
}));

router.get('/:id/attachments/:attachmentId/download', requireExecutiveAccess, h(async (req, res) => {
  await ensureAttachmentTable();
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    res.status(400).json({ error: 'Invalid attachment id' });
    return;
  }

  const result = await pgPool.query(
    `
      SELECT original_file_name, mime_type, file_path
      FROM accounting_expense_transaction_attachments
      WHERE id = $1 AND transaction_id = $2
    `,
    [attachmentId, req.params.id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const attachment = result.rows[0];
  const resolvedPath = path.resolve(attachment.file_path);
  if (!resolvedPath.startsWith(path.resolve(accountingUploadDir)) || !fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: 'Attachment file not found' });
    return;
  }

  res.setHeader('Content-Type', attachment.mime_type);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${String(attachment.original_file_name).replace(/"/g, '')}"`,
  );
  res.sendFile(resolvedPath);
}));

router.post(
  '/:id/attachments',
  requireExecutiveAccess,
  accountingAttachmentUpload.array('files', 10),
  h(async (req, res) => {
    await ensureAttachmentTable();
    const [existing] = await db
      .select()
      .from(accountingExpenseTransactions)
      .where(eq(accountingExpenseTransactions.id, req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Accounting transaction not found' });
      return;
    }

    const files = (req.files ?? []) as UploadedFile[];
    if (!files.length) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const attachments = await insertAttachments(req.params.id, files, actor(req).id);
    res.status(201).json({ attachments });
  }),
);

router.delete('/:id/attachments/:attachmentId', requireExecutiveAccess, h(async (req, res) => {
  await ensureAttachmentTable();
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    res.status(400).json({ error: 'Invalid attachment id' });
    return;
  }

  const result = await pgPool.query(
    `
      DELETE FROM accounting_expense_transaction_attachments
      WHERE id = $1 AND transaction_id = $2
      RETURNING file_path
    `,
    [attachmentId, req.params.id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const resolvedPath = path.resolve(result.rows[0].file_path);
  if (resolvedPath.startsWith(path.resolve(accountingUploadDir)) && fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }

  const remaining = await pgPool.query(
    'SELECT COUNT(*)::int AS count FROM accounting_expense_transaction_attachments WHERE transaction_id = $1',
    [req.params.id],
  );
  if (Number(remaining.rows[0]?.count ?? 0) === 0) {
    await db
      .update(accountingExpenseTransactions)
      .set({ receiptStatus: 'MISSING', updatedAt: new Date() } as any)
      .where(eq(accountingExpenseTransactions.id, req.params.id));
  }

  res.status(204).send();
}));

router.patch('/:id', requireExecutiveAccess, h(async (req, res) => {
  await ensureAttachmentTable();
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
