import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  arInvoices,
  arInvoiceLines,
  p2Customers,
} from '../../schema';
import { eq, desc, sql, and, ilike } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess } from '../../middleware/routeAuthorization';

const router = Router();

router.use(authenticateToken);
router.use(requireAdminAccess);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, customerId, search } = req.query;

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
      })
      .from(arInvoices)
      .leftJoin(p2Customers, eq(arInvoices.customerId, p2Customers.customerId))
      .where(
        and(
          status && status !== 'all' ? eq(arInvoices.status, String(status)) : undefined,
          customerId ? eq(arInvoices.customerId, String(customerId)) : undefined,
          search ? ilike(arInvoices.invoiceNumber, `%${String(search)}%`) : undefined,
        )
      )
      .orderBy(desc(arInvoices.createdAt));

    res.json(results);
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
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
        subtotal: arInvoices.subtotal,
        taxAmount: arInvoices.taxAmount,
        totalAmount: arInvoices.totalAmount,
        status: arInvoices.status,
        notes: arInvoices.notes,
        createdBy: arInvoices.createdBy,
        createdAt: arInvoices.createdAt,
        updatedAt: arInvoices.updatedAt,
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

    res.json({ ...invoice, lines });
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
          ...(status !== undefined && { status }),
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
