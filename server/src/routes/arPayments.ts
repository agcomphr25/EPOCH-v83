import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  arPayments,
  arPaymentAllocations,
  arInvoices,
  p2Customers,
} from '../../schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();

router.use(authenticateToken);
router.use(requirePermission('finance.view'));

router.get('/', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.query;

    const conditions = [];
    if (customerId) {
      conditions.push(eq(arPayments.customerId, String(customerId)));
    }

    const results = await db
      .select({
        id: arPayments.id,
        customerId: arPayments.customerId,
        customerName: p2Customers.customerName,
        paymentDate: arPayments.paymentDate,
        paymentMethod: arPayments.paymentMethod,
        referenceNumber: arPayments.referenceNumber,
        amount: arPayments.amount,
        notes: arPayments.notes,
        createdBy: arPayments.createdBy,
        createdAt: arPayments.createdAt,
        allocatedAmount: sql<string>`COALESCE(
          (SELECT SUM(amount_applied) FROM ar_payment_allocations WHERE payment_id = ${arPayments.id}),
          0
        )`,
      })
      .from(arPayments)
      .leftJoin(p2Customers, eq(arPayments.customerId, p2Customers.customerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(arPayments.createdAt));

    res.json(results);
  } catch (error) {
    console.error('Failed to fetch AR payments:', error);
    res.status(500).json({ error: 'Failed to fetch AR payments' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [payment] = await db
      .select({
        id: arPayments.id,
        customerId: arPayments.customerId,
        customerName: p2Customers.customerName,
        paymentDate: arPayments.paymentDate,
        paymentMethod: arPayments.paymentMethod,
        referenceNumber: arPayments.referenceNumber,
        amount: arPayments.amount,
        notes: arPayments.notes,
        createdBy: arPayments.createdBy,
        createdAt: arPayments.createdAt,
      })
      .from(arPayments)
      .leftJoin(p2Customers, eq(arPayments.customerId, p2Customers.customerId))
      .where(eq(arPayments.id, id));

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const allocations = await db
      .select({
        id: arPaymentAllocations.id,
        invoiceId: arPaymentAllocations.invoiceId,
        invoiceNumber: arInvoices.invoiceNumber,
        invoiceTotalAmount: arInvoices.totalAmount,
        invoiceStatus: arInvoices.status,
        amountApplied: arPaymentAllocations.amountApplied,
        createdAt: arPaymentAllocations.createdAt,
      })
      .from(arPaymentAllocations)
      .leftJoin(arInvoices, eq(arPaymentAllocations.invoiceId, arInvoices.id))
      .where(eq(arPaymentAllocations.paymentId, id));

    res.json({ ...payment, allocations });
  } catch (error) {
    console.error('Failed to fetch AR payment:', error);
    res.status(500).json({ error: 'Failed to fetch AR payment' });
  }
});

router.post('/', requirePermission('finance.manage_payments'), async (req: Request, res: Response) => {
  try {
    const { customerId, paymentDate, paymentMethod, referenceNumber, amount, notes } = req.body;

    if (!customerId || !paymentDate || !paymentMethod || !amount) {
      return res.status(400).json({ error: 'customerId, paymentDate, paymentMethod, and amount are required' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const [payment] = await db
      .insert(arPayments)
      .values({
        customerId,
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber || null,
        amount: parsedAmount.toFixed(2),
        notes: notes || null,
        createdBy: (req as any).user?.username || null,
      })
      .returning();

    res.status(201).json(payment);
  } catch (error) {
    console.error('Failed to create AR payment:', error);
    res.status(500).json({ error: 'Failed to create AR payment' });
  }
});

router.post('/:id/allocate', requirePermission('finance.manage_payments'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allocations = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'Allocations array is required' });
    }

    const [payment] = await db
      .select()
      .from(arPayments)
      .where(eq(arPayments.id, id));

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const existingAllocations = await db
      .select({
        total: sql<string>`COALESCE(SUM(amount_applied), 0)`,
      })
      .from(arPaymentAllocations)
      .where(eq(arPaymentAllocations.paymentId, id));

    const alreadyAllocated = parseFloat(existingAllocations[0]?.total || '0');
    const paymentTotal = parseFloat(payment.amount);
    const parsedAllocations = allocations.map((a: any) => ({
      invoiceId: a.invoice_id || a.invoiceId,
      amountApplied: parseFloat(a.amount || a.amountApplied) || 0,
    }));

    const newAllocationTotal = parsedAllocations.reduce(
      (sum: number, a: any) => sum + a.amountApplied,
      0
    );

    if (alreadyAllocated + newAllocationTotal > paymentTotal + 0.005) {
      return res.status(400).json({
        error: `Allocation total ($${(alreadyAllocated + newAllocationTotal).toFixed(2)}) exceeds payment amount ($${paymentTotal.toFixed(2)})`,
      });
    }

    const result = await db.transaction(async (tx) => {
      const insertedAllocations = [];

      for (const alloc of parsedAllocations) {
        const invoiceId = alloc.invoiceId;
        const amountApplied = alloc.amountApplied;

        if (!invoiceId || amountApplied <= 0) continue;

        const [invoice] = await tx
          .select()
          .from(arInvoices)
          .where(eq(arInvoices.id, invoiceId));

        if (!invoice) continue;

        const invoiceAllocations = await tx
          .select({
            total: sql<string>`COALESCE(SUM(amount_applied), 0)`,
          })
          .from(arPaymentAllocations)
          .where(eq(arPaymentAllocations.invoiceId, invoiceId));

        const invoicePaid = parseFloat(invoiceAllocations[0]?.total || '0');
        const invoiceTotal = parseFloat(invoice.totalAmount);
        const invoiceBalance = invoiceTotal - invoicePaid;

        if (amountApplied > invoiceBalance + 0.005) {
          throw new Error(
            `Allocation of $${amountApplied.toFixed(2)} exceeds remaining balance of $${invoiceBalance.toFixed(2)} for invoice ${invoice.invoiceNumber}`
          );
        }

        const [inserted] = await tx
          .insert(arPaymentAllocations)
          .values({
            paymentId: id,
            invoiceId,
            amountApplied: amountApplied.toFixed(2),
          })
          .returning();

        insertedAllocations.push(inserted);

        const newPaidTotal = invoicePaid + amountApplied;
        const newStatus = newPaidTotal >= invoiceTotal - 0.005 ? 'PAID' : invoice.status;

        if (newStatus !== invoice.status) {
          await tx
            .update(arInvoices)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(arInvoices.id, invoiceId));
        }
      }

      return insertedAllocations;
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Failed to allocate payment:', error);
    res.status(400).json({ error: error.message || 'Failed to allocate payment' });
  }
});

router.delete('/:id', requirePermission('finance.manage_payments'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [payment] = await db
      .select()
      .from(arPayments)
      .where(eq(arPayments.id, id));

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const affectedInvoiceIds = await db
      .select({ invoiceId: arPaymentAllocations.invoiceId })
      .from(arPaymentAllocations)
      .where(eq(arPaymentAllocations.paymentId, id));

    await db.transaction(async (tx) => {
      await tx.delete(arPayments).where(eq(arPayments.id, id));

      for (const { invoiceId } of affectedInvoiceIds) {
        const remaining = await tx
          .select({
            total: sql<string>`COALESCE(SUM(amount_applied), 0)`,
          })
          .from(arPaymentAllocations)
          .where(eq(arPaymentAllocations.invoiceId, invoiceId));

        const remainingPaid = parseFloat(remaining[0]?.total || '0');
        const [invoice] = await tx
          .select()
          .from(arInvoices)
          .where(eq(arInvoices.id, invoiceId));

        if (invoice) {
          const invoiceTotal = parseFloat(invoice.totalAmount);
          const newStatus = remainingPaid >= invoiceTotal - 0.005 ? 'PAID' : 'OPEN';
          await tx
            .update(arInvoices)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(arInvoices.id, invoiceId));
        }
      }
    });

    res.json({ success: true, message: 'Payment deleted' });
  } catch (error) {
    console.error('Failed to delete AR payment:', error);
    res.status(500).json({ error: 'Failed to delete AR payment' });
  }
});

export default router;
