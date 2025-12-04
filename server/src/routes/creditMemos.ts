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
} from '../../schema';
import { eq, desc, sql, and } from 'drizzle-orm';

const router = Router();

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
    const { customerId, amount, reason, notes, createdBy } = req.body;
    
    if (!customerId || !amount || !reason) {
      return res.status(400).json({ error: 'Missing required fields: customerId, amount, reason' });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }
    
    const memoNumber = await generateMemoNumber();
    
    const [newMemo] = await db
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
        createdBy: createdBy || 'System',
      })
      .returning();
    
    console.log('Created credit memo:', newMemo.memoNumber);
    res.status(201).json(newMemo);
  } catch (error) {
    console.error('Error creating credit memo:', error);
    res.status(500).json({ error: 'Failed to create credit memo' });
  }
});

router.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { applications, appliedBy } = req.body;
    
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
    
    res.json({ success: true, message: 'Credit memo cancelled successfully' });
  } catch (error) {
    console.error('Error deleting credit memo:', error);
    res.status(500).json({ error: 'Failed to delete credit memo' });
  }
});

export default router;
