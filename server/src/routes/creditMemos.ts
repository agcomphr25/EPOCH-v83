import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  creditMemos,
  creditMemoApplications,
  allOrders,
  customers,
  payments,
  insertCreditMemoSchema,
  insertCreditMemoApplicationSchema,
  arInvoices,
  journalEntries,
  journalLines,
  chartOfAccounts,
} from '../../schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess } from '../../middleware/routeAuthorization';
import { auditService } from '../services/auditService';

const router = Router();

router.use(authenticateToken);
router.use(requireAdminAccess);

async function generateMemoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CM-${year}-`;
  
  const lastMemo = await db
    .select({ memoNumber: creditMemos.memoNumber })
    .from(creditMemos)
    .where(sql`${creditMemos.memoNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(creditMemos.id))
    .limit(1);
  
  let nextNumber = 1;
  if (lastMemo.length > 0 && lastMemo[0].memoNumber) {
    const parts = lastMemo[0].memoNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }
  
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.query;
    
    let query = db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        customerId: creditMemos.customerId,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        notes: creditMemos.notes,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
        createdBy: creditMemos.createdBy,
        createdAt: creditMemos.createdAt,
        customerName: customers.name,
      })
      .from(creditMemos)
      .leftJoin(
        customers,
        sql`CAST(${creditMemos.customerId} AS INTEGER) = ${customers.id}`
      )
      .orderBy(desc(creditMemos.createdAt));
    
    if (customerId) {
      const memos = await query.where(eq(creditMemos.customerId, customerId as string));
      return res.json(memos);
    }
    
    const memos = await query;
    res.json(memos);
  } catch (error) {
    console.error('Error fetching credit memos:', error);
    res.status(500).json({ error: 'Failed to fetch credit memos' });
  }
});

router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    const memos = await db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        customerId: creditMemos.customerId,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        notes: creditMemos.notes,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
        createdBy: creditMemos.createdBy,
        createdAt: creditMemos.createdAt,
      })
      .from(creditMemos)
      .where(eq(creditMemos.customerId, customerId))
      .orderBy(desc(creditMemos.createdAt));
    
    res.json(memos);
  } catch (error) {
    console.error('Error fetching customer credit memos:', error);
    res.status(500).json({ error: 'Failed to fetch customer credit memos' });
  }
});

router.get('/customer/:customerId/unapplied', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    const memos = await db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        customerId: creditMemos.customerId,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        notes: creditMemos.notes,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
        sourceType: creditMemos.sourceType,
        sourceReference: creditMemos.sourceReference,
      })
      .from(creditMemos)
      .where(
        and(
          eq(creditMemos.customerId, customerId),
          eq(creditMemos.status, 'active'),
          sql`${creditMemos.unappliedAmount} > 0`
        )
      )
      .orderBy(desc(creditMemos.createdAt));
    
    res.json(memos);
  } catch (error) {
    console.error('Error fetching unapplied credit memos:', error);
    res.status(500).json({ error: 'Failed to fetch unapplied credit memos' });
  }
});

// GET /api/credit-memos/customer/:customerId/summary - Get total available credits summary for a customer
router.get('/customer/:customerId/summary', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    // Get total unapplied credits
    const [creditsResult] = await db
      .select({
        totalAvailable: sql<number>`COALESCE(SUM(${creditMemos.unappliedAmount}), 0)`,
        memoCount: sql<number>`COUNT(*)`,
      })
      .from(creditMemos)
      .where(
        and(
          eq(creditMemos.customerId, customerId),
          eq(creditMemos.status, 'active'),
          sql`${creditMemos.unappliedAmount} > 0`
        )
      );
    
    res.json({
      customerId,
      totalAvailableCredits: creditsResult?.totalAvailable || 0,
      activeMemoCount: creditsResult?.memoCount || 0,
    });
  } catch (error) {
    console.error('Error fetching credit summary:', error);
    res.status(500).json({ error: 'Failed to fetch credit summary' });
  }
});

// GET /api/credit-memos/invoice/:invoiceId - Get credit memos linked to a specific AR invoice
router.get('/invoice/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const memos = await db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        customerId: creditMemos.customerId,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        notes: creditMemos.notes,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
        createdBy: creditMemos.createdBy,
        createdAt: creditMemos.createdAt,
      })
      .from(creditMemos)
      .where(eq(creditMemos.arInvoiceId, invoiceId))
      .orderBy(desc(creditMemos.createdAt));
    res.json(memos);
  } catch (error) {
    console.error('Error fetching credit memos by invoice:', error);
    res.status(500).json({ error: 'Failed to fetch credit memos for invoice' });
  }
});

// GET /api/credit-memos/order/:orderId/applications - Get credit applications for a specific order
router.get('/order/:orderId/applications', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    const applications = await db
      .select({
        id: creditMemoApplications.id,
        creditMemoId: creditMemoApplications.creditMemoId,
        memoNumber: creditMemos.memoNumber,
        amountApplied: creditMemoApplications.amountApplied,
        appliedDate: creditMemoApplications.appliedDate,
        appliedBy: creditMemoApplications.appliedBy,
        notes: creditMemoApplications.notes,
      })
      .from(creditMemoApplications)
      .leftJoin(creditMemos, eq(creditMemoApplications.creditMemoId, creditMemos.id))
      .where(eq(creditMemoApplications.orderId, orderId))
      .orderBy(desc(creditMemoApplications.appliedDate));
    
    res.json(applications);
  } catch (error) {
    console.error('Error fetching order credit applications:', error);
    res.status(500).json({ error: 'Failed to fetch order credit applications' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [memo] = await db
      .select({
        id: creditMemos.id,
        memoNumber: creditMemos.memoNumber,
        customerId: creditMemos.customerId,
        amount: creditMemos.amount,
        appliedAmount: creditMemos.appliedAmount,
        unappliedAmount: creditMemos.unappliedAmount,
        reason: creditMemos.reason,
        notes: creditMemos.notes,
        status: creditMemos.status,
        issuedDate: creditMemos.issuedDate,
        createdBy: creditMemos.createdBy,
        createdAt: creditMemos.createdAt,
        customerName: customers.name,
      })
      .from(creditMemos)
      .leftJoin(
        customers,
        sql`CAST(${creditMemos.customerId} AS INTEGER) = ${customers.id}`
      )
      .where(eq(creditMemos.id, parseInt(id)));
    
    if (!memo) {
      return res.status(404).json({ error: 'Credit memo not found' });
    }
    
    const applications = await db
      .select({
        id: creditMemoApplications.id,
        orderId: creditMemoApplications.orderId,
        amountApplied: creditMemoApplications.amountApplied,
        appliedDate: creditMemoApplications.appliedDate,
        appliedBy: creditMemoApplications.appliedBy,
        notes: creditMemoApplications.notes,
      })
      .from(creditMemoApplications)
      .where(eq(creditMemoApplications.creditMemoId, parseInt(id)))
      .orderBy(desc(creditMemoApplications.appliedDate));
    
    res.json({ ...memo, applications });
  } catch (error) {
    console.error('Error fetching credit memo:', error);
    res.status(500).json({ error: 'Failed to fetch credit memo' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { customerId, amount, reason, notes, createdBy, arInvoiceId } = req.body;
    
    if (!customerId || !amount || !reason || !arInvoiceId) {
      return res.status(400).json({ error: 'Missing required fields: customerId, amount, reason, arInvoiceId' });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const [invoice] = await db.select().from(arInvoices).where(eq(arInvoices.id, arInvoiceId));
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.customerId !== customerId.toString()) {
      return res.status(400).json({ error: 'customerId does not match the referenced invoice customer' });
    }
    if (invoice.status === 'VOID') {
      return res.status(409).json({ error: 'Cannot create credit memo for a VOID invoice' });
    }
    if (!['POSTED', 'SENT'].includes(invoice.status)) {
      return res.status(409).json({ error: `Cannot create credit memo for invoice with status ${invoice.status}. Invoice must be POSTED or SENT.` });
    }

    const paymentsRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount_applied::numeric), 0) AS total_payments
      FROM ar_payment_allocations a
      JOIN ar_payments p ON p.id = a.payment_id
      WHERE a.invoice_id = ${arInvoiceId}::uuid
        AND COALESCE(p.status, 'posted') = 'posted'
    `);
    const creditsRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total_credits
      FROM credit_memos WHERE ar_invoice_id = ${arInvoiceId}::uuid AND status != 'cancelled'
    `);
    const paymentsRow = (paymentsRes.rows?.[0] ?? {}) as Record<string, string>;
    const creditsRow = (creditsRes.rows?.[0] ?? {}) as Record<string, string>;
    const totalPayments = parseFloat(paymentsRow.total_payments || '0');
    const totalCredits = parseFloat(creditsRow.total_credits || '0');
    const invoiceTotal = parseFloat(invoice.totalAmount);
    const remainingBalance = invoiceTotal - totalPayments - totalCredits;

    if (amount > remainingBalance) {
      return res.status(400).json({
        error: `Credit amount $${amount.toFixed(2)} exceeds remaining invoice balance of $${remainingBalance.toFixed(2)}`,
      });
    }

    const allAccounts = await db.select().from(chartOfAccounts);
    const arAccount = allAccounts.find((a) => a.accountName === 'Accounts Receivable');
    const revenueAccount = allAccounts.find((a) => a.accountName === 'Revenue — P2 Products');
    if (!arAccount || !revenueAccount) {
      return res.status(500).json({ error: 'Required chart-of-accounts entries not found' });
    }

    const memoNumber = await generateMemoNumber();

    const newMemo = await db.transaction(async (tx) => {
      const [memo] = await tx
        .insert(creditMemos)
        .values({
          memoNumber,
          customerId: customerId.toString(),
          amount,
          appliedAmount: 0,
          unappliedAmount: amount,
          reason,
          notes,
          status: 'active',
          sourceType: 'invoice_correction',
          arInvoiceId,
          createdBy: createdBy || 'System',
        })
        .returning();

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          transactionType: 'AR_CREDIT_MEMO',
          referenceType: 'credit_memo',
          referenceId: memo.id,
          effectiveDate: new Date(),
          memo: `Credit Memo ${memoNumber} — Invoice ${invoice.invoiceNumber}`,
          status: 'DRAFT',
          createdBy: createdBy || 'System',
        })
        .returning();

      await tx.insert(journalLines).values([
        { journalEntryId: entry.id, accountId: revenueAccount.id, debitAmount: amount, creditAmount: 0 },
        { journalEntryId: entry.id, accountId: arAccount.id, debitAmount: 0, creditAmount: amount },
      ]);

      console.log(`[CreditMemoService] Credit memo ${memoNumber} created for invoice ${invoice.invoiceNumber} — amount $${amount}`);
      console.log(`[CreditMemoService] Journal entry ${entry.id} created — DR Revenue — P2 Products $${amount}, CR Accounts Receivable $${amount}`);

      return memo;
    });

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: newMemo.memoNumber,
        action: 'CREDIT_MEMO_CREATED',
        actor: { username: createdBy || 'System' },
        meta: {
          memoNumber: newMemo.memoNumber,
          customerId,
          amount,
          reason,
          arInvoiceId,
          invoiceNumber: invoice.invoiceNumber,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log credit memo creation:', auditError);
    }

    res.status(201).json(newMemo);
  } catch (error) {
    console.error('Error creating credit memo:', error);
    res.status(500).json({ error: 'Failed to create credit memo' });
  }
});

router.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { applications } = req.body;
    
    // Derive appliedBy from authenticated user - never accept from client
    const appliedBy = req.user?.username || 'System';
    
    if (!applications || !Array.isArray(applications) || applications.length === 0) {
      return res.status(400).json({ error: 'Applications array is required' });
    }
    
    const [memo] = await db
      .select()
      .from(creditMemos)
      .where(eq(creditMemos.id, parseInt(id)));
    
    if (!memo) {
      return res.status(404).json({ error: 'Credit memo not found' });
    }
    
    if (memo.status !== 'active') {
      return res.status(400).json({ error: 'Credit memo is not active' });
    }
    
    const totalToApply = applications.reduce((sum: number, app: any) => sum + (app.amount || 0), 0);
    
    if (totalToApply > (memo.unappliedAmount || 0)) {
      return res.status(400).json({ 
        error: `Cannot apply $${totalToApply.toFixed(2)}. Only $${(memo.unappliedAmount || 0).toFixed(2)} is available.` 
      });
    }
    
    const createdApplications = [];
    const createdPayments = [];
    
    for (const app of applications) {
      if (!app.orderId || !app.amount || app.amount <= 0) {
        continue;
      }
      
      const [order] = await db
        .select()
        .from(allOrders)
        .where(eq(allOrders.orderId, app.orderId));
      
      if (!order) {
        return res.status(400).json({ error: `Order ${app.orderId} not found` });
      }
      
      const [application] = await db
        .insert(creditMemoApplications)
        .values({
          creditMemoId: parseInt(id),
          orderId: app.orderId,
          amountApplied: app.amount,
          appliedBy: appliedBy || 'System',
          notes: app.notes,
        })
        .returning();
      
      createdApplications.push(application);
      
      const [payment] = await db
        .insert(payments)
        .values({
          orderId: app.orderId,
          paymentType: 'credit_memo',
          paymentAmount: app.amount,
          paymentDate: new Date(),
          notes: `Credit Memo ${memo.memoNumber} applied`,
        })
        .returning();
      
      createdPayments.push(payment);
      console.log(`Created payment record ${payment.id} for order ${app.orderId}: $${app.amount} (Credit Memo ${memo.memoNumber})`);
    }
    
    const newAppliedAmount = (memo.appliedAmount || 0) + totalToApply;
    const newUnappliedAmount = memo.amount - newAppliedAmount;
    const newStatus = newUnappliedAmount <= 0 ? 'fully_applied' : 'active';
    
    await db
      .update(creditMemos)
      .set({
        appliedAmount: newAppliedAmount,
        unappliedAmount: newUnappliedAmount,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(creditMemos.id, parseInt(id)));
    
    console.log(`Applied $${totalToApply} from credit memo ${memo.memoNumber} to ${createdApplications.length} orders`);
    console.log(`Created ${createdPayments.length} payment records to update order balances`);

    for (const app of createdApplications) {
      try {
        await auditService.logEvent({
          entityType: 'p1_order',
          entityId: app.orderId,
          action: 'CREDIT_APPLIED',
          actor: { username: appliedBy },
          meta: {
            memoNumber: memo.memoNumber,
            creditMemoId: parseInt(id),
            amountApplied: app.amountApplied,
            remainingBalance: newUnappliedAmount,
          },
        });
      } catch (auditError) {
        console.error('[Audit] Failed to log credit application:', auditError);
      }
    }

    res.json({
      success: true,
      message: `Applied $${totalToApply.toFixed(2)} to ${createdApplications.length} order(s)`,
      applications: createdApplications,
      payments: createdPayments,
      remainingBalance: newUnappliedAmount,
    });
  } catch (error) {
    console.error('Error applying credit memo:', error);
    res.status(500).json({ error: 'Failed to apply credit memo' });
  }
});

router.get('/:id/applications', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const applications = await db
      .select({
        id: creditMemoApplications.id,
        creditMemoId: creditMemoApplications.creditMemoId,
        orderId: creditMemoApplications.orderId,
        amountApplied: creditMemoApplications.amountApplied,
        appliedDate: creditMemoApplications.appliedDate,
        appliedBy: creditMemoApplications.appliedBy,
        notes: creditMemoApplications.notes,
      })
      .from(creditMemoApplications)
      .where(eq(creditMemoApplications.creditMemoId, parseInt(id)))
      .orderBy(desc(creditMemoApplications.appliedDate));
    
    res.json(applications);
  } catch (error) {
    console.error('Error fetching credit memo applications:', error);
    res.status(500).json({ error: 'Failed to fetch credit memo applications' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, notes, status } = req.body;
    
    const [existingMemo] = await db
      .select()
      .from(creditMemos)
      .where(eq(creditMemos.id, parseInt(id)));
    
    if (!existingMemo) {
      return res.status(404).json({ error: 'Credit memo not found' });
    }
    
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    if (reason !== undefined) updateData.reason = reason;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    
    const [updatedMemo] = await db
      .update(creditMemos)
      .set(updateData)
      .where(eq(creditMemos.id, parseInt(id)))
      .returning();

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: existingMemo.memoNumber || String(id),
        action: 'CREDIT_MEMO_UPDATED',
        actor: { username: req.user?.username || 'System' },
        meta: {
          memoNumber: existingMemo.memoNumber,
          changes: { reason, notes, status },
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log credit memo update:', auditError);
    }

    res.json(updatedMemo);
  } catch (error) {
    console.error('Error updating credit memo:', error);
    res.status(500).json({ error: 'Failed to update credit memo' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [existingMemo] = await db
      .select()
      .from(creditMemos)
      .where(eq(creditMemos.id, parseInt(id)));
    
    if (!existingMemo) {
      return res.status(404).json({ error: 'Credit memo not found' });
    }
    
    if ((existingMemo.appliedAmount || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete a credit memo that has been applied to orders' });
    }
    
    await db
      .update(creditMemos)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(creditMemos.id, parseInt(id)));

    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: existingMemo.memoNumber || String(id),
        action: 'CREDIT_MEMO_CANCELLED',
        actor: { username: req.user?.username || 'System' },
        meta: {
          memoNumber: existingMemo.memoNumber,
          amount: existingMemo.amount,
          customerId: existingMemo.customerId,
        },
      });
    } catch (auditError) {
      console.error('[Audit] Failed to log credit memo cancellation:', auditError);
    }

    res.json({ success: true, message: 'Credit memo cancelled successfully' });
  } catch (error) {
    console.error('Error deleting credit memo:', error);
    res.status(500).json({ error: 'Failed to delete credit memo' });
  }
});

export default router;
