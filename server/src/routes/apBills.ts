import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { pgPool } from '../../db';
import { requireAdminOrOwner } from '../../middleware/auth';
import { assertPostingAllowedForPeriod } from '../services/accountingPeriodService';

const router = Router();
const uploadDir = path.join(process.cwd(), 'uploads', 'ap-bills');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF and image attachments are allowed.'));
  },
});

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error('[apBills]', err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? 'Internal server error' });
  });
}

function actorName(req: Request) {
  const user = (req as any).user;
  return user?.username ?? user?.displayName ?? user?.email ?? 'unknown';
}

function toMoney(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

async function ensureApBillTables() {
  await pgPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ap_vendor_bills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_number TEXT NOT NULL UNIQUE,
      vendor_name TEXT NOT NULL,
      vendor_invoice_number TEXT NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE,
      ship_date DATE,
      bol_number TEXT,
      customer_name TEXT,
      customer_po_number TEXT,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      recovery_ar_invoice_id UUID,
      recovery_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      allocation_method TEXT NOT NULL DEFAULT 'MANUAL',
      notes TEXT,
      created_by TEXT,
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      posted_by TEXT,
      posted_at TIMESTAMPTZ,
      posted_journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (vendor_name, vendor_invoice_number)
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ap_vendor_bill_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES ap_vendor_bills(id) ON DELETE CASCADE,
      line_type TEXT NOT NULL DEFAULT 'OTHER',
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      gl_account_number TEXT NOT NULL DEFAULT '54500',
      gl_account_name_snapshot TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ap_vendor_bill_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES ap_vendor_bills(id) ON DELETE CASCADE,
      line_id UUID REFERENCES ap_vendor_bill_lines(id) ON DELETE CASCADE,
      customer_name TEXT,
      customer_po_number TEXT,
      project_id TEXT,
      lot_id UUID,
      lot_number TEXT,
      ar_invoice_id UUID,
      ar_invoice_number TEXT,
      recovery_ar_invoice_id UUID,
      allocation_basis TEXT NOT NULL DEFAULT 'MANUAL',
      allocated_amount NUMERIC(12,2) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ap_vendor_bill_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES ap_vendor_bills(id) ON DELETE CASCADE,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bills_status_idx ON ap_vendor_bills(status, invoice_date DESC)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bills_customer_po_idx ON ap_vendor_bills(customer_po_number)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bill_allocations_bill_idx ON ap_vendor_bill_allocations(bill_id)`);

  await pgPool.query(`
    INSERT INTO chart_of_accounts (
      account_number, account_name, account_type, normal_balance, financial_statement_section,
      cost_pool, default_allowability, default_direct_indirect, billing_treatment,
      requires_documentation, requires_review, system_controlled, is_active, description
    )
    VALUES (
      '54500', 'Direct Customer Freight Expense', 'EXPENSE', 'DEBIT', 'Cost of Goods Sold',
      'DIRECT', 'ALLOWABLE', 'DIRECT', 'BILLABLE',
      TRUE, FALSE, FALSE, TRUE, 'Outbound customer freight and shipping costs traceable to a customer PO, project, lot, or invoice'
    )
    ON CONFLICT (account_number) DO NOTHING
  `);
}

const billInputSchema = z.object({
  vendorName: z.string().trim().min(1),
  vendorInvoiceNumber: z.string().trim().min(1),
  invoiceDate: z.string().trim().min(1),
  dueDate: z.string().trim().nullable().optional(),
  shipDate: z.string().trim().nullable().optional(),
  bolNumber: z.string().trim().nullable().optional(),
  customerName: z.string().trim().nullable().optional(),
  customerPoNumber: z.string().trim().nullable().optional(),
  projectId: z.string().trim().nullable().optional(),
  recoveryArInvoiceId: z.string().uuid().nullable().optional(),
  recoveryAmount: z.union([z.string(), z.number()]).optional(),
  allocationMethod: z.string().trim().optional(),
  notes: z.string().trim().nullable().optional(),
  lines: z.array(z.object({
    lineType: z.enum(['FREIGHT', 'INSURANCE', 'OTHER']).default('OTHER'),
    description: z.string().trim().min(1),
    amount: z.union([z.string(), z.number()]),
    glAccountNumber: z.string().trim().default('54500').optional(),
  })).min(1),
  allocations: z.array(z.object({
    lotId: z.string().uuid().nullable().optional(),
    lotNumber: z.string().trim().nullable().optional(),
    arInvoiceId: z.string().uuid().nullable().optional(),
    arInvoiceNumber: z.string().trim().nullable().optional(),
    allocatedAmount: z.union([z.string(), z.number()]),
    allocationBasis: z.string().trim().default('MANUAL').optional(),
    notes: z.string().trim().nullable().optional(),
  })).optional(),
});

function billNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `APB-${stamp}-${suffix}`;
}

async function getAccount(client: any, accountNumber: string) {
  const { rows } = await client.query(
    `SELECT id, account_number, account_name FROM chart_of_accounts WHERE account_number = $1 LIMIT 1`,
    [accountNumber],
  );
  if (!rows[0]) throw new Error(`Chart-of-accounts entry ${accountNumber} was not found`);
  return rows[0];
}

router.get('/', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const from = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = typeof req.query.dateTo === 'string' ? req.query.dateTo : new Date().toISOString().slice(0, 10);
  const { rows } = await pgPool.query(`
    SELECT
      b.id,
      b.bill_number AS "billNumber",
      b.vendor_name AS "vendorName",
      b.vendor_invoice_number AS "vendorInvoiceNumber",
      b.customer_po_number AS "poNumber",
      b.customer_name AS "customerName",
      b.total_amount::float AS amount,
      b.invoice_date AS date,
      b.due_date AS "dueDate",
      b.status,
      b.posted_journal_entry_id AS "postedJournalEntryId",
      COUNT(DISTINCT a.id)::int AS "allocationCount",
      COUNT(DISTINCT att.id)::int AS "attachmentCount"
    FROM ap_vendor_bills b
    LEFT JOIN ap_vendor_bill_allocations a ON a.bill_id = b.id
    LEFT JOIN ap_vendor_bill_attachments att ON att.bill_id = b.id
    WHERE b.invoice_date BETWEEN $1::date AND $2::date
      AND b.status <> 'VOID'
    GROUP BY b.id
    ORDER BY b.invoice_date DESC, b.created_at DESC
  `, [from, to]);
  res.json(rows);
}));

router.get('/p2-context', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const poNumber = typeof req.query.poNumber === 'string' ? req.query.poNumber.trim() : '';
  if (!poNumber) {
    res.status(400).json({ error: 'poNumber is required' });
    return;
  }
  const { rows } = await pgPool.query(`
    SELECT
      l.id AS "lotId",
      l.lot_number AS "lotNumber",
      l.customer_name AS "customerName",
      l.po_number AS "poNumber",
      l.quantity,
      inv.id AS "arInvoiceId",
      inv.invoice_number AS "arInvoiceNumber",
      inv.status AS "arInvoiceStatus",
      inv.freight_amount::float AS "freightAmount",
      inv.total_amount::float AS "invoiceTotal"
    FROM p2_lot_numbers l
    LEFT JOIN LATERAL (
      SELECT id, invoice_number, status, freight_amount, total_amount
      FROM ar_invoices
      WHERE lot_id = l.id OR packing_slip_id = l.packing_slip_id
      ORDER BY created_at DESC
      LIMIT 1
    ) inv ON true
    WHERE l.po_number = $1
    ORDER BY l.shipped_at NULLS LAST, l.created_at
  `, [poNumber]);
  res.json(rows);
}));

router.get('/:id', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const billResult = await pgPool.query(`SELECT * FROM ap_vendor_bills WHERE id = $1`, [req.params.id]);
  const bill = billResult.rows[0];
  if (!bill || bill.status === 'VOID') {
    res.status(404).json({ error: 'AP bill not found' });
    return;
  }
  const [linesResult, allocationsResult, attachmentsResult] = await Promise.all([
    pgPool.query(`SELECT * FROM ap_vendor_bill_lines WHERE bill_id = $1 ORDER BY created_at, id`, [bill.id]),
    pgPool.query(`SELECT * FROM ap_vendor_bill_allocations WHERE bill_id = $1 ORDER BY created_at, id`, [bill.id]),
    pgPool.query(`
      SELECT id, original_file_name AS "originalFileName", mime_type AS "mimeType",
             file_size_bytes AS "fileSizeBytes", uploaded_at AS "uploadedAt"
      FROM ap_vendor_bill_attachments
      WHERE bill_id = $1
      ORDER BY uploaded_at DESC
    `, [bill.id]),
  ]);
  res.json({
    ...bill,
    lines: linesResult.rows,
    allocations: allocationsResult.rows,
    attachments: attachmentsResult.rows,
  });
}));

router.post('/', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const parsed = billInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid AP bill', details: parsed.error.flatten() });
    return;
  }
  const input = parsed.data;
  const createdBy = actorName(req);
  const total = input.lines.reduce((sum, line) => sum + Number(toMoney(line.amount)), 0);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO ap_vendor_bills (
        bill_number, vendor_name, vendor_invoice_number, invoice_date, due_date, ship_date,
        bol_number, customer_name, customer_po_number, project_id, total_amount,
        recovery_ar_invoice_id, recovery_amount, allocation_method, notes, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      billNumber(),
      input.vendorName,
      input.vendorInvoiceNumber,
      input.invoiceDate,
      input.dueDate || null,
      input.shipDate || null,
      input.bolNumber || null,
      input.customerName || null,
      input.customerPoNumber || null,
      input.projectId || null,
      toMoney(total),
      input.recoveryArInvoiceId || null,
      toMoney(input.recoveryAmount ?? 0),
      input.allocationMethod || 'MANUAL',
      input.notes || null,
      createdBy,
    ]);
    const bill = rows[0];

    const lineRows = [];
    for (const line of input.lines) {
      const account = await getAccount(client, line.glAccountNumber || '54500');
      const inserted = await client.query(`
        INSERT INTO ap_vendor_bill_lines (bill_id, line_type, description, amount, gl_account_number, gl_account_name_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [bill.id, line.lineType, line.description, toMoney(line.amount), account.account_number, account.account_name]);
      lineRows.push(inserted.rows[0]);
    }

    const allocations: Array<any> = input.allocations?.length
      ? input.allocations
      : [{ allocatedAmount: total, allocationBasis: input.allocationMethod || 'MANUAL' }];
    for (const allocation of allocations) {
      await client.query(`
        INSERT INTO ap_vendor_bill_allocations (
          bill_id, customer_name, customer_po_number, project_id, lot_id, lot_number,
          ar_invoice_id, ar_invoice_number, recovery_ar_invoice_id, allocation_basis, allocated_amount, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        bill.id,
        input.customerName || null,
        input.customerPoNumber || null,
        input.projectId || null,
        allocation.lotId || null,
        allocation.lotNumber || null,
        allocation.arInvoiceId || null,
        allocation.arInvoiceNumber || null,
        input.recoveryArInvoiceId || null,
        allocation.allocationBasis || input.allocationMethod || 'MANUAL',
        toMoney(allocation.allocatedAmount),
        allocation.notes || null,
      ]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...bill, lines: lineRows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/:id', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const parsed = billInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid AP bill', details: parsed.error.flatten() });
    return;
  }
  const input = parsed.data;
  const total = input.lines.reduce((sum, line) => sum + Number(toMoney(line.amount)), 0);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`SELECT * FROM ap_vendor_bills WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const current = currentResult.rows[0];
    if (!current || current.status === 'VOID') {
      res.status(404).json({ error: 'AP bill not found' });
      await client.query('ROLLBACK');
      return;
    }
    if (current.posted_journal_entry_id) {
      res.status(409).json({ error: 'Posted AP bills cannot be edited. Void/reverse support will be added separately.' });
      await client.query('ROLLBACK');
      return;
    }

    const updatedResult = await client.query(`
      UPDATE ap_vendor_bills
      SET vendor_name = $2,
          vendor_invoice_number = $3,
          invoice_date = $4,
          due_date = $5,
          ship_date = $6,
          bol_number = $7,
          customer_name = $8,
          customer_po_number = $9,
          project_id = $10,
          total_amount = $11,
          recovery_ar_invoice_id = $12,
          recovery_amount = $13,
          allocation_method = $14,
          notes = $15,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      req.params.id,
      input.vendorName,
      input.vendorInvoiceNumber,
      input.invoiceDate,
      input.dueDate || null,
      input.shipDate || null,
      input.bolNumber || null,
      input.customerName || null,
      input.customerPoNumber || null,
      input.projectId || null,
      toMoney(total),
      input.recoveryArInvoiceId || null,
      toMoney(input.recoveryAmount ?? 0),
      input.allocationMethod || 'MANUAL',
      input.notes || null,
    ]);

    await client.query(`DELETE FROM ap_vendor_bill_allocations WHERE bill_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM ap_vendor_bill_lines WHERE bill_id = $1`, [req.params.id]);

    const lineRows = [];
    for (const line of input.lines) {
      const account = await getAccount(client, line.glAccountNumber || '54500');
      const inserted = await client.query(`
        INSERT INTO ap_vendor_bill_lines (bill_id, line_type, description, amount, gl_account_number, gl_account_name_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `, [req.params.id, line.lineType, line.description, toMoney(line.amount), account.account_number, account.account_name]);
      lineRows.push(inserted.rows[0]);
    }

    const allocations: Array<any> = input.allocations?.length
      ? input.allocations
      : [{ allocatedAmount: total, allocationBasis: input.allocationMethod || 'MANUAL' }];
    for (const allocation of allocations) {
      await client.query(`
        INSERT INTO ap_vendor_bill_allocations (
          bill_id, customer_name, customer_po_number, project_id, lot_id, lot_number,
          ar_invoice_id, ar_invoice_number, recovery_ar_invoice_id, allocation_basis, allocated_amount, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        req.params.id,
        input.customerName || null,
        input.customerPoNumber || null,
        input.projectId || null,
        allocation.lotId || null,
        allocation.lotNumber || null,
        allocation.arInvoiceId || null,
        allocation.arInvoiceNumber || null,
        input.recoveryArInvoiceId || null,
        allocation.allocationBasis || input.allocationMethod || 'MANUAL',
        toMoney(allocation.allocatedAmount),
        allocation.notes || null,
      ]);
    }
    await client.query('COMMIT');
    res.json({ ...updatedResult.rows[0], lines: lineRows });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/:id', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(`SELECT * FROM ap_vendor_bills WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const current = currentResult.rows[0];
    if (!current || current.status === 'VOID') {
      res.status(404).json({ error: 'AP bill not found' });
      await client.query('ROLLBACK');
      return;
    }
    if (current.posted_journal_entry_id) {
      res.status(409).json({ error: 'Posted AP bills cannot be deleted. Void/reverse support will be added separately.' });
      await client.query('ROLLBACK');
      return;
    }
    await client.query(`
      UPDATE ap_vendor_bills
      SET status = 'VOID', updated_at = NOW(), notes = CONCAT(COALESCE(notes, ''), CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n' END, 'Voided by ', $2, ' on ', NOW()::date)
      WHERE id = $1
    `, [req.params.id, actorName(req)]);
    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.post('/:id/attachments', requireAdminOrOwner, upload.array('files', 5), h(async (req, res) => {
  await ensureApBillTables();
  const files = (req.files || []) as Express.Multer.File[];
  const actor = actorName(req);
  const saved = [];
  for (const file of files) {
    const { rows } = await pgPool.query(`
      INSERT INTO ap_vendor_bill_attachments (
        bill_id, original_file_name, stored_file_name, mime_type, file_size_bytes, file_path, uploaded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, original_file_name AS "originalFileName", uploaded_at AS "uploadedAt"
    `, [req.params.id, file.originalname, file.filename, file.mimetype, file.size, file.path, actor]);
    saved.push(rows[0]);
  }
  res.status(201).json(saved);
}));

router.post('/:id/approve-post', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const postedBy = actorName(req);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const billResult = await client.query(`SELECT * FROM ap_vendor_bills WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const bill = billResult.rows[0];
    if (!bill) {
      res.status(404).json({ error: 'AP bill not found' });
      await client.query('ROLLBACK');
      return;
    }
    if (bill.posted_journal_entry_id) {
      res.status(409).json({ error: 'AP bill is already posted' });
      await client.query('ROLLBACK');
      return;
    }
    await assertPostingAllowedForPeriod({
      effectiveDate: new Date(`${dateOnly(bill.invoice_date)}T00:00:00`),
      user: { username: postedBy },
      postingMode: 'STANDARD',
    });

    const apAccount = await getAccount(client, '20100');
    const lineResult = await client.query(`SELECT * FROM ap_vendor_bill_lines WHERE bill_id = $1 ORDER BY created_at, id`, [bill.id]);
    if (lineResult.rows.length === 0) throw new Error('AP bill has no lines to post');

    const entryResult = await client.query(`
      INSERT INTO journal_entries (
        transaction_type, reference_type, reference_uuid, reference_id, effective_date, status,
        memo, source_system, source_document_type, source_document_number, posting_mode,
        posted_at, posted_by, created_by
      )
      VALUES ('AP_VENDOR_BILL', 'ap_vendor_bill', $1, 0, $2, 'POSTED', $3, 'EPOCH',
        'AP_VENDOR_BILL', $4, 'STANDARD', NOW(), $5, $5)
      RETURNING id
    `, [
      bill.id,
      bill.invoice_date,
      `AP bill ${bill.vendor_invoice_number} from ${bill.vendor_name}`,
      bill.vendor_invoice_number,
      postedBy,
    ]);
    const entryId = entryResult.rows[0].id;

    for (const line of lineResult.rows) {
      const account = await getAccount(client, line.gl_account_number);
      await client.query(`
        INSERT INTO journal_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, project_id,
          production_line, customer_type, allowability, direct_indirect, cost_pool, dimension_tags
        )
        VALUES ($1,$2,$3,0,$4,'P2','COMMERCIAL','ALLOWABLE','DIRECT','DIRECT',$5::jsonb)
      `, [
        entryId,
        account.id,
        line.amount,
        bill.project_id,
        JSON.stringify({
          source: 'ap_vendor_bill',
          billId: bill.id,
          billNumber: bill.bill_number,
          vendorName: bill.vendor_name,
          vendorInvoiceNumber: bill.vendor_invoice_number,
          customerName: bill.customer_name,
          customerPoNumber: bill.customer_po_number,
          bolNumber: bill.bol_number,
          lineType: line.line_type,
          recoveryArInvoiceId: bill.recovery_ar_invoice_id,
        }),
      ]);
    }
    await client.query(`
      INSERT INTO journal_lines (
        journal_entry_id, account_id, debit_amount, credit_amount, project_id,
        production_line, customer_type, allowability, direct_indirect, cost_pool, dimension_tags
      )
      VALUES ($1,$2,0,$3,$4,'P2','COMMERCIAL','ALLOWABLE','DIRECT','DIRECT',$5::jsonb)
    `, [
      entryId,
      apAccount.id,
      bill.total_amount,
      bill.project_id,
      JSON.stringify({
        source: 'ap_vendor_bill',
        billId: bill.id,
        billNumber: bill.bill_number,
        vendorName: bill.vendor_name,
        vendorInvoiceNumber: bill.vendor_invoice_number,
        customerName: bill.customer_name,
        customerPoNumber: bill.customer_po_number,
      }),
    ]);

    await client.query(`
      UPDATE ap_vendor_bills
      SET status = 'POSTED',
          approved_by = COALESCE(approved_by, $2),
          approved_at = COALESCE(approved_at, NOW()),
          posted_by = $2,
          posted_at = NOW(),
          posted_journal_entry_id = $3,
          updated_at = NOW()
      WHERE id = $1
    `, [bill.id, postedBy, entryId]);

    await client.query('COMMIT');
    res.json({ id: bill.id, status: 'POSTED', journalEntryId: entryId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
