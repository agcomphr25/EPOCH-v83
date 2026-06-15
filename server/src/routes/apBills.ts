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
      bill_category TEXT NOT NULL DEFAULT 'OTHER',
      invoice_date DATE NOT NULL,
      due_date DATE,
      ship_date DATE,
      bol_number TEXT,
      customer_source TEXT NOT NULL DEFAULT 'GENERAL',
      customer_id TEXT,
      customer_name TEXT,
      customer_po_number TEXT,
      vendor_po_id INTEGER,
      vendor_po_number TEXT,
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
      source_type TEXT NOT NULL DEFAULT 'GENERAL',
      customer_source TEXT,
      customer_id TEXT,
      customer_name TEXT,
      customer_po_number TEXT,
      vendor_po_id INTEGER,
      vendor_po_number TEXT,
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
  const apBillColumns = [
    `ALTER TABLE ap_vendor_bills ADD COLUMN IF NOT EXISTS bill_category TEXT NOT NULL DEFAULT 'OTHER'`,
    `ALTER TABLE ap_vendor_bills ADD COLUMN IF NOT EXISTS customer_source TEXT NOT NULL DEFAULT 'GENERAL'`,
    `ALTER TABLE ap_vendor_bills ADD COLUMN IF NOT EXISTS customer_id TEXT`,
    `ALTER TABLE ap_vendor_bills ADD COLUMN IF NOT EXISTS vendor_po_id INTEGER`,
    `ALTER TABLE ap_vendor_bills ADD COLUMN IF NOT EXISTS vendor_po_number TEXT`,
  ];
  for (const statement of apBillColumns) await pgPool.query(statement);
  const allocationColumns = [
    `ALTER TABLE ap_vendor_bill_allocations ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'GENERAL'`,
    `ALTER TABLE ap_vendor_bill_allocations ADD COLUMN IF NOT EXISTS customer_source TEXT`,
    `ALTER TABLE ap_vendor_bill_allocations ADD COLUMN IF NOT EXISTS customer_id TEXT`,
    `ALTER TABLE ap_vendor_bill_allocations ADD COLUMN IF NOT EXISTS vendor_po_id INTEGER`,
    `ALTER TABLE ap_vendor_bill_allocations ADD COLUMN IF NOT EXISTS vendor_po_number TEXT`,
  ];
  for (const statement of allocationColumns) await pgPool.query(statement);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bills_status_idx ON ap_vendor_bills(status, invoice_date DESC)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bills_customer_po_idx ON ap_vendor_bills(customer_po_number)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bills_vendor_po_idx ON ap_vendor_bills(vendor_po_id, vendor_po_number)`);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS ap_vendor_bill_allocations_bill_idx ON ap_vendor_bill_allocations(bill_id)`);

  const accountSeeds = [
    ['54500', 'Direct Customer Freight Expense', 'Outbound customer freight and shipping costs traceable to a customer PO, project, lot, or invoice'],
    ['54000', 'Direct Materials Expense', 'Direct material costs traceable to a customer PO, project, vendor PO, or work order'],
    ['62000', 'Shop Supplies Expense', 'Shop supplies and indirect consumables approved through AP vendor bills'],
    ['70000', 'General Administrative Expense', 'General administrative vendor bill costs'],
    ['80000', 'Other Expense', 'Other vendor bill expenses requiring review'],
  ];
  for (const [accountNumber, accountName, description] of accountSeeds) {
    await pgPool.query(`
      INSERT INTO chart_of_accounts (
        account_number, account_name, account_type, normal_balance, financial_statement_section,
        cost_pool, default_allowability, default_direct_indirect, billing_treatment,
        requires_documentation, requires_review, system_controlled, is_active, description
      )
      SELECT $1, $2, 'EXPENSE', 'DEBIT', 'Cost of Goods Sold',
        'DIRECT', 'ALLOWABLE', 'DIRECT', 'BILLABLE',
        TRUE, FALSE, FALSE, TRUE, $3
      WHERE NOT EXISTS (
        SELECT 1
        FROM chart_of_accounts
        WHERE account_number = $1 OR account_name = $2
      )
    `, [accountNumber, accountName, description]);
  }
}

const lineTypeSchema = z.enum(['MATERIAL', 'FREIGHT', 'INSURANCE', 'OUTSIDE_SERVICE', 'TOOLING', 'SUPPLIES', 'TAX', 'OTHER']);
const sourceSchema = z.enum(['P1', 'P2', 'GENERAL']);

const billInputSchema = z.object({
  vendorName: z.string().trim().min(1),
  vendorInvoiceNumber: z.string().trim().min(1),
  billCategory: lineTypeSchema.default('OTHER').optional(),
  invoiceDate: z.string().trim().min(1),
  dueDate: z.string().trim().nullable().optional(),
  shipDate: z.string().trim().nullable().optional(),
  bolNumber: z.string().trim().nullable().optional(),
  customerSource: sourceSchema.default('GENERAL').optional(),
  customerId: z.union([z.string(), z.number()]).nullable().optional(),
  customerName: z.string().trim().nullable().optional(),
  customerPoNumber: z.string().trim().nullable().optional(),
  vendorPoId: z.union([z.string(), z.number()]).nullable().optional(),
  vendorPoNumber: z.string().trim().nullable().optional(),
  projectId: z.string().trim().nullable().optional(),
  recoveryArInvoiceId: z.string().uuid().nullable().optional(),
  recoveryAmount: z.union([z.string(), z.number()]).optional(),
  allocationMethod: z.string().trim().optional(),
  notes: z.string().trim().nullable().optional(),
  lines: z.array(z.object({
    lineType: lineTypeSchema.default('OTHER'),
    description: z.string().trim().min(1),
    amount: z.union([z.string(), z.number()]),
    glAccountNumber: z.string().trim().default('54500').optional(),
  })).min(1),
  allocations: z.array(z.object({
    sourceType: sourceSchema.default('GENERAL').optional(),
    customerSource: sourceSchema.optional(),
    customerId: z.union([z.string(), z.number()]).nullable().optional(),
    vendorPoId: z.union([z.string(), z.number()]).nullable().optional(),
    vendorPoNumber: z.string().trim().nullable().optional(),
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

function nullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function nullableInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
      b.bill_category AS "billCategory",
      b.customer_po_number AS "poNumber",
      b.vendor_po_number AS "vendorPoNumber",
      b.customer_source AS "customerSource",
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

router.get('/customers', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const source = typeof req.query.source === 'string' ? req.query.source.toUpperCase() : 'ALL';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const like = `%${search}%`;
  const includeP1 = source === 'ALL' || source === 'P1' || source === 'GENERAL';
  const includeP2 = source === 'ALL' || source === 'P2' || source === 'GENERAL';
  const queries: Array<Promise<{ rows: any[] }>> = [];

  if (includeP1) {
    queries.push(pgPool.query(`
      SELECT
        'P1' AS source,
        id::text AS id,
        COALESCE(NULLIF(name, ''), company, customer_key) AS name,
        customer_key AS "customerKey",
        email,
        is_active AS "isActive"
      FROM customers
      WHERE ($1 = '' OR name ILIKE $2 OR company ILIKE $2 OR customer_key ILIKE $2 OR email ILIKE $2)
        AND COALESCE(is_active, TRUE) = TRUE
      ORDER BY name
      LIMIT 50
    `, [search, like]));
  }

  if (includeP2) {
    queries.push(pgPool.query(`
      SELECT
        'P2' AS source,
        customer_id AS id,
        customer_name AS name,
        customer_id AS "customerKey",
        contact_email AS email,
        status = 'ACTIVE' AS "isActive"
      FROM p2_customers
      WHERE ($1 = '' OR customer_name ILIKE $2 OR customer_id ILIKE $2 OR contact_email ILIKE $2)
        AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
      ORDER BY customer_name
      LIMIT 50
    `, [search, like]));
    queries.push(pgPool.query(`
      SELECT DISTINCT ON (po.customer_id, po.customer_name)
        'P2' AS source,
        po.customer_id AS id,
        po.customer_name AS name,
        po.po_number AS "customerKey",
        NULL::text AS email,
        po.status <> 'CANCELED' AS "isActive"
      FROM p2_purchase_orders po
      WHERE ($1 = '' OR po.customer_name ILIKE $2 OR po.customer_id ILIKE $2 OR po.po_number ILIKE $2)
        AND COALESCE(po.status, 'OPEN') <> 'CANCELED'
      ORDER BY po.customer_id, po.customer_name, po.updated_at DESC NULLS LAST
      LIMIT 50
    `, [search, like]));
  }

  const results = await Promise.all(queries);
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const row of results.flatMap((result) => result.rows)) {
    const key = `${row.source}:${row.id || row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  res.json(rows.slice(0, 100));
}));

router.get('/vendor-pos', requireAdminOrOwner, h(async (req, res) => {
  await ensureApBillTables();
  const vendorId = nullableInteger(req.query.vendorId);
  const vendorName = typeof req.query.vendorName === 'string' ? req.query.vendorName.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const { rows } = await pgPool.query(`
    SELECT
      po.id,
      po.po_number AS "poNumber",
      po.external_po_number AS "externalPoNumber",
      po.status,
      po.production_line AS "productionLine",
      po.order_date AS "orderDate",
      po.total_cost::float AS "totalCost",
      v.id AS "vendorId",
      v.name AS "vendorName"
    FROM vendor_pos po
    JOIN vendors v ON v.id = po.vendor_id
    WHERE ($1::int IS NULL OR po.vendor_id = $1::int)
      AND ($2 = '' OR v.name = $2)
      AND ($3 = '' OR po.po_number ILIKE $4 OR po.external_po_number ILIKE $4 OR v.name ILIKE $4)
      AND COALESCE(po.archived, FALSE) = FALSE
    ORDER BY po.order_date DESC NULLS LAST, po.id DESC
    LIMIT 100
  `, [vendorId, vendorName, search, `%${search}%`]);
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
  const customerId = nullableText(input.customerId);
  const vendorPoId = nullableInteger(input.vendorPoId);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO ap_vendor_bills (
        bill_number, vendor_name, vendor_invoice_number, bill_category, invoice_date, due_date, ship_date,
        bol_number, customer_source, customer_id, customer_name, customer_po_number,
        vendor_po_id, vendor_po_number, project_id, total_amount,
        recovery_ar_invoice_id, recovery_amount, allocation_method, notes, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *
    `, [
      billNumber(),
      input.vendorName,
      input.vendorInvoiceNumber,
      input.billCategory || 'OTHER',
      input.invoiceDate,
      input.dueDate || null,
      input.shipDate || null,
      input.bolNumber || null,
      input.customerSource || 'GENERAL',
      customerId,
      input.customerName || null,
      input.customerPoNumber || null,
      vendorPoId,
      input.vendorPoNumber || null,
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
          bill_id, source_type, customer_source, customer_id, customer_name, customer_po_number,
          vendor_po_id, vendor_po_number, project_id, lot_id, lot_number,
          ar_invoice_id, ar_invoice_number, recovery_ar_invoice_id, allocation_basis, allocated_amount, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [
        bill.id,
        allocation.sourceType || input.customerSource || 'GENERAL',
        allocation.customerSource || input.customerSource || 'GENERAL',
        nullableText(allocation.customerId) || customerId,
        input.customerName || null,
        input.customerPoNumber || null,
        nullableInteger(allocation.vendorPoId) || vendorPoId,
        allocation.vendorPoNumber || input.vendorPoNumber || null,
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
  const customerId = nullableText(input.customerId);
  const vendorPoId = nullableInteger(input.vendorPoId);
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
          bill_category = $4,
          invoice_date = $5,
          due_date = $6,
          ship_date = $7,
          bol_number = $8,
          customer_source = $9,
          customer_id = $10,
          customer_name = $11,
          customer_po_number = $12,
          vendor_po_id = $13,
          vendor_po_number = $14,
          project_id = $15,
          total_amount = $16,
          recovery_ar_invoice_id = $17,
          recovery_amount = $18,
          allocation_method = $19,
          notes = $20,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      req.params.id,
      input.vendorName,
      input.vendorInvoiceNumber,
      input.billCategory || 'OTHER',
      input.invoiceDate,
      input.dueDate || null,
      input.shipDate || null,
      input.bolNumber || null,
      input.customerSource || 'GENERAL',
      customerId,
      input.customerName || null,
      input.customerPoNumber || null,
      vendorPoId,
      input.vendorPoNumber || null,
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
          bill_id, source_type, customer_source, customer_id, customer_name, customer_po_number,
          vendor_po_id, vendor_po_number, project_id, lot_id, lot_number,
          ar_invoice_id, ar_invoice_number, recovery_ar_invoice_id, allocation_basis, allocated_amount, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [
        req.params.id,
        allocation.sourceType || input.customerSource || 'GENERAL',
        allocation.customerSource || input.customerSource || 'GENERAL',
        nullableText(allocation.customerId) || customerId,
        input.customerName || null,
        input.customerPoNumber || null,
        nullableInteger(allocation.vendorPoId) || vendorPoId,
        allocation.vendorPoNumber || input.vendorPoNumber || null,
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
    const productionLine = bill.customer_source === 'P1' || bill.customer_source === 'P2'
      ? bill.customer_source
      : 'GENERAL';

    for (const line of lineResult.rows) {
      const account = await getAccount(client, line.gl_account_number);
      await client.query(`
        INSERT INTO journal_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, project_id,
          production_line, customer_type, allowability, direct_indirect, cost_pool, dimension_tags
        )
        VALUES ($1,$2,$3,0,$4,$5,'COMMERCIAL','ALLOWABLE','DIRECT','DIRECT',$6::jsonb)
      `, [
        entryId,
        account.id,
        line.amount,
        bill.project_id,
        productionLine,
        JSON.stringify({
          source: 'ap_vendor_bill',
          billId: bill.id,
          billNumber: bill.bill_number,
          billCategory: bill.bill_category,
          vendorName: bill.vendor_name,
          vendorInvoiceNumber: bill.vendor_invoice_number,
          vendorPoId: bill.vendor_po_id,
          vendorPoNumber: bill.vendor_po_number,
          customerSource: bill.customer_source,
          customerId: bill.customer_id,
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
      VALUES ($1,$2,0,$3,$4,$5,'COMMERCIAL','ALLOWABLE','DIRECT','DIRECT',$6::jsonb)
    `, [
      entryId,
      apAccount.id,
      bill.total_amount,
      bill.project_id,
      productionLine,
      JSON.stringify({
        source: 'ap_vendor_bill',
        billId: bill.id,
        billNumber: bill.bill_number,
        billCategory: bill.bill_category,
        vendorName: bill.vendor_name,
        vendorInvoiceNumber: bill.vendor_invoice_number,
        vendorPoId: bill.vendor_po_id,
        vendorPoNumber: bill.vendor_po_number,
        customerSource: bill.customer_source,
        customerId: bill.customer_id,
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
