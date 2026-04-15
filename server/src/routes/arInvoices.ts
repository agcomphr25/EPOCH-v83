import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  arPaymentAllocations,
  p2Customers,
  p2PurchaseOrders,
  chartOfAccounts,
  journalEntries,
  journalLines,
} from '../../schema';
import { eq, desc, sql, and, ilike, or, inArray, isNull, not } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess } from '../../middleware/routeAuthorization';

const LOCKED_STATUSES = ['POSTED', 'SENT', 'VOID', 'PAID'];

const router = Router();

router.use(authenticateToken);
router.use(requireAdminAccess);

router.get('/customer-pos', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
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
            (SELECT SUM(amount_applied::numeric) FROM ar_payment_allocations WHERE invoice_id = inv.id), 0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = inv.id AND status != 'cancelled'), 0
          ) AS balance
        FROM ar_invoices inv
        WHERE inv.status NOT IN ('PAID', 'VOID')
      ) i
      WHERE i.balance > 0
    `);

    const row = agingResult.rows?.[0] || agingResult[0] || {};
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
            (SELECT SUM(amount_applied::numeric) FROM ar_payment_allocations WHERE invoice_id = inv.id), 0
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
            (SELECT SUM(amount_applied::numeric) FROM ar_payment_allocations WHERE invoice_id = inv.id), 0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = inv.id AND status != 'cancelled'), 0
          )
        ), 0) AS balance,
        MIN(inv.invoice_date) AS oldest_invoice_date
      FROM ar_invoices inv
      WHERE inv.customer_id = ${customerId}
        AND inv.status NOT IN ('PAID', 'VOID')
    `);

    const row = (result.rows || result)?.[0] || {};
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
        customerName: p2Customers.customerName,
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
        notes: arInvoices.notes,
        createdBy: arInvoices.createdBy,
        createdAt: arInvoices.createdAt,
        sentAt: arInvoices.sentAt,
        isDisputed: arInvoices.isDisputed,
        pricingMismatch: arInvoices.pricingMismatch,
        pricingAmbiguous: arInvoices.pricingAmbiguous,
        autoCreated: arInvoices.autoCreated,
        packingSlipId: arInvoices.packingSlipId,
        amountPaid: sql<string>`COALESCE(
          (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE invoice_id = ${arInvoices.id}),
          0
        ) + COALESCE(
          (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
          0
        )`,
        balance: sql<string>`(
          ${arInvoices.totalAmount}::numeric - COALESCE(
            (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE invoice_id = ${arInvoices.id}),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
            0
          )
        )`,
      })
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .where(
        and(
          status && status !== 'all' ? eq(arInvoices.status, String(status)) : undefined,
          customerId ? eq(arInvoices.customerId, String(customerId)) : undefined,
          search ? ilike(arInvoices.invoiceNumber, `%${String(search)}%`) : undefined,
          safePackingSlipId ? eq(arInvoices.packingSlipId, safePackingSlipId) : undefined,
        )
      )
      .orderBy(desc(arInvoices.createdAt));

    res.json(results);
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

const DASHBOARD_INVOICE_SELECT = (invoices: typeof arInvoices, customers: typeof p2Customers) => ({
  id: invoices.id,
  customerId: invoices.customerId,
  customerName: customers.customerName,
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
  balance: sql<string>`(
    ${invoices.totalAmount}::numeric - COALESCE(
      (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE invoice_id = ${invoices.id}),
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
        WHERE status IN ('DRAFT','REVIEW') OR pricing_mismatch = true OR pricing_ambiguous = true
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
      needsReview: parseInt((needsReviewRow.rows?.[0] ?? (needsReviewRow as any)[0])?.count ?? '0'),
      unsent: parseInt((unsentRow.rows?.[0] ?? (unsentRow as any)[0])?.count ?? '0'),
      disputed: parseInt((disputedRow.rows?.[0] ?? (disputedRow as any)[0])?.count ?? '0'),
    });
  } catch (error) {
    console.error('Failed to fetch summary counts:', error);
    res.status(500).json({ error: 'Failed to fetch summary counts' });
  }
});

router.get('/needs-review', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .where(
        or(
          inArray(arInvoices.status, ['DRAFT', 'REVIEW']),
          eq(arInvoices.pricingMismatch, true),
          eq(arInvoices.pricingAmbiguous, true),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results);
  } catch (error) {
    console.error('Failed to fetch needs-review invoices:', error);
    res.status(500).json({ error: 'Failed to fetch needs-review invoices' });
  }
});

router.get('/unsent', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .where(
        and(
          eq(arInvoices.status, 'POSTED'),
          isNull(arInvoices.sentAt),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results);
  } catch (error) {
    console.error('Failed to fetch unsent invoices:', error);
    res.status(500).json({ error: 'Failed to fetch unsent invoices' });
  }
});

router.get('/disputed', async (_req: Request, res: Response) => {
  try {
    const results = await db
      .select(DASHBOARD_INVOICE_SELECT(arInvoices, p2Customers))
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .where(
        and(
          eq(arInvoices.isDisputed, true),
          not(inArray(arInvoices.status, ['VOID', 'PAID'])),
        )
      )
      .orderBy(desc(arInvoices.createdAt));
    res.json(results);
  } catch (error) {
    console.error('Failed to fetch disputed invoices:', error);
    res.status(500).json({ error: 'Failed to fetch disputed invoices' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [invoice] = await db
      .select({
        id: arInvoices.id,
        customerId: arInvoices.customerId,
        customerName: p2Customers.customerName,
        invoiceNumber: arInvoices.invoiceNumber,
        invoiceDate: arInvoices.invoiceDate,
        dueDate: arInvoices.dueDate,
        terms: arInvoices.terms,
        poId: arInvoices.poId,
        poOverride: arInvoices.poOverride,
        packingSlipId: arInvoices.packingSlipId,
        lotId: arInvoices.lotId,
        pricingMismatch: arInvoices.pricingMismatch,
        pricingAmbiguous: arInvoices.pricingAmbiguous,
        autoCreated: arInvoices.autoCreated,
        subtotal: arInvoices.subtotal,
        taxAmount: arInvoices.taxAmount,
        totalAmount: arInvoices.totalAmount,
        status: arInvoices.status,
        notes: arInvoices.notes,
        createdBy: arInvoices.createdBy,
        createdAt: arInvoices.createdAt,
        updatedAt: arInvoices.updatedAt,
        amountPaid: sql<string>`COALESCE(
          (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE invoice_id = ${arInvoices.id}),
          0
        ) + COALESCE(
          (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
          0
        )`,
        balance: sql<string>`(
          ${arInvoices.totalAmount}::numeric - COALESCE(
            (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE invoice_id = ${arInvoices.id}),
            0
          ) - COALESCE(
            (SELECT SUM(amount::numeric) FROM credit_memos WHERE ar_invoice_id = ${arInvoices.id} AND status != 'cancelled'),
            0
          )
        )`,
      })
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
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

    res.json({ ...invoice, lines, payments });
  } catch (error) {
    console.error('Failed to fetch invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      terms,
      poId,
      poOverride,
      taxAmount,
      notes,
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
    const tax = parseFloat(taxAmount) || 0;
    const totalAmount = subtotal + tax;

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
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          status: 'OPEN',
          notes: notes || null,
          createdBy: (req as any).user?.username || null,
        })
        .returning();

      const lineInserts = calculatedLines.map((line: any) => ({
        invoiceId: invoice.id,
        inventoryItemId: line.inventoryItemId || null,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      }));

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

router.put('/:id', async (req: Request, res: Response) => {
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
      taxAmount,
      notes,
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

    const result = await db.transaction(async (tx) => {
      let subtotal = parseFloat(existing.subtotal);
      let tax = parseFloat(taxAmount ?? existing.taxAmount);

      if (lines && Array.isArray(lines)) {
        await tx.delete(arInvoiceLines).where(eq(arInvoiceLines.invoiceId, id));

        const calculatedLines = lines.map((line: any) => {
          const qty = parseFloat(line.qty) || 0;
          const unitPrice = parseFloat(line.unitPrice) || 0;
          return {
            invoiceId: id,
            inventoryItemId: line.inventoryItemId || null,
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

      const total = subtotal + tax;

      const [updated] = await tx
        .update(arInvoices)
        .set({
          ...(customerId !== undefined && { customerId }),
          ...(invoiceNumber !== undefined && { invoiceNumber }),
          ...(invoiceDate !== undefined && { invoiceDate }),
          ...(dueDate !== undefined && { dueDate: dueDate || null }),
          ...(terms !== undefined && { terms: terms || null }),
          ...(poId !== undefined && { poId: poId || null }),
          ...(poOverride !== undefined && { poOverride: poOverride || null }),
          ...(notes !== undefined && { notes: notes || null }),
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          totalAmount: total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(arInvoices.id, id))
        .returning();

      const updatedLines = await tx
        .select()
        .from(arInvoiceLines)
        .where(eq(arInvoiceLines.invoiceId, id));

      return { ...updated, lines: updatedLines };
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to update invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.post('/:id/post', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user?.username || null;

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!['DRAFT', 'REVIEW'].includes(invoice.status)) {
      return res.status(409).json({ error: `Cannot post invoice with status ${invoice.status}` });
    }

    const total = parseFloat(invoice.totalAmount);
    const subtotal = parseFloat(invoice.subtotal);
    const tax = parseFloat(invoice.taxAmount);

    const allAccounts = await db.select().from(chartOfAccounts);
    const arAccount = allAccounts.find((a) => a.accountName === 'Accounts Receivable');
    const revenueAccount = allAccounts.find((a) => a.accountName === 'Revenue — P2 Products');
    const taxAccount = tax > 0 ? allAccounts.find((a) => a.accountName === 'Sales Tax Payable') : null;

    if (!arAccount || !revenueAccount) {
      return res.status(500).json({ error: 'Required chart-of-accounts entries not found' });
    }
    if (tax > 0 && !taxAccount) {
      return res.status(500).json({ error: 'Sales Tax Payable account not found in chart of accounts' });
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(arInvoices)
        .set({ status: 'POSTED', postedAt: new Date(), postedBy: user, updatedAt: new Date() })
        .where(eq(arInvoices.id, id))
        .returning();

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          transactionType: 'AR_INVOICE',
          referenceType: 'ar_invoice',
          referenceId: 0,
          effectiveDate: new Date(),
          memo: `AR Invoice ${invoice.invoiceNumber} — ID: ${id}`,
          status: 'DRAFT',
          createdBy: user,
        })
        .returning();

      type LineInsert = { journalEntryId: number; accountId: number; debitAmount: number; creditAmount: number };
      const lines: LineInsert[] = [
        { journalEntryId: entry.id, accountId: arAccount.id, debitAmount: total, creditAmount: 0 },
        { journalEntryId: entry.id, accountId: revenueAccount.id, debitAmount: 0, creditAmount: subtotal },
      ];
      if (tax > 0) {
        lines.push({ journalEntryId: entry.id, accountId: taxAccount.id, debitAmount: 0, creditAmount: tax });
      }

      await tx.insert(journalLines).values(lines);

      console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) posted by ${user}`);
      console.log(`[InvoiceService] Journal entry ${entry.id} created for invoice ${invoice.invoiceNumber} — DR AR ${total}, CR Revenue ${subtotal}${tax > 0 ? `, CR Sales Tax ${tax}` : ''}`);

      return updated;
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to post invoice:', error);
    res.status(500).json({ error: 'Failed to post invoice' });
  }
});

router.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user?.username || null;

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, id));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.status !== 'POSTED') {
      return res.status(409).json({ error: `Cannot send invoice with status ${invoice.status}` });
    }

    const [updated] = await db
      .update(arInvoices)
      .set({ status: 'SENT', sentAt: new Date(), sentBy: user, updatedAt: new Date() })
      .where(eq(arInvoices.id, id))
      .returning();

    console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) sent by ${user}`);

    res.json(updated);
  } catch (error) {
    console.error('Failed to send invoice:', error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

router.post('/:id/void', async (req: Request, res: Response) => {
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

    const needsReversal = ['POSTED', 'SENT'].includes(invoice.status);

    if (needsReversal) {
      const allAccounts = await db.select().from(chartOfAccounts);
      const arAccount = allAccounts.find((a) => a.accountName === 'Accounts Receivable');
      const revenueAccount = allAccounts.find((a) => a.accountName === 'Revenue — P2 Products');

      const total = parseFloat(invoice.totalAmount);
      const subtotal = parseFloat(invoice.subtotal);
      const tax = parseFloat(invoice.taxAmount);

      const taxAccount = tax > 0 ? allAccounts.find((a) => a.accountName === 'Sales Tax Payable') : null;

      if (!arAccount || !revenueAccount) {
        return res.status(500).json({ error: 'Required chart-of-accounts entries not found' });
      }
      if (tax > 0 && !taxAccount) {
        return res.status(500).json({ error: 'Sales Tax Payable account not found in chart of accounts' });
      }

      const result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(arInvoices)
          .set({ status: 'VOID', voidedAt: new Date(), voidedBy: user, voidReason, updatedAt: new Date() })
          .where(eq(arInvoices.id, id))
          .returning();

        const [entry] = await tx
          .insert(journalEntries)
          .values({
            transactionType: 'AR_INVOICE_REVERSAL',
            referenceType: 'ar_invoice',
            referenceId: 0,
            effectiveDate: new Date(),
            memo: `Reversal — AR Invoice ${invoice.invoiceNumber} — ID: ${id}`,
            status: 'DRAFT',
            createdBy: user,
          })
          .returning();

        type LineInsert = { journalEntryId: number; accountId: number; debitAmount: number; creditAmount: number };
        const lines: LineInsert[] = [
          { journalEntryId: entry.id, accountId: revenueAccount.id, debitAmount: subtotal, creditAmount: 0 },
          { journalEntryId: entry.id, accountId: arAccount.id, debitAmount: 0, creditAmount: total },
        ];
        if (tax > 0) {
          lines.push({ journalEntryId: entry.id, accountId: taxAccount.id, debitAmount: tax, creditAmount: 0 });
        }

        await tx.insert(journalLines).values(lines);

        console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) voided by ${user} — reason: ${voidReason}`);
        console.log(`[InvoiceService] Reversal journal entry ${entry.id} created for invoice ${invoice.invoiceNumber} — DR Revenue ${subtotal}, CR AR ${total}${tax > 0 ? `, DR Sales Tax ${tax}` : ''}`);

        return updated;
      });

      return res.json(result);
    }

    const [updated] = await db
      .update(arInvoices)
      .set({ status: 'VOID', voidedAt: new Date(), voidedBy: user, voidReason, updatedAt: new Date() })
      .where(eq(arInvoices.id, id))
      .returning();

    console.log(`[InvoiceService] Invoice ${invoice.invoiceNumber} (${id}) voided by ${user} — reason: ${voidReason}`);

    res.json(updated);
  } catch (error) {
    console.error('Failed to void invoice:', error);
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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
