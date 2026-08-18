import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  arPaymentAllocations,
  mediaAttachments,
  mediaLibrary,
  customers,
  customerContacts,
  purchaseOrders,
  p2Customers,
  p2CustomerContacts,
  p2LotNumbers,
  p2PackingSlips,
  p2PurchaseOrders,
  journalEntries,
  journalLines,
} from '../../schema';
import { eq, desc, sql, and, ilike, or, inArray, isNull, not } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { generateArInvoicePdf } from '../../utils/pdf/arInvoicePdf';
import { sendEmailViaSendGrid } from '../../utils/sendgrid';
import { buildInvoicePreviewFromPackingSlip, createInvoiceFromPackingSlip } from '../services/invoiceFromPackingSlip';
import { assertPostingAllowedForPeriod } from '../services/accountingPeriodService';
import { getFileStorageProviderForObjectPath } from '../services/fileStorageProvider';
import { recordAuditEvent } from '../services/auditLedgerService';
import { buildRevenueDimensionTags } from '../services/productionLineAccounting';
import { postArInvoiceAccounting } from '../services/arInvoicePostingService';
import {
  applyP2ProjectDeposit,
  createP2MaterialDepositInvoice,
  getP2ProjectDepositWorkspace,
} from '../services/p2ProjectDepositService';
import { formatP2DocumentPoNumber } from '../utils/p2DocumentPoNumber';
import {
  recordP2InvoiceNumberAudit,
  syncP2InvoiceSequenceFromManualNumber,
} from '../services/p2InvoiceNumberService';

const LOCKED_STATUSES = ['POSTED', 'VOID', 'PAID'];

let arInvoicePostingSchemaReady: Promise<void> | null = null;

function ensureArInvoicePostingSchema(): Promise<void> {
  if (!arInvoicePostingSchemaReady) {
    arInvoicePostingSchemaReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS production_line_accounting_map (
        id SERIAL PRIMARY KEY,
        production_line TEXT NOT NULL UNIQUE,
        revenue_account_id INTEGER REFERENCES chart_of_accounts(id),
        revenue_account_number TEXT,
        revenue_account_name_snapshot TEXT,
        quickbooks_class TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).then(() => undefined);
  }

  return arInvoicePostingSchemaReady;
}

const REQUIRED_P2_INVOICE_COLUMNS = [
  'ar_invoices.discount_amount',
  'ar_invoices.freight_amount',
  'ar_invoices.retainage_percent',
  'ar_invoices.retainage_amount',
  'ar_invoices.customer_visible_notes',
  'ar_invoices.internal_notes',
  'ar_invoices.wad_id',
  'ar_invoices.sendgrid_message_id',
  'ar_invoices.sent_to',
  'ar_invoices.sent_cc',
  'ar_invoice_lines.po_item_id',
  'ar_invoice_lines.part_number',
];

const invoicePreviewLineSchema = z.object({
  poItemId: z.number().nullable().optional(),
  partNumber: z.string().nullable().optional(),
  description: z.string().trim().min(1, 'Line description is required'),
  qty: z.coerce.number().positive('Line quantity must be greater than zero'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
});

const invoicePreviewOverrideSchema = z.object({
  invoiceDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  poOverride: z.string().nullable().optional(),
  freightAmount: z.coerce.number().min(0).optional(),
  taxAmount: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  customerVisibleNotes: z.string().nullable().optional(),
  lines: z.array(invoicePreviewLineSchema).optional(),
});

async function getMissingP2InvoiceColumns(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'ar_invoices' AND column_name IN (
          'discount_amount',
          'freight_amount',
          'retainage_percent',
          'retainage_amount',
          'customer_visible_notes',
          'internal_notes',
          'wad_id',
          'sendgrid_message_id',
          'sent_to',
          'sent_cc'
        ))
        OR (table_name = 'ar_invoice_lines' AND column_name IN (
          'po_item_id',
          'part_number'
        ))
      )
  `);

  const rows = ((result as any).rows ?? result) as Array<{ table_name: string; column_name: string }>;
  const existing = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  return REQUIRED_P2_INVOICE_COLUMNS.filter((column) => !existing.has(column));
}

const router = Router();

router.use(authenticateToken);
router.use(requirePermission('finance.view'));

const invoiceSourceSql = () => sql<string>`
  CASE WHEN EXISTS (
    SELECT 1
    FROM ar_invoice_lines ail
    WHERE ail.invoice_id = ${arInvoices.id}
      AND (
        ail.dimension_tags->>'source' = 'p1_oem_packing_slip'
        OR UPPER(COALESCE(ail.production_line, '')) = 'P1'
      )
  )
    OR ${arInvoices.notes} ILIKE 'Auto-created from P1 OEM packing slip%'
    OR ${arInvoices.internalNotes} ILIKE 'Source: P1 OEM shipment%'
  THEN 'P1' ELSE 'P2' END
`;

const invoiceCustomerNameSql = () => sql<string | null>`
  COALESCE(
    CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN ${customers.name} ELSE ${p2Customers.customerName} END,
    ${purchaseOrders.customerName},
    ${p2Customers.customerName}
  )
`;

const invoicePoNumberSql = () => sql<string | null>`
  COALESCE(
    CASE WHEN (${invoiceSourceSql()}) = 'P1' THEN ${purchaseOrders.poNumber} ELSE ${p2PurchaseOrders.poNumber} END,
    ${arInvoices.poOverride},
    ${purchaseOrders.poNumber},
    ${p2PurchaseOrders.poNumber}
  )
`;

function normalizeInvoiceDocumentPo<T extends { invoiceSource?: string | null; poNumber?: string | null; poOverride?: string | null }>(
  invoice: T,
): T {
  if (invoice.invoiceSource === 'P1') return invoice;
  return {
    ...invoice,
    poNumber: formatP2DocumentPoNumber(invoice.poNumber),
    poOverride: formatP2DocumentPoNumber(invoice.poOverride) ?? invoice.poOverride,
  };
}

async function isP1PackingSlipInvoice(invoiceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: arInvoiceLines.id })
    .from(arInvoiceLines)
    .where(
      and(
        eq(arInvoiceLines.invoiceId, invoiceId),
        sql`${arInvoiceLines.dimensionTags}->>'source' = 'p1_oem_packing_slip'`,
      ),
    )
    .limit(1);

  return !!row;
}

router.get('/customer-pos', async (req: Request, res: Response) => {
  try {
    const { customerId, source } = req.query;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    if (String(source).toUpperCase() === 'P1') {
      const pos = await db
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          status: purchaseOrders.status,
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.customerId, String(customerId)))
        .orderBy(desc(purchaseOrders.createdAt));

      return res.json(pos);
    }

    const pos = await db
      .select({
        id: p2PurchaseOrders.id,
        poNumber: p2PurchaseOrders.poNumber,
        status: p2PurchaseOrders.status,
      })
      .from(p2PurchaseOrders)
      .where(eq(p2PurchaseOrders.customerId, String(customerId)))
      .orderBy(desc(p2PurchaseOrders.createdAt));

    res.json(pos);
  } catch (error) {
    console.error('Failed to fetch customer POs:', error);
    res.status(500).json({ error: 'Failed to fetch customer POs' });
  }
});

router.get('/aging', async (req: Request, res: Response) => {
  try {
    const agingResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN balance ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) <= 30 THEN balance ELSE 0 END), 0) AS days_1_30,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 30 AND (CURRENT_DATE - i.due_date) <= 60 THEN balance ELSE 0 END), 0) AS days_31_60,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 60 AND (CURRENT_DATE - i.due_date) <= 90 THEN balance ELSE 0 END), 0) AS days_61_90,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 90 THEN balance ELSE 0 END), 0) AS days_90_plus,
        COALESCE(SUM(balance), 0) AS total_ar
      FROM (
        SELECT
          inv.id,
          inv.due_date,
          inv.total_amount::numeric - COALESCE(
            (
              SELECT SUM(a.amount_applied::numeric)
              FROM ar_payment_allocations a
              JOIN ar_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = inv.id AND COALESCE(p.status, 'posted') = 'posted'
            ), 0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = inv.id AND status != 'cancelled'), 0
          ) AS balance
        FROM ar_invoices inv
        WHERE inv.status NOT IN ('PAID', 'VOID')
      ) i
      WHERE i.balance > 0
    `);

    const row = (agingResult as any).rows?.[0] || (agingResult as any)[0] || {};
    res.json({
      current: parseFloat(row.current || '0'),
      days_1_30: parseFloat(row.days_1_30 || '0'),
      days_31_60: parseFloat(row.days_31_60 || '0'),
      days_61_90: parseFloat(row.days_61_90 || '0'),
      days_90_plus: parseFloat(row.days_90_plus || '0'),
      total_ar: parseFloat(row.total_ar || '0'),
    });
  } catch (error) {
    console.error('Failed to fetch AR aging:', error);
    res.status(500).json({ error: 'Failed to fetch AR aging' });
  }
});

router.get('/aging/by-customer', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        i.customer_id,
        c.customer_name,
        COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN balance ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) <= 30 THEN balance ELSE 0 END), 0) AS days_1_30,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 30 AND (CURRENT_DATE - i.due_date) <= 60 THEN balance ELSE 0 END), 0) AS days_31_60,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 60 AND (CURRENT_DATE - i.due_date) <= 90 THEN balance ELSE 0 END), 0) AS days_61_90,
        COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 90 THEN balance ELSE 0 END), 0) AS days_90_plus,
        COALESCE(SUM(balance), 0) AS total
      FROM (
        SELECT
          inv.id,
          inv.customer_id,
          inv.due_date,
          inv.total_amount::numeric - COALESCE(
            (
              SELECT SUM(a.amount_applied::numeric)
              FROM ar_payment_allocations a
              JOIN ar_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = inv.id AND COALESCE(p.status, 'posted') = 'posted'
            ), 0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = inv.id AND status != 'cancelled'), 0
          ) AS balance
        FROM ar_invoices inv
        WHERE inv.status NOT IN ('PAID', 'VOID')
      ) i
      LEFT JOIN p2_customers c ON i.customer_id = c.customer_id
      WHERE i.balance > 0
      GROUP BY i.customer_id, c.customer_name
      ORDER BY total DESC
    `);

    const rows = result.rows || result || [];
    res.json((rows as any[]).map((r: any) => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      current: parseFloat(r.current || '0'),
      days_1_30: parseFloat(r.days_1_30 || '0'),
      days_31_60: parseFloat(r.days_31_60 || '0'),
      days_61_90: parseFloat(r.days_61_90 || '0'),
      days_90_plus: parseFloat(r.days_90_plus || '0'),
      total: parseFloat(r.total || '0'),
    })));
  } catch (error) {
    console.error('Failed to fetch AR aging by customer:', error);
    res.status(500).json({ error: 'Failed to fetch AR aging by customer' });
  }
});

router.get('/customer-summary/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS open_invoices,
        COALESCE(SUM(
          inv.total_amount::numeric - COALESCE(
            (
              SELECT SUM(a.amount_applied::numeric)
              FROM ar_payment_allocations a
              JOIN ar_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = inv.id AND COALESCE(p.status, 'posted') = 'posted'
            ), 0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = inv.id AND status != 'cancelled'), 0
          )
        ), 0) AS balance,
        MIN(inv.invoice_date) AS oldest_invoice_date
      FROM ar_invoices inv
      WHERE inv.customer_id = ${customerId}
        AND inv.status NOT IN ('PAID', 'VOID')
    `);

    const row = ((result as any).rows || result as any)?.[0] || {};
    res.json({
      openInvoices: parseInt(row.open_invoices || '0'),
      balance: parseFloat(row.balance || '0'),
      oldestInvoiceDate: row.oldest_invoice_date || null,
    });
  } catch (error) {
    console.error('Failed to fetch customer AR summary:', error);
    res.status(500).json({ error: 'Failed to fetch customer AR summary' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, customerId, search, packingSlipId } = req.query;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safePackingSlipId = packingSlipId && UUID_REGEX.test(String(packingSlipId)) ? String(packingSlipId) : null;

    const results = await db
      .select({
        id: arInvoices.id,
        customerId: arInvoices.customerId,
        customerName: invoiceCustomerNameSql(),
        invoiceNumber: arInvoices.invoiceNumber,
        invoiceDate: arInvoices.invoiceDate,
        dueDate: arInvoices.dueDate,
        totalAmount: arInvoices.totalAmount,
        subtotal: arInvoices.subtotal,
        taxAmount: arInvoices.taxAmount,
        status: arInvoices.status,
        terms: arInvoices.terms,
        poId: arInvoices.poId,
        poOverride: arInvoices.poOverride,
        poNumber: invoicePoNumberSql(),
        invoiceSource: invoiceSourceSql(),
        notes: arInvoices.notes,
        customerVisibleNotes: arInvoices.customerVisibleNotes,
        internalNotes: arInvoices.internalNotes,
        createdBy: arInvoices.createdBy,
        createdAt: arInvoices.createdAt,
        sentAt: arInvoices.sentAt,
        isDisputed: arInvoices.isDisputed,
        pricingMismatch: arInvoices.pricingMismatch,
        pricingAmbiguous: arInvoices.pricingAmbiguous,
        autoCreated: arInvoices.autoCreated,
        packingSlipId: arInvoices.packingSlipId,
        lotId: arInvoices.lotId,
        invoiceType: arInvoices.invoiceType,
        projectId: arInvoices.projectId,
        depositPurpose: arInvoices.depositPurpose,
        wadId: arInvoices.wadId,
        discountAmount: arInvoices.discountAmount,
        freightAmount: arInvoices.freightAmount,
        retainagePercent: arInvoices.retainagePercent,
        retainageAmount: arInvoices.retainageAmount,
        sentTo: arInvoices.sentTo,
        sentCc: arInvoices.sentCc,
        journalEntryId: sql<number | null>`(
          SELECT je.id
          FROM journal_entries je
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
          ORDER BY je.created_at DESC
          LIMIT 1
        )`,
        journalEntryStatus: sql<string | null>`(
          SELECT je.status
          FROM journal_entries je
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
          ORDER BY je.created_at DESC
          LIMIT 1
        )`,
        journalLineCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int
          FROM journal_entries je
          JOIN journal_lines jl ON jl.journal_entry_id = je.id
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
        ), 0)`,
        amountPaid: sql<string>`COALESCE(
          (
            SELECT SUM(a.amount_applied)
            FROM ar_payment_allocations a
            JOIN ar_payments p ON p.id = a.payment_id
            WHERE a.invoice_id = ${arInvoices.id}
              AND COALESCE(p.status, 'posted') = 'posted'
          ),
          0
        ) + COALESCE(
          (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
          0
        )`,
        depositApplied: sql<string>`COALESCE(
          (SELECT SUM(amount::numeric) FROM p2_deposit_applications WHERE final_invoice_id = ${arInvoices.id} AND status = 'POSTED'),
          0
        )`,
        balance: sql<string>`(
          ${arInvoices.totalAmount}::numeric - COALESCE(
            (
              SELECT SUM(a.amount_applied)
              FROM ar_payment_allocations a
              JOIN ar_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = ${arInvoices.id}
                AND COALESCE(p.status, 'posted') = 'posted'
            ),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM p2_deposit_applications WHERE final_invoice_id = ${arInvoices.id} AND status = 'POSTED'),
            0
          )
        )`,
      })
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
      .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
      .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
      .where(
        and(
          status && status !== 'all' ? eq(arInvoices.status, String(status)) : undefined,
          !status || status === 'all' ? not(eq(arInvoices.status, 'VOID')) : undefined,
          customerId ? eq(arInvoices.customerId, String(customerId)) : undefined,
          search ? ilike(arInvoices.invoiceNumber, `%${String(search)}%`) : undefined,
          safePackingSlipId ? eq(arInvoices.packingSlipId, safePackingSlipId) : undefined,
        )
      )
      .orderBy(desc(arInvoices.createdAt));

    res.json(results.map(normalizeInvoiceDocumentPo));
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

const DASHBOARD_INVOICE_SELECT = (invoices: typeof arInvoices, customers: typeof p2Customers, purchaseOrders?: typeof p2PurchaseOrders) => ({
  id: invoices.id,
  customerId: invoices.customerId,
  customerName: invoiceCustomerNameSql(),
  invoiceNumber: invoices.invoiceNumber,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  totalAmount: invoices.totalAmount,
  status: invoices.status,
  sentAt: invoices.sentAt,
  isDisputed: invoices.isDisputed,
  pricingMismatch: invoices.pricingMismatch,
  pricingAmbiguous: invoices.pricingAmbiguous,
  autoCreated: invoices.autoCreated,
  poId: invoices.poId,
  poOverride: invoices.poOverride,
  poNumber: invoicePoNumberSql(),
  invoiceSource: invoiceSourceSql(),
  balance: sql<string>`(
    ${invoices.totalAmount}::numeric - COALESCE(
      (
        SELECT SUM(a.amount_applied)
        FROM ar_payment_allocations a
        JOIN ar_payments p ON p.id = a.payment_id
        WHERE a.invoice_id = ${invoices.id}
          AND COALESCE(p.status, 'posted') = 'posted'
      ),
      0
    ) - COALESCE(
      (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${invoices.id} AND status != 'cancelled'),
      0
    )
  )`,
});

router.get('/summary-counts', async (_req: Request, res: Response) => {
  try {
    const [needsReviewRow, unsentRow, disputedRow] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM ar_invoices
        WHERE status <> 'VOID'
          AND (status IN ('DRAFT','REVIEW') OR pricing_mismatch = true OR pricing_ambiguous = true)
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM ar_invoices
        WHERE status = 'POSTED' AND sent_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM ar_invoices
        WHERE is_disputed = true AND status NOT IN ('VOID','PAID')
      `),
    ]);
    res.json({
      needsReview: parseInt(((needsReviewRow as any).rows?.[0] ?? (needsReviewRow as any)[0])?.count ?? '0'),
      unsent: parseInt(((unsentRow as any).rows?.[0] ?? (unsentRow as any)[0])?.count ?? '0'),
      disputed: parseInt(((disputedRow as any).rows?.[0] ?? (disputedRow as any)[0])?.count ?? '0'),
    });
  } catch (error) {
    console.error('Failed to fetch summary counts:', error);
    res.status(500).json({ error: 'Failed to fetch summary counts' });
  }
});

router.get('/needs-review', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers, p2PurchaseOrders))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
      .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
      .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
      .where(
        and(
          not(eq(arInvoices.status, 'VOID')),
          or(
            inArray(arInvoices.status, ['DRAFT', 'REVIEW']),
            eq(arInvoices.pricingMismatch, true),
            eq(arInvoices.pricingAmbiguous, true),
          ),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results.map(normalizeInvoiceDocumentPo));
  } catch (error) {
    console.error('Failed to fetch needs-review invoices:', error);
    res.status(500).json({ error: 'Failed to fetch needs-review invoices' });
  }
});

router.get('/unsent', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers, p2PurchaseOrders))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
      .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
      .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
      .where(
        and(
          eq(arInvoices.status, 'POSTED'),
          isNull(arInvoices.sentAt),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results.map(normalizeInvoiceDocumentPo));
  } catch (error) {
    console.error('Failed to fetch unsent invoices:', error);
    res.status(500).json({ error: 'Failed to fetch unsent invoices' });
  }
});

router.get('/disputed', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers, p2PurchaseOrders))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
      .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
      .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
      .where(
        and(
          eq(arInvoices.isDisputed, true),
          not(inArray(arInvoices.status, ['VOID', 'PAID'])),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results.map(normalizeInvoiceDocumentPo));
  } catch (error) {
    console.error('Failed to fetch disputed invoices:', error);
    res.status(500).json({ error: 'Failed to fetch disputed invoices' });
  }
});

async function getPackingSlipLotLink(packingSlipId: string) {
  const [slip] = await db
    .select({ id: p2PackingSlips.id, lotNumberId: p2PackingSlips.lotNumberId })
    .from(p2PackingSlips)
    .where(eq(p2PackingSlips.id, packingSlipId));

  if (!slip) return { error: 'Packing slip not found' as const, status: 404 as const };
  if (!slip.lotNumberId) return { error: 'Packing slip is not linked to a lot' as const, status: 422 as const };
  return { slip };
}

const materialDepositSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  terms: z.string().optional(),
  poReference: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  depositPurpose: z.string().min(1).optional(),
  customerVisibleNotes: z.string().nullable().optional(),
  pointOfContactName: z.string().trim().min(1).optional(),
  pointOfContactPhone: z.string().trim().min(1).optional(),
  pointOfContactEmail: z.string().trim().email().optional(),
  clinAllocations: z.array(z.object({
    clinId: z.coerce.number().int().positive(),
    customerClin: z.string().trim().max(100).nullable().optional(),
    amount: z.coerce.number().positive(),
    calculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE']),
    percentage: z.coerce.number().positive().max(100).nullable().optional(),
    contractLineValue: z.coerce.number().positive().nullable().optional(),
    description: z.string().trim().nullable().optional(),
  })).optional(),
  internalReason: z.string().min(3),
});

router.get('/project-deposits', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const projectId = z.string().uuid().parse(req.query.projectId);
    res.json(await getP2ProjectDepositWorkspace(projectId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project deposits';
    res.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
  }
});

router.post('/project-deposits', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const input = materialDepositSchema.parse(req.body);
    const invoice = await createP2MaterialDepositInvoice({
      ...input,
      createdBy: (req as any).user?.username || null,
    });
    await recordAuditEvent({
      eventType: 'P2_MATERIAL_DEPOSIT_INVOICE_CREATED',
      subjectType: 'ar_invoice',
      subjectId: invoice.id,
      sourceService: 'arInvoices.route',
      actor: { username: (req as any).user?.username || null },
      payload: { projectId: input.projectId, amount: input.amount, terms: input.terms, clinAllocations: input.clinAllocations || [], reason: input.internalReason },
      reason: input.internalReason,
    });
    res.status(201).json(invoice);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create material deposit invoice';
    res.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
  }
});

router.post('/project-deposits/:depositInvoiceId/apply', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const input = z.object({
      finalInvoiceId: z.string().uuid(),
      amount: z.coerce.number().positive(),
      reason: z.string().min(3),
    }).parse(req.body);
    const application = await applyP2ProjectDeposit({
      depositInvoiceId: req.params.depositInvoiceId,
      ...input,
      appliedBy: (req as any).user?.username || null,
    });
    await recordAuditEvent({
      eventType: 'P2_MATERIAL_DEPOSIT_APPLIED',
      subjectType: 'ar_invoice',
      subjectId: req.params.depositInvoiceId,
      sourceService: 'arInvoices.route',
      actor: { username: (req as any).user?.username || null },
      payload: { applicationId: application.id, ...input },
      reason: input.reason,
    });
    res.status(201).json(application);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply material deposit';
    res.status(error instanceof z.ZodError ? 400 : 409).json({ error: message });
  }
});

router.get('/from-packing-slip/:packingSlipId/preview', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const { packingSlipId } = req.params;
    const link = await getPackingSlipLotLink(packingSlipId);
    if ('error' in link) return res.status(link.status).json({ error: link.error });

    const missingColumns = await getMissingP2InvoiceColumns();
    if (missingColumns.length > 0) {
      return res.status(500).json({
        error: `Invoice database migration is not applied. Missing columns: ${missingColumns.join(', ')}`,
        missingColumns,
      });
    }

    const preview = await buildInvoicePreviewFromPackingSlip(packingSlipId, link.slip.lotNumberId);
    res.json(preview);
  } catch (error) {
    console.error('Failed to preview invoice from packing slip:', error);
    const message = error instanceof Error ? error.message : 'Failed to preview invoice from packing slip';
    res.status(500).json({ error: message });
  }
});

router.post('/from-packing-slip/:packingSlipId', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const { packingSlipId } = req.params;
    const link = await getPackingSlipLotLink(packingSlipId);
    if ('error' in link) return res.status(link.status).json({ error: link.error });

    const missingColumns = await getMissingP2InvoiceColumns();
    if (missingColumns.length > 0) {
      return res.status(500).json({
        error: `Invoice database migration is not applied. Missing columns: ${missingColumns.join(', ')}`,
        missingColumns,
      });
    }

    const overrides = invoicePreviewOverrideSchema.parse(req.body || {});
    const invoice = await createInvoiceFromPackingSlip(packingSlipId, link.slip.lotNumberId, overrides);

    res.status(invoice.existing ? 200 : 201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid invoice preview data', issues: error.errors });
    }
    console.error('Failed to create invoice from packing slip:', error);
    const message = error instanceof Error ? error.message : 'Failed to create invoice from packing slip';
    res.status(500).json({ error: message });
  }
});

router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const [invoice] = await db
      .select({ invoiceNumber: arInvoices.invoiceNumber })
      .from(arInvoices)
      .where(eq(arInvoices.id, req.params.id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const pdf = await generateArInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (error) {
    console.error('Failed to generate invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [invoice] = await db
      .select({
        id: arInvoices.id,
        customerId: arInvoices.customerId,
        customerName: invoiceCustomerNameSql(),
        invoiceNumber: arInvoices.invoiceNumber,
        invoiceDate: arInvoices.invoiceDate,
        dueDate: arInvoices.dueDate,
        terms: arInvoices.terms,
        poId: arInvoices.poId,
        poOverride: arInvoices.poOverride,
        poNumber: invoicePoNumberSql(),
        invoiceSource: invoiceSourceSql(),
        packingSlipId: arInvoices.packingSlipId,
        lotId: arInvoices.lotId,
        pricingMismatch: arInvoices.pricingMismatch,
        pricingAmbiguous: arInvoices.pricingAmbiguous,
        autoCreated: arInvoices.autoCreated,
        subtotal: arInvoices.subtotal,
        discountAmount: arInvoices.discountAmount,
        freightAmount: arInvoices.freightAmount,
        taxAmount: arInvoices.taxAmount,
        retainagePercent: arInvoices.retainagePercent,
        retainageAmount: arInvoices.retainageAmount,
        totalAmount: arInvoices.totalAmount,
        status: arInvoices.status,
        notes: arInvoices.notes,
        customerVisibleNotes: arInvoices.customerVisibleNotes,
        internalNotes: arInvoices.internalNotes,
        wadId: arInvoices.wadId,
        sentAt: arInvoices.sentAt,
        sentBy: arInvoices.sentBy,
        sentTo: arInvoices.sentTo,
        sentCc: arInvoices.sentCc,
        sendgridMessageId: arInvoices.sendgridMessageId,
        createdBy: arInvoices.createdBy,
        createdAt: arInvoices.createdAt,
        updatedAt: arInvoices.updatedAt,
        journalEntryId: sql<number | null>`(
          SELECT je.id
          FROM journal_entries je
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
          ORDER BY je.created_at DESC
          LIMIT 1
        )`,
        journalEntryStatus: sql<string | null>`(
          SELECT je.status
          FROM journal_entries je
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
          ORDER BY je.created_at DESC
          LIMIT 1
        )`,
        journalLineCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int
          FROM journal_entries je
          JOIN journal_lines jl ON jl.journal_entry_id = je.id
          WHERE je.reference_uuid = ${arInvoices.id}
            AND je.transaction_type = 'AR_INVOICE'
        ), 0)`,
        amountPaid: sql<string>`COALESCE(
          (
            SELECT SUM(a.amount_applied)
            FROM ar_payment_allocations a
            JOIN ar_payments p ON p.id = a.payment_id
            WHERE a.invoice_id = ${arInvoices.id}
              AND COALESCE(p.status, 'posted') = 'posted'
          ),
          0
        ) + COALESCE(
          (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
          0
        )`,
        depositApplied: sql<string>`COALESCE(
          (SELECT SUM(amount::numeric) FROM p2_deposit_applications WHERE final_invoice_id = ${arInvoices.id} AND status = 'POSTED'),
          0
        )`,
        balance: sql<string>`(
          ${arInvoices.totalAmount}::numeric - COALESCE(
            (
              SELECT SUM(a.amount_applied)
              FROM ar_payment_allocations a
              JOIN ar_payments p ON p.id = a.payment_id
              WHERE a.invoice_id = ${arInvoices.id}
                AND COALESCE(p.status, 'posted') = 'posted'
            ),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM p2_deposit_applications WHERE final_invoice_id = ${arInvoices.id} AND status = 'POSTED'),
            0
          )
        )`,
      })
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .leftJoin(p2PurchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${p2PurchaseOrders.id}`)
      .leftJoin(customers, sql`(CASE WHEN ${arInvoices.customerId} ~ '^[0-9]+$' THEN ${arInvoices.customerId}::integer END) = ${customers.id}`)
      .leftJoin(purchaseOrders, sql`(CASE WHEN ${arInvoices.poId} ~ '^[0-9]+$' THEN ${arInvoices.poId}::integer END) = ${purchaseOrders.id}`)
      .where(eq(arInvoices.id, id));

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const lines = await db
      .select()
      .from(arInvoiceLines)
      .where(eq(arInvoiceLines.invoiceId, id));

    const payments = await db
      .select({
        id: arPaymentAllocations.id,
        paymentId: arPaymentAllocations.paymentId,
        amountApplied: arPaymentAllocations.amountApplied,
        createdAt: arPaymentAllocations.createdAt,
      })
      .from(arPaymentAllocations)
      .where(eq(arPaymentAllocations.invoiceId, id));

    res.json({ ...normalizeInvoiceDocumentPo(invoice), lines, payments });
  } catch (error) {
    console.error('Failed to fetch invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      terms,
      poId,
      poOverride,
      discountAmount,
      freightAmount,
      taxAmount,
      retainagePercent,
      retainageAmount,
      notes,
      customerVisibleNotes,
      internalNotes,
      lines,
    } = req.body;

    if (!customerId || !invoiceNumber || !invoiceDate) {
      return res.status(400).json({ error: 'customerId, invoiceNumber, and invoiceDate are required' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const calculatedLines = lines.map((line: any) => {
      const qty = parseFloat(line.qty) || 0;
      const unitPrice = parseFloat(line.unitPrice) || 0;
      return {
        ...line,
        qty: qty.toString(),
        unitPrice: unitPrice.toString(),
        lineTotal: (qty * unitPrice).toFixed(2),
      };
    });

    const subtotal = calculatedLines.reduce(
      (sum: number, line: any) => sum + parseFloat(line.lineTotal),
      0
    );
    const discount = parseFloat(discountAmount) || 0;
    const freight = parseFloat(freightAmount) || 0;
    const tax = parseFloat(taxAmount) || 0;
    const retainage = parseFloat(retainageAmount) || 0;
    const totalAmount = subtotal - discount + freight + tax - retainage;

    const result = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(arInvoices)
        .values({
          customerId,
          invoiceNumber,
          invoiceDate,
          dueDate: dueDate || null,
          terms: terms || null,
          poId: poId || null,
          poOverride: poOverride || null,
          discountAmount: discount.toFixed(2),
          freightAmount: freight.toFixed(2),
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          retainagePercent: String(parseFloat(retainagePercent) || 0),
          retainageAmount: retainage.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          status: 'REVIEW',
          notes: notes || null,
          customerVisibleNotes: customerVisibleNotes || null,
          internalNotes: internalNotes || null,
          createdBy: (req as any).user?.username || null,
        })
        .returning();

      const lineInserts = calculatedLines.map((line: any) => {
        const productionLine = line.productionLine || 'MIGRATION_REVIEW';
        return {
          invoiceId: invoice.id,
          inventoryItemId: line.inventoryItemId || null,
          poItemId: line.poItemId || null,
          partNumber: line.partNumber || null,
          productionLine,
          projectId: line.projectId || null,
          projectNameSnapshot: line.projectNameSnapshot || null,
          salespersonUserId: line.salespersonUserId || null,
          salespersonNameSnapshot: line.salespersonNameSnapshot || null,
          csrUserId: line.csrUserId || null,
          csrNameSnapshot: line.csrNameSnapshot || null,
          customerType: line.customerType || null,
          dimensionTags: {
            ...(line.dimensionTags || {}),
            ...buildRevenueDimensionTags(productionLine),
          },
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        };
      });

      const insertedLines = await tx
        .insert(arInvoiceLines)
        .values(lineInserts)
        .returning();

      return { ...invoice, lines: insertedLines };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.put('/:id', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      customerId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      terms,
      poId,
      poOverride,
      discountAmount,
      freightAmount,
      taxAmount,
      retainagePercent,
      retainageAmount,
      notes,
      customerVisibleNotes,
      internalNotes,
      status,
      lines,
    } = req.body;

    const [existing] = await db
      .select()
      .from(arInvoices)
      .where(eq(arInvoices.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (LOCKED_STATUSES.includes(existing.status)) {
      return res.status(409).json({ error: 'Invoice is locked' });
    }

    if (String(status || '').toUpperCase() === 'PAID') {
      return res.status(409).json({
        error: 'Invoices must be marked paid by recording and allocating an AR payment so payment records and journal entries stay in sync.',
      });
    }

    const isP1Invoice =
      (await isP1PackingSlipInvoice(id)) ||
      String(existing.notes || '').startsWith('Auto-created from P1 OEM packing slip') ||
      String(existing.internalNotes || '').startsWith('Source: P1 OEM shipment');

    const requestedInvoiceNumber = invoiceNumber !== undefined ? String(invoiceNumber).trim() : undefined;
    if (requestedInvoiceNumber !== undefined && !requestedInvoiceNumber) {
      return res.status(400).json({ error: 'Invoice number cannot be blank' });
    }

    const invoiceNumberChanged =
      requestedInvoiceNumber !== undefined && requestedInvoiceNumber !== existing.invoiceNumber;

    if (invoiceNumberChanged) {
      const [duplicateInvoice] = await db
        .select({ id: arInvoices.id })
        .from(arInvoices)
        .where(and(eq(arInvoices.invoiceNumber, requestedInvoiceNumber), not(eq(arInvoices.id, id))))
        .limit(1);
      if (duplicateInvoice) {
        return res.status(409).json({ error: 'An invoice with that number already exists' });
      }

      if (!isP1Invoice && existing.packingSlipId) {
        const [duplicateSlip] = await db
          .select({ id: p2PackingSlips.id })
          .from(p2PackingSlips)
          .where(
            and(
              or(
                eq(p2PackingSlips.packingSlipNumber, requestedInvoiceNumber),
                eq(p2PackingSlips.invoiceNumber, requestedInvoiceNumber),
              ),
              not(eq(p2PackingSlips.id, existing.packingSlipId)),
            ),
          )
          .limit(1);
        if (duplicateSlip) {
          return res.status(409).json({ error: 'A P2 packing slip with that number already exists' });
        }
      }
    }

    let p2InvoiceNumberAudit:
      | {
          packingSlipId: string;
          customerId: string;
          customerName: string;
          oldPackingSlipNumber: string | null;
          oldInvoiceNumber: string | null;
          newInvoiceNumber: string;
        }
      | null = null;

    const result = await db.transaction(async (tx) => {
      let subtotal = parseFloat(existing.subtotal);
      let discount = parseFloat(discountAmount ?? existing.discountAmount ?? '0');
      let freight = parseFloat(freightAmount ?? existing.freightAmount ?? '0');
      let tax = parseFloat(taxAmount ?? existing.taxAmount);
      let retainage = parseFloat(retainageAmount ?? existing.retainageAmount ?? '0');

      if (lines && Array.isArray(lines)) {
        const existingLines = await tx
          .select()
          .from(arInvoiceLines)
          .where(eq(arInvoiceLines.invoiceId, id));
        const existingLinesById = new Map(
          existingLines.map((line) => [line.id, line])
        );

        await tx.delete(arInvoiceLines).where(eq(arInvoiceLines.invoiceId, id));

        const calculatedLines = lines.map((line: any) => {
          const existingLine = line.id ? existingLinesById.get(line.id) : null;
          const qty = parseFloat(line.qty) || 0;
          const unitPrice = parseFloat(line.unitPrice) || 0;
          const productionLine =
            line.productionLine ||
            existingLine?.productionLine ||
            'MIGRATION_REVIEW';
          return {
            invoiceId: id,
            inventoryItemId: line.inventoryItemId ?? existingLine?.inventoryItemId ?? null,
            poItemId: line.poItemId ?? existingLine?.poItemId ?? null,
            partNumber: line.partNumber ?? existingLine?.partNumber ?? null,
            productionLine,
            projectId: line.projectId ?? existingLine?.projectId ?? null,
            projectNameSnapshot: line.projectNameSnapshot ?? existingLine?.projectNameSnapshot ?? null,
            salespersonUserId: line.salespersonUserId ?? existingLine?.salespersonUserId ?? null,
            salespersonNameSnapshot: line.salespersonNameSnapshot ?? existingLine?.salespersonNameSnapshot ?? null,
            csrUserId: line.csrUserId ?? existingLine?.csrUserId ?? null,
            csrNameSnapshot: line.csrNameSnapshot ?? existingLine?.csrNameSnapshot ?? null,
            customerType: line.customerType ?? existingLine?.customerType ?? null,
            dimensionTags: {
              ...(existingLine?.dimensionTags && typeof existingLine.dimensionTags === 'object'
                ? existingLine.dimensionTags
                : {}),
              ...(line.dimensionTags || {}),
              ...buildRevenueDimensionTags(productionLine),
            },
            description: line.description,
            qty: qty.toString(),
            unitPrice: unitPrice.toString(),
            lineTotal: (qty * unitPrice).toFixed(2),
          };
        });

        subtotal = calculatedLines.reduce(
          (sum: number, line: any) => sum + parseFloat(line.lineTotal),
          0
        );

        if (calculatedLines.length > 0) {
          await tx.insert(arInvoiceLines).values(calculatedLines);
        }
      }

      if (retainagePercent !== undefined && retainageAmount === undefined) {
        const pct = parseFloat(retainagePercent) || 0;
        retainage = ((subtotal - discount + freight + tax) * pct) / 100;
      }
      const total = subtotal - discount + freight + tax - retainage;

      const [updated] = await tx
        .update(arInvoices)
        .set({
          ...(!isP1Invoice && customerId !== undefined && { customerId }),
          ...(requestedInvoiceNumber !== undefined && { invoiceNumber: requestedInvoiceNumber }),
          ...(invoiceDate !== undefined && { invoiceDate }),
          ...(dueDate !== undefined && { dueDate: dueDate || null }),
          ...(terms !== undefined && { terms: terms || null }),
          ...(!isP1Invoice && poId !== undefined && { poId: poId || null }),
          ...(!isP1Invoice && poOverride !== undefined && { poOverride: poOverride || null }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(customerVisibleNotes !== undefined && { customerVisibleNotes: customerVisibleNotes || null }),
          ...(internalNotes !== undefined && { internalNotes: internalNotes || null }),
          ...(status !== undefined && !LOCKED_STATUSES.includes(existing.status) && { status }),
          discountAmount: discount.toFixed(2),
          freightAmount: freight.toFixed(2),
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          retainagePercent: String(parseFloat(retainagePercent ?? existing.retainagePercent ?? '0') || 0),
          retainageAmount: retainage.toFixed(2),
          totalAmount: total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(arInvoices.id, id))
        .returning();

      if (!isP1Invoice && existing.packingSlipId) {
        const [linkedSlip] = await tx
          .select({
            id: p2PackingSlips.id,
            packingSlipNumber: p2PackingSlips.packingSlipNumber,
            invoiceNumber: p2PackingSlips.invoiceNumber,
            customerId: p2PackingSlips.customerId,
            customerName: p2PackingSlips.customerName,
          })
          .from(p2PackingSlips)
          .where(eq(p2PackingSlips.id, existing.packingSlipId));

        const slipPatch: Partial<typeof p2PackingSlips.$inferInsert> = {};
        if (invoiceNumberChanged && requestedInvoiceNumber) {
          slipPatch.packingSlipNumber = requestedInvoiceNumber;
          slipPatch.invoiceNumber = requestedInvoiceNumber;
          slipPatch.externalPdfUrl = null;
          p2InvoiceNumberAudit = linkedSlip
            ? {
                packingSlipId: linkedSlip.id,
                customerId: linkedSlip.customerId,
                customerName: linkedSlip.customerName,
                oldPackingSlipNumber: linkedSlip.packingSlipNumber,
                oldInvoiceNumber: linkedSlip.invoiceNumber,
                newInvoiceNumber: requestedInvoiceNumber,
              }
            : null;
        }
        if (poOverride !== undefined) {
          slipPatch.poNumber = poOverride || null;
          slipPatch.externalPdfUrl = null;
        } else if (poId !== undefined) {
          if (poId) {
            const [selectedPo] = await tx
              .select({ poNumber: p2PurchaseOrders.poNumber })
              .from(p2PurchaseOrders)
              .where(eq(p2PurchaseOrders.id, Number(poId)));
            slipPatch.poNumber = selectedPo?.poNumber || null;
          } else {
            slipPatch.poNumber = null;
          }
          slipPatch.externalPdfUrl = null;
        }
        if (Object.keys(slipPatch).length > 0) {
          await tx
            .update(p2PackingSlips)
            .set({ ...slipPatch, updatedAt: new Date() })
            .where(eq(p2PackingSlips.id, existing.packingSlipId));
        }
      }

      const updatedLines = await tx
        .select()
        .from(arInvoiceLines)
        .where(eq(arInvoiceLines.invoiceId, id));

      return { ...updated, lines: updatedLines };
    });

    if (p2InvoiceNumberAudit) {
      try {
        await syncP2InvoiceSequenceFromManualNumber({
          customerId: p2InvoiceNumberAudit.customerId,
          customerName: p2InvoiceNumberAudit.customerName,
          invoiceNumber: p2InvoiceNumberAudit.newInvoiceNumber,
        });
        await recordP2InvoiceNumberAudit({
          packingSlipId: p2InvoiceNumberAudit.packingSlipId,
          invoiceId: id,
          customerId: p2InvoiceNumberAudit.customerId,
          oldPackingSlipNumber: p2InvoiceNumberAudit.oldPackingSlipNumber,
          newPackingSlipNumber: p2InvoiceNumberAudit.newInvoiceNumber,
          oldInvoiceNumber: p2InvoiceNumberAudit.oldInvoiceNumber,
          newInvoiceNumber: p2InvoiceNumberAudit.newInvoiceNumber,
          action: 'AR_INVOICE_NUMBER_EDIT',
          reason: 'Invoice number edited from AR invoice details',
          changedBy: (req as any).user?.username || null,
        });
      } catch (numberAuditErr) {
        console.warn('[ARInvoice] P2 invoice number sequence/audit sync failed after invoice edit:', {
          invoiceId: id,
          invoiceNumber: p2InvoiceNumberAudit.newInvoiceNumber,
          numberAuditErr,
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to update invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.post('/:id/post', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user?.username || null;
    const depositApplication = z.object({
      depositInvoiceId: z.string().uuid(),
      amount: z.coerce.number().positive(),
      reason: z.string().trim().min(3),
    }).optional().parse(req.body?.depositApplication);

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!['DRAFT', 'REVIEW', 'SENT'].includes(invoice.status)) {
      return res.status(409).json({ error: `Cannot post invoice with status ${invoice.status}` });
    }
    if (invoice.pricingMismatch || invoice.pricingAmbiguous) {
      return res.status(409).json({ error: 'Invoice pricing must be resolved before posting' });
    }

    const [existingEntry] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.referenceUuid, id),
        eq(journalEntries.transactionType, 'AR_INVOICE'),
      ))
      .limit(1);

    if (existingEntry) {
      return res.status(409).json({ error: 'Invoice is already posted' });
    }

    await assertPostingAllowedForPeriod({
      effectiveDate: invoice.invoiceDate,
      user: (req as any).user,
      postingMode: 'STANDARD',
    });

    const invoiceLines = await db
      .select()
      .from(arInvoiceLines)
      .where(eq(arInvoiceLines.invoiceId, id));

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(arInvoices)
        .set({
          status: invoice.status === 'SENT' ? 'SENT' : 'POSTED',
          postedAt: new Date(),
          postedBy: user,
          updatedAt: new Date(),
        })
        .where(eq(arInvoices.id, id))
        .returning();

      const posting = await postArInvoiceAccounting({
        invoice,
        invoiceLines,
        user: (req as any).user ?? { username: user },
        tx,
      });

      const appliedDeposit = depositApplication
        ? await applyP2ProjectDeposit({
            depositInvoiceId: depositApplication.depositInvoiceId,
            finalInvoiceId: id,
            amount: depositApplication.amount,
            reason: depositApplication.reason,
            appliedBy: user,
          }, tx)
        : null;

      console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) posted by ${user}`);
      console.log(`[InvoiceService] Journal entry ${posting.journalEntryId} created for invoice ${invoice.invoiceNumber}`);

      return { ...updated, appliedDeposit };
    });

    if (depositApplication && result.appliedDeposit) {
      await recordAuditEvent({
        eventType: 'P2_MATERIAL_DEPOSIT_APPLIED',
        subjectType: 'ar_invoice',
        subjectId: id,
        sourceService: 'arInvoices.post',
        actor: { username: user },
        payload: {
          applicationId: result.appliedDeposit.id,
          depositInvoiceId: depositApplication.depositInvoiceId,
          finalInvoiceId: id,
          amount: depositApplication.amount,
        },
        reason: depositApplication.reason,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Failed to post invoice:', error);
    const statusCode = Number((error as any)?.statusCode || (error as any)?.status);
    const message = error instanceof Error && error.message ? error.message : 'Failed to post invoice';
    res.status(Number.isFinite(statusCode) ? statusCode : 500).json({ error: message });
  }
});

type InvoiceEmailRecipient = {
  name: string;
  email: string;
  type: 'primary' | 'additional' | 'contact';
};

const ACCOUNTING_INVOICE_CC = 'glenn@agadvanced.com';

async function recordInvoiceSendAudit({
  req,
  invoice,
  eventType,
  reason,
  payload,
  fieldsChanged,
}: {
  req: Request;
  invoice: typeof arInvoices.$inferSelect;
  eventType: 'INVOICE_SEND_ATTEMPTED' | 'INVOICE_SENT' | 'INVOICE_SEND_FAILED';
  reason: string;
  payload: Record<string, any>;
  fieldsChanged?: Record<string, { before: unknown; after: unknown }> | null;
}) {
  const user = (req as any).user;
  try {
    await recordAuditEvent({
      eventType,
      subjectType: 'ar_invoice',
      subjectId: invoice.id,
      entityType: 'ar_invoice',
      entityId: invoice.id,
      sourceService: 'arInvoices.route',
      actor: {
        id: typeof user?.id === 'number' ? user.id : null,
        username: user?.username || null,
        role: user?.role || null,
      },
      reason,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        totalAmount: Number(invoice.totalAmount || 0),
        ...payload,
      },
      meta: payload,
      fieldsChanged: fieldsChanged || null,
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
    });
  } catch (auditError) {
    console.warn(`[InvoiceAudit] Failed to record ${eventType} for invoice ${invoice.invoiceNumber}:`, auditError);
  }
}

function appendRecipient(recipients: InvoiceEmailRecipient[], recipient: InvoiceEmailRecipient) {
  const email = recipient.email?.trim();
  if (!email) return;
  if (recipients.some((r) => r.email.trim().toLowerCase() === email.toLowerCase())) return;
  recipients.push({ ...recipient, email });
}

function filterAllowedRecipients(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((email): email is string => typeof email === 'string')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => allowed.has(email));
}

function deriveInvoiceToAndCc(rawRecipients: unknown, recipients: InvoiceEmailRecipient[]): { to: string | null; cc: string[] } {
  const primary = recipients.find((recipient) => recipient.type === 'primary') ?? recipients[0];
  if (!primary) return { to: null, cc: [] };

  const allowed = new Set(recipients.map((recipient) => recipient.email.trim().toLowerCase()));
  const validated = filterAllowedRecipients(rawRecipients, allowed);
  const primaryNorm = primary.email.trim().toLowerCase();

  if (validated.length === 0) return { to: primary.email, cc: [] };

  const to = validated.includes(primaryNorm) ? primary.email : validated[0];
  const toNorm = to.trim().toLowerCase();
  const cc = validated.filter((email) => email !== toNorm);
  return { to, cc };
}

function appendAccountingInvoiceCc(to: string, cc: string[]): string[] {
  const accountingCcNorm = ACCOUNTING_INVOICE_CC.toLowerCase();
  const existing = new Set([to, ...cc].map((email) => email.trim().toLowerCase()));
  return existing.has(accountingCcNorm) ? cc : [...cc, ACCOUNTING_INVOICE_CC];
}

type CustomerRecipientSource = {
  id: number;
  name: string;
  email: string | null;
  contact: string | null;
};

type P2CustomerRecipientSource = {
  id: number;
  customerId: string;
  name: string;
  email: string | null;
};

type RecipientDebugStep = {
  step: string;
  status: 'ok' | 'error';
  detail?: unknown;
};

function debugRecipientStep(
  debugSteps: RecipientDebugStep[] | undefined,
  step: string,
  status: RecipientDebugStep['status'],
  detail?: unknown,
) {
  debugSteps?.push({ step, status, detail });
}

function recipientErrorDetail(error: unknown) {
  const err = error as { message?: string; code?: string; detail?: string };
  return {
    message: err?.message || String(error),
    code: err?.code || null,
    detail: err?.detail || null,
  };
}

async function findCustomerRecipientSourceById(customerId: string | null | undefined): Promise<CustomerRecipientSource | null> {
  if (!customerId || !/^\d+$/.test(customerId)) return null;
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email, contact: customers.contact })
    .from(customers)
    .where(eq(customers.id, Number(customerId)))
    .limit(1);
  return customer ?? null;
}

async function findCustomerRecipientSourceByName(customerName: string | null | undefined): Promise<CustomerRecipientSource | null> {
  const normalizedName = customerName?.trim();
  if (!normalizedName) return null;

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email, contact: customers.contact })
    .from(customers)
    .where(sql`
      lower(trim(${customers.name})) = lower(${normalizedName})
      OR lower(trim(COALESCE(${customers.company}, ''))) = lower(${normalizedName})
    `)
    .orderBy(desc(customers.isActive), customers.name)
    .limit(1);
  return customer ?? null;
}

async function appendCustomerInvoiceRecipients(
  recipients: InvoiceEmailRecipient[],
  customer: CustomerRecipientSource | null,
) {
  if (!customer?.id) return;

  const contacts = await db
    .select({
      name: customerContacts.name,
      email: customerContacts.email,
      isPrimary: customerContacts.isPrimary,
    })
    .from(customerContacts)
    .where(and(
      eq(customerContacts.customerId, customer.id),
      eq(customerContacts.active, true),
      eq(customerContacts.receivesInvoices, true),
    ))
    .orderBy(desc(customerContacts.isPrimary), customerContacts.name);

  for (const contact of contacts) {
    if (contact.email) {
      appendRecipient(recipients, {
        name: contact.name,
        email: contact.email,
        type: contact.isPrimary && recipients.length === 0 ? 'primary' : 'contact',
      });
    }
  }

  if (customer.email) {
    appendRecipient(recipients, {
      name: customer.contact || customer.name,
      email: customer.email,
      type: recipients.length === 0 ? 'primary' : 'additional',
    });
  }
}

function addP2RecipientRef(
  refs: Array<{ customerId: string | null; customerName: string | null }>,
  ref: { customerId?: string | null; customerName?: string | null } | null | undefined,
) {
  const customerId = ref?.customerId?.trim() || null;
  const customerName = ref?.customerName?.trim() || null;
  if (!customerId && !customerName) return;
  if (refs.some((item) =>
    (customerId && item.customerId === customerId) ||
    (customerName && item.customerName?.trim().toLowerCase() === customerName.toLowerCase())
  )) {
    return;
  }
  refs.push({ customerId, customerName });
}

async function findP2CustomerRecipientSourcesByRef(
  ref: { customerId: string | null; customerName: string | null },
): Promise<P2CustomerRecipientSource[]> {
  const customerId = ref.customerId?.trim();
  const customerName = ref.customerName?.trim();
  const customerNameMatch = customerName
    ? sql`lower(trim(${p2Customers.customerName})) = lower(${customerName})`
    : undefined;
  const whereClause =
    customerId && customerNameMatch ? or(eq(p2Customers.customerId, customerId), customerNameMatch) :
    customerId ? eq(p2Customers.customerId, customerId) :
    customerNameMatch;

  if (!whereClause) return [];

  return db
    .select({
      id: p2Customers.id,
      customerId: p2Customers.customerId,
      name: p2Customers.customerName,
      email: p2Customers.contactEmail,
    })
    .from(p2Customers)
    .where(whereClause)
    .orderBy(p2Customers.customerName)
    .limit(5);
}

async function appendP2CustomerInvoiceRecipients(
  recipients: InvoiceEmailRecipient[],
  customer: P2CustomerRecipientSource | null,
) {
  if (!customer?.id) return;

  if (customer.email) {
    appendRecipient(recipients, {
      name: customer.name,
      email: customer.email,
      type: recipients.length === 0 ? 'primary' : 'additional',
    });
  }

  const contacts = await db
    .select({ name: p2CustomerContacts.name, email: p2CustomerContacts.email, isPrimary: p2CustomerContacts.isPrimary })
    .from(p2CustomerContacts)
    .where(eq(p2CustomerContacts.customerId, customer.id))
    .orderBy(desc(p2CustomerContacts.isPrimary), p2CustomerContacts.name);

  for (const contact of contacts) {
    if (contact.email) {
      appendRecipient(recipients, {
        name: contact.name,
        email: contact.email,
        type: contact.isPrimary && recipients.length === 0 ? 'primary' : 'contact',
      });
    }
  }
}

async function appendP2InvoiceRecipients(
  recipients: InvoiceEmailRecipient[],
  invoice: typeof arInvoices.$inferSelect,
  debugSteps?: RecipientDebugStep[],
) {
  const refs: Array<{ customerId: string | null; customerName: string | null }> = [];
  addP2RecipientRef(refs, { customerId: invoice.customerId });

  if (invoice.poId && /^\d+$/.test(invoice.poId)) {
    const [po] = await db
      .select({ customerId: p2PurchaseOrders.customerId, customerName: p2PurchaseOrders.customerName })
      .from(p2PurchaseOrders)
      .where(eq(p2PurchaseOrders.id, Number(invoice.poId)))
      .limit(1);
    addP2RecipientRef(refs, po);
  }

  if (invoice.poOverride) {
    const [po] = await db
      .select({ customerId: p2PurchaseOrders.customerId, customerName: p2PurchaseOrders.customerName })
      .from(p2PurchaseOrders)
      .where(eq(p2PurchaseOrders.poNumber, invoice.poOverride))
      .limit(1);
    addP2RecipientRef(refs, po);
  }

  if (invoice.packingSlipId) {
    const [packingSlip] = await db
      .select({
        customerId: p2PackingSlips.customerId,
        customerName: p2PackingSlips.customerName,
        poNumber: p2PackingSlips.poNumber,
      })
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, invoice.packingSlipId))
      .limit(1);
    addP2RecipientRef(refs, packingSlip);

    if (packingSlip?.poNumber) {
      const [po] = await db
        .select({ customerId: p2PurchaseOrders.customerId, customerName: p2PurchaseOrders.customerName })
        .from(p2PurchaseOrders)
        .where(eq(p2PurchaseOrders.poNumber, packingSlip.poNumber))
        .limit(1);
      addP2RecipientRef(refs, po);
    }
  }

  if (invoice.lotId) {
    const [lot] = await db
      .select({
        customerId: p2LotNumbers.customerId,
        customerName: p2LotNumbers.customerName,
        poId: p2LotNumbers.poId,
        poNumber: p2LotNumbers.poNumber,
      })
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, invoice.lotId))
      .limit(1);
    addP2RecipientRef(refs, lot);

    if (lot?.poId) {
      const [po] = await db
        .select({ customerId: p2PurchaseOrders.customerId, customerName: p2PurchaseOrders.customerName })
        .from(p2PurchaseOrders)
        .where(eq(p2PurchaseOrders.id, lot.poId))
        .limit(1);
      addP2RecipientRef(refs, po);
    }

    if (lot?.poNumber) {
      const [po] = await db
        .select({ customerId: p2PurchaseOrders.customerId, customerName: p2PurchaseOrders.customerName })
        .from(p2PurchaseOrders)
        .where(eq(p2PurchaseOrders.poNumber, lot.poNumber))
        .limit(1);
      addP2RecipientRef(refs, po);
    }
  }

  for (const ref of refs) {
    try {
      const beforeCount = recipients.length;
      const p2Sources = await findP2CustomerRecipientSourcesByRef(ref);
      for (const p2Customer of p2Sources) {
        await appendP2CustomerInvoiceRecipients(recipients, p2Customer);
      }
      debugRecipientStep(debugSteps, 'p2_customer_ref', 'ok', {
        ref,
        matchedCustomers: p2Sources.map((source) => ({
          id: source.id,
          customerId: source.customerId,
          name: source.name,
          hasEmail: Boolean(source.email),
        })),
        recipientsAdded: recipients.length - beforeCount,
      });
    } catch (error) {
      console.warn('[InvoiceRecipients] P2 customer recipient lookup failed:', { invoiceId: invoice.id, ref, error });
      debugRecipientStep(debugSteps, 'p2_customer_ref', 'error', {
        ref,
        error: recipientErrorDetail(error),
      });
    }

    if (ref.customerName) {
      try {
        const beforeCount = recipients.length;
        await appendCustomerInvoiceRecipients(
          recipients,
          await findCustomerRecipientSourceByName(ref.customerName),
        );
        debugRecipientStep(debugSteps, 'master_customer_name_ref', 'ok', {
          customerName: ref.customerName,
          recipientsAdded: recipients.length - beforeCount,
        });
      } catch (error) {
        console.warn('[InvoiceRecipients] Master customer recipient lookup failed:', { invoiceId: invoice.id, customerName: ref.customerName, error });
        debugRecipientStep(debugSteps, 'master_customer_name_ref', 'error', {
          customerName: ref.customerName,
          error: recipientErrorDetail(error),
        });
      }
    }
  }
}

async function appendP1InvoiceRecipients(
  recipients: InvoiceEmailRecipient[],
  invoice: typeof arInvoices.$inferSelect,
) {
  await appendCustomerInvoiceRecipients(
    recipients,
    await findCustomerRecipientSourceById(invoice.customerId),
  );

  const purchaseOrderRefs: Array<{ customerId: string | null; customerName: string | null }> = [];

  if (invoice.poId && /^\d+$/.test(invoice.poId)) {
    const [po] = await db
      .select({ customerId: purchaseOrders.customerId, customerName: purchaseOrders.customerName })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, Number(invoice.poId)))
      .limit(1);
    if (po) purchaseOrderRefs.push(po);
  }

  if (invoice.poOverride) {
    const [po] = await db
      .select({ customerId: purchaseOrders.customerId, customerName: purchaseOrders.customerName })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.poNumber, invoice.poOverride))
      .limit(1);
    if (po) purchaseOrderRefs.push(po);
  }

  for (const po of purchaseOrderRefs) {
    await appendCustomerInvoiceRecipients(
      recipients,
      await findCustomerRecipientSourceById(po.customerId),
    );
    await appendCustomerInvoiceRecipients(
      recipients,
      await findCustomerRecipientSourceByName(po.customerName),
    );
  }
}

async function getInvoiceEmailRecipients(
  invoice: typeof arInvoices.$inferSelect,
  debugSteps?: RecipientDebugStep[],
): Promise<InvoiceEmailRecipient[]> {
  const recipients: InvoiceEmailRecipient[] = [];

  const isP1 = await isP1Invoice(invoice);
  debugRecipientStep(debugSteps, 'invoice_source', 'ok', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    source: isP1 ? 'P1' : 'P2',
    customerId: invoice.customerId,
    poId: invoice.poId,
    poOverride: invoice.poOverride,
    packingSlipId: invoice.packingSlipId,
    lotId: invoice.lotId,
  });

  if (isP1) {
    await appendP1InvoiceRecipients(recipients, invoice);
  }

  await appendP2InvoiceRecipients(recipients, invoice, debugSteps);

  return recipients;
}

async function isP1Invoice(invoice: typeof arInvoices.$inferSelect): Promise<boolean> {
  if (invoice.notes?.includes('Auto-created from P1 OEM packing slip')) return true;
  if (invoice.internalNotes?.includes('Source: P1 OEM shipment')) return true;

  const [line] = await db
    .select({ id: arInvoiceLines.id })
    .from(arInvoiceLines)
    .where(
      and(
        eq(arInvoiceLines.invoiceId, invoice.id),
        sql`(${arInvoiceLines.dimensionTags}->>'source' = 'p1_oem_packing_slip' OR UPPER(COALESCE(${arInvoiceLines.productionLine}, '')) = 'P1')`,
      )
    )
    .limit(1);
  return !!line;
}

async function getMediaEmailAttachments(
  entityRefs: Array<{ entityType: string; entityId: string }>,
  options: { invoiceAttachmentMediaIds?: Set<string> } = {}
) {
  const attachments: Array<{ content: string; filename: string; type?: string; disposition?: string }> = [];
  for (const ref of entityRefs) {
    const rows = await db
      .select({ media: mediaLibrary })
      .from(mediaAttachments)
      .innerJoin(mediaLibrary, eq(mediaAttachments.mediaId, mediaLibrary.id))
      .where(and(eq(mediaAttachments.entityType, ref.entityType), eq(mediaAttachments.entityId, ref.entityId)));

    for (const row of rows) {
      if (
        ref.entityType === 'invoice' &&
        options.invoiceAttachmentMediaIds &&
        !options.invoiceAttachmentMediaIds.has(row.media.id)
      ) {
        continue;
      }
      try {
        const buffer = await getFileStorageProviderForObjectPath(row.media.storagePath).downloadBuffer(row.media.storagePath);
        attachments.push({
          content: buffer.toString('base64'),
          filename: row.media.filename,
          type: row.media.mimeType || 'application/octet-stream',
          disposition: 'attachment',
        });
      } catch (err) {
        console.warn(`[InvoiceService] Skipping unavailable media attachment ${row.media.id}:`, err);
      }
    }
  }
  return attachments;
}

async function getLotFileAttachments(lotId: string | null) {
  if (!lotId) return [];
  const [lot] = await db
    .select({
      lotNumber: p2LotNumbers.lotNumber,
      billOfLadingUrl: sql<string | null>`bill_of_lading_url`,
      packingSlipUploadUrl: sql<string | null>`packing_slip_upload_url`,
      certificateUploadUrl: sql<string | null>`certificate_upload_url`,
      lotValidationReportUrl: sql<string | null>`lot_validation_report_url`,
    })
    .from(p2LotNumbers)
    .where(eq(p2LotNumbers.id, lotId));

  if (!lot) return [];
  const docs = [
    { label: 'Bill-of-Lading', path: lot.billOfLadingUrl },
    { label: 'Uploaded-Packing-Slip', path: lot.packingSlipUploadUrl },
    { label: 'Certificate-of-Conformance', path: lot.certificateUploadUrl },
    { label: 'Lot-Validation-Report', path: lot.lotValidationReportUrl },
  ].filter((d) => d.path);

  const attachments: Array<{ content: string; filename: string; type?: string; disposition?: string }> = [];
  for (const doc of docs) {
    try {
      const buffer = await getFileStorageProviderForObjectPath(doc.path!).downloadBuffer(doc.path!);
      attachments.push({
        content: buffer.toString('base64'),
        filename: `${lot.lotNumber}-${doc.label}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      });
    } catch (err) {
      console.warn(`[InvoiceService] Skipping unavailable lot backup document ${doc.path}:`, err);
    }
  }
  return attachments;
}

router.get('/:id/email-recipients', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const debugMode = req.query.debug === '1' || req.query.debug === 'true';
    const debugSteps: RecipientDebugStep[] = [];
    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const recipients = await getInvoiceEmailRecipients(invoice, debugMode ? debugSteps : undefined);
    if (debugMode) {
      return res.json({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientCount: recipients.length,
        recipients,
        debugSteps,
      });
    }
    res.json(recipients);
  } catch (error) {
    console.error('Failed to retrieve invoice email recipients:', error);
    if (req.query.debug === '1' || req.query.debug === 'true') {
      return res.status(500).json({
        error: 'Failed to retrieve invoice email recipients',
        detail: recipientErrorDetail(error),
      });
    }
    res.status(500).json({ error: 'Failed to retrieve invoice email recipients' });
  }
});

router.post('/:id/send', requirePermission('finance.post_invoice'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user?.username || null;
    const { recipients: selectedRecipients, customerMessage, attachmentMediaIds } = req.body || {};
    const selectedInvoiceAttachmentIds = Array.isArray(attachmentMediaIds)
      ? new Set(attachmentMediaIds.filter((mediaId: unknown): mediaId is string => typeof mediaId === 'string' && Boolean(mediaId.trim())))
      : undefined;

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!['REVIEW', 'POSTED', 'SENT'].includes(invoice.status)) {
      return res.status(409).json({ error: `Cannot send invoice with status ${invoice.status}` });
    }
    if (invoice.pricingMismatch || invoice.pricingAmbiguous) {
      return res.status(409).json({ error: 'Invoice pricing must be resolved before sending' });
    }

    const isP1 = await isP1Invoice(invoice);
    const availableRecipients = await getInvoiceEmailRecipients(invoice);
    const { to, cc: selectedCc } = deriveInvoiceToAndCc(selectedRecipients, availableRecipients);
    if (!to) {
      return res.status(422).json({ error: 'No customer email found. Add a customer contact email or provide a recipient.' });
    }
    const cc = appendAccountingInvoiceCc(to, selectedCc);

    const selectedRecipientRecords = availableRecipients.filter((recipient) =>
      [to, ...(Array.isArray(cc) ? cc : cc ? [cc] : [])].includes(recipient.email)
    );
    const auditPayloadBase = {
      to,
      cc: Array.isArray(cc) ? cc : cc ? [cc] : [],
      selectedRecipients: selectedRecipientRecords.map((recipient) => ({
        name: recipient.name,
        email: recipient.email,
        type: recipient.type,
      })),
      requestedRecipientCount: Array.isArray(selectedRecipients) ? selectedRecipients.length : null,
      selectedInvoiceAttachmentCount: selectedInvoiceAttachmentIds?.size ?? null,
      customerMessageIncluded: Boolean(customerMessage),
      invoiceSource: isP1 ? 'P1' : 'P2',
    };

    await recordInvoiceSendAudit({
      req,
      invoice,
      eventType: 'INVOICE_SEND_ATTEMPTED',
      reason: `Invoice ${invoice.invoiceNumber} send attempted`,
      payload: auditPayloadBase,
    });

    const invoicePdf = await generateArInvoicePdf(id);
    const mediaAttachments = await getMediaEmailAttachments([
      { entityType: 'invoice', entityId: id },
      ...(invoice.packingSlipId ? [{ entityType: 'packing_slip', entityId: invoice.packingSlipId }] : []),
      ...(invoice.lotId ? [{ entityType: 'lot', entityId: invoice.lotId }] : []),
    ], { invoiceAttachmentMediaIds: selectedInvoiceAttachmentIds });
    const lotAttachments = await getLotFileAttachments(invoice.lotId);

    const attachments = [
      {
        content: invoicePdf.toString('base64'),
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      },
      ...mediaAttachments,
      ...lotAttachments,
    ];

    const text = [
      `Please find attached invoice ${invoice.invoiceNumber}.`,
      customerMessage || invoice.customerVisibleNotes || '',
      '',
      `Amount due: $${Number(invoice.totalAmount || 0).toFixed(2)}`,
      invoice.dueDate ? `Due date: ${invoice.dueDate}` : '',
    ].filter(Boolean).join('\n');

    const result = await sendEmailViaSendGrid({
      to,
      cc,
      fromName: isP1 ? 'AG Composites' : undefined,
      subject: `Invoice ${invoice.invoiceNumber}`,
      text,
      html: `<p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong>.</p>${customerMessage || invoice.customerVisibleNotes ? `<p>${String(customerMessage || invoice.customerVisibleNotes).replace(/\n/g, '<br/>')}</p>` : ''}<p><strong>Amount due:</strong> $${Number(invoice.totalAmount || 0).toFixed(2)}</p>${invoice.dueDate ? `<p><strong>Due date:</strong> ${invoice.dueDate}</p>` : ''}`,
      attachments,
    });

    if (!result.success) {
      await recordInvoiceSendAudit({
        req,
        invoice,
        eventType: 'INVOICE_SEND_FAILED',
        reason: `Invoice ${invoice.invoiceNumber} send failed`,
        payload: {
          ...auditPayloadBase,
          provider: 'sendgrid',
          error: result.error || 'SendGrid failed to send invoice',
        },
      });
      return res.status(502).json({ error: result.error || 'SendGrid failed to send invoice' });
    }

    const [updated] = await db
      .update(arInvoices)
      .set({
        status: 'SENT',
        sentAt: new Date(),
        sentBy: user,
        sentTo: to,
        sentCc: Array.isArray(cc) ? cc : cc ? [cc] : [],
        sendgridMessageId: result.messageId || null,
        updatedAt: new Date(),
      })
      .where(eq(arInvoices.id, id))
      .returning();

    console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) sent by ${user}`);

    await recordInvoiceSendAudit({
      req,
      invoice: updated,
      eventType: 'INVOICE_SENT',
      reason: `Invoice ${invoice.invoiceNumber} sent`,
      payload: {
        ...auditPayloadBase,
        provider: 'sendgrid',
        providerMessageId: result.messageId || null,
        sentAt: updated.sentAt ? new Date(updated.sentAt).toISOString() : new Date().toISOString(),
      },
      fieldsChanged: {
        status: { before: invoice.status, after: updated.status },
        sentAt: { before: invoice.sentAt, after: updated.sentAt },
        sentBy: { before: invoice.sentBy, after: updated.sentBy },
        sentTo: { before: invoice.sentTo, after: updated.sentTo },
        sentCc: { before: invoice.sentCc, after: updated.sentCc },
        sendgridMessageId: { before: invoice.sendgridMessageId, after: updated.sendgridMessageId },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Failed to send invoice:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

router.post('/:id/void', requirePermission('finance.void_invoice'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { voidReason } = req.body;
    const user = (req as any).user?.username || null;

    if (!voidReason) {
      return res.status(400).json({ error: 'voidReason is required' });
    }

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const voidableStatuses = ['DRAFT', 'REVIEW', 'POSTED', 'SENT'];
    if (!voidableStatuses.includes(invoice.status)) {
      return res.status(409).json({ error: `Cannot void invoice with status ${invoice.status}` });
    }

    const [originalEntry] = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.transactionType, 'AR_INVOICE'),
          eq(journalEntries.referenceType, 'ar_invoice'),
          eq(journalEntries.referenceUuid, id),
        ),
      )
      .limit(1);
    if (invoice.status === 'POSTED' && !originalEntry) {
      return res.status(409).json({ error: 'Cannot void posted invoice: original AR invoice journal entry was not found' });
    }

    const needsReversal = !!originalEntry;

    if (needsReversal) {
      const [existingReversal] = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.transactionType, 'AR_INVOICE_REVERSAL'),
            eq(journalEntries.referenceType, 'ar_invoice'),
            eq(journalEntries.referenceUuid, id),
          ),
        )
        .limit(1);

      const effectiveDate = new Date();
      if (!existingReversal) {
        await assertPostingAllowedForPeriod({
          effectiveDate,
          user: user ? { username: user } : null,
          postingMode: 'REVERSAL',
        });
      }

      const result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(arInvoices)
          .set({ status: 'VOID', voidedAt: new Date(), voidedBy: user, voidReason, updatedAt: new Date() })
          .where(eq(arInvoices.id, id))
          .returning();

        if (existingReversal) {
          await tx.execute(sql`
            UPDATE p2_serial_billing_assignments
               SET invoice_id = NULL,
                   locked_at = NULL,
                   locked_by = NULL,
                   lock_reason = NULL,
                   updated_at = now()
             WHERE invoice_id = ${id}
          `);
          console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) voided by ${user}; reversal journal entry ${existingReversal.id} already exists`);
          return updated;
        }

        const originalLines = await tx
          .select()
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, originalEntry.id));

        if (originalLines.length === 0) {
          throw new Error(`Original AR invoice journal entry ${originalEntry.id} has no journal lines`);
        }

        const [entry] = await tx
          .insert(journalEntries)
          .values({
            transactionType: 'AR_INVOICE_REVERSAL',
            referenceType: 'ar_invoice',
            referenceId: 0,
            referenceUuid: id,
            effectiveDate,
            memo: `Reversal — AR Invoice ${invoice.invoiceNumber} — ID: ${id}`,
            status: 'POSTED',
            sourceSystem: 'EPOCH',
            sourceDocumentType: 'AR_INVOICE_VOID',
            sourceDocumentNumber: invoice.invoiceNumber,
            postingMode: 'REVERSAL',
            postedAt: new Date(),
            postedBy: user,
            reversalOfJournalEntryId: originalEntry.id,
            createdBy: user,
          })
          .returning();

        await tx.insert(journalLines).values(
          originalLines.map((line: typeof journalLines.$inferSelect) => ({
            journalEntryId: entry.id,
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
              source: 'ar_invoice_void',
              reversalOfJournalEntryId: originalEntry.id,
              voidReason,
            },
          })),
        );
        await tx.execute(sql`
          UPDATE p2_serial_billing_assignments
             SET invoice_id = NULL,
                 locked_at = NULL,
                 locked_by = NULL,
                 lock_reason = NULL,
                 updated_at = now()
           WHERE invoice_id = ${id}
        `);
        console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) voided by ${user}; reversal journal entry ${entry.id} created from original entry ${originalEntry.id}`);
        return updated;
      });

      return res.json(result);
    }

    const [updated] = await db
      .update(arInvoices)
      .set({ status: 'VOID', voidedAt: new Date(), voidedBy: user, voidReason, updatedAt: new Date() })
      .where(eq(arInvoices.id, id))
      .returning();
    await db.execute(sql`
      UPDATE p2_serial_billing_assignments
         SET invoice_id = NULL,
             locked_at = NULL,
             locked_by = NULL,
             lock_reason = NULL,
             updated_at = now()
       WHERE invoice_id = ${id}
    `);

    console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) voided by ${user} — reason: ${voidReason}`);

    res.json(updated);
  } catch (error) {
    console.error('Failed to void invoice:', error);
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

router.delete('/:id', requirePermission('finance.void_invoice'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(arInvoices)
      .where(eq(arInvoices.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(arPaymentAllocations).where(eq(arPaymentAllocations.invoiceId, id));
      await tx.delete(arInvoiceLines).where(eq(arInvoiceLines.invoiceId, id));
      await tx.delete(arInvoices).where(eq(arInvoices.id, id));
    });

    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;
