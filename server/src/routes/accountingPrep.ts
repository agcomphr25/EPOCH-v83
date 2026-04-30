/**
 * Accounting Prep Routes - Phase 0
 * 
 * This module provides a disposable, migratable reporting layer for capturing
 * shipment accounting data at the point of fulfillment to prepare monthly
 * QuickBooks journal entries.
 * 
 * KEY DESIGN DECISIONS:
 * - All amounts stored as positive semantic values (no debit/credit signs in DB)
 * - Debit/Credit presentation is handled at display time in the frontend
 * - Access restricted to users with ADMIN or OWNER role (via requireExecutiveAccess)
 * - One immutable snapshot per sales order (see shipping.ts for capture logic)
 * 
 * NET TOTAL HANDLING:
 * - netTotal is derived at capture time from: stockRevenue + shippingIncome - discounts
 * - On manual adjustment, netTotal is ALWAYS recalculated from component fields
 * - Original values preserved in original* fields for audit trail
 * 
 * ADJUSTMENT AUDIT TRAIL:
 * - All field changes recorded in shipment_accounting_adjustments table
 * - Each adjustment includes: old value, new value, reason, user, timestamp
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { eq, desc, and, gte, lte, isNotNull, sql } from 'drizzle-orm';
import {
  shipmentAccountingSnapshots,
  shipmentAccountingAdjustments,
  insertShipmentAccountingSnapshotSchema,
  insertShipmentAccountingAdjustmentSchema,
} from '../../schema';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';

const router = Router();

router.get('/', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, customerId, adjustedOnly } = req.query;
    
    let conditions = [];
    
    if (startDate) {
      conditions.push(gte(shipmentAccountingSnapshots.shipmentDate, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(shipmentAccountingSnapshots.shipmentDate, new Date(endDate as string)));
    }
    if (customerId) {
      conditions.push(eq(shipmentAccountingSnapshots.customerId, customerId as string));
    }
    if (adjustedOnly === 'true') {
      conditions.push(isNotNull(shipmentAccountingSnapshots.lastAdjustedAt));
    }
    
    const snapshots = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(shipmentAccountingSnapshots.shipmentDate));
    
    res.json(snapshots);
  } catch (error: any) {
    console.error('Error fetching accounting snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch accounting snapshots' });
  }
});

router.get('/:id', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [snapshot] = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(eq(shipmentAccountingSnapshots.id, id));
    
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    
    res.json(snapshot);
  } catch (error: any) {
    console.error('Error fetching snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

router.get('/:id/adjustments', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const adjustments = await db
      .select()
      .from(shipmentAccountingAdjustments)
      .where(eq(shipmentAccountingAdjustments.snapshotId, id))
      .orderBy(desc(shipmentAccountingAdjustments.adjustedAt));
    
    res.json(adjustments);
  } catch (error: any) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch adjustments' });
  }
});

router.patch('/:id', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { arAmount, stockRevenueAmount, shippingIncomeAmount, discountAmount, reason } = req.body;
    const user = (req as any).user;
    const username = user?.username || 'unknown';
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'Adjustment reason is required' });
    }
    
    const [existingSnapshot] = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(eq(shipmentAccountingSnapshots.id, id));
    
    if (!existingSnapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    
    const adjustments: { fieldName: string; oldValue: string; newValue: string }[] = [];
    const updates: Record<string, any> = {
      lastAdjustedAt: new Date(),
      lastAdjustedBy: username,
      adjustmentReason: reason,
      updatedAt: new Date(),
    };
    
    if (arAmount !== undefined && String(arAmount) !== existingSnapshot.arAmount) {
      adjustments.push({ fieldName: 'ar_amount', oldValue: existingSnapshot.arAmount || '0', newValue: String(arAmount) });
      updates.arAmount = String(arAmount);
    }
    if (stockRevenueAmount !== undefined && String(stockRevenueAmount) !== existingSnapshot.stockRevenueAmount) {
      adjustments.push({ fieldName: 'stock_revenue_amount', oldValue: existingSnapshot.stockRevenueAmount || '0', newValue: String(stockRevenueAmount) });
      updates.stockRevenueAmount = String(stockRevenueAmount);
    }
    if (shippingIncomeAmount !== undefined && String(shippingIncomeAmount) !== existingSnapshot.shippingIncomeAmount) {
      adjustments.push({ fieldName: 'shipping_income_amount', oldValue: existingSnapshot.shippingIncomeAmount || '0', newValue: String(shippingIncomeAmount) });
      updates.shippingIncomeAmount = String(shippingIncomeAmount);
    }
    if (discountAmount !== undefined && String(discountAmount) !== existingSnapshot.discountAmount) {
      adjustments.push({ fieldName: 'discount_amount', oldValue: existingSnapshot.discountAmount || '0', newValue: String(discountAmount) });
      updates.discountAmount = String(discountAmount);
    }
    
    const newArAmount = parseFloat(updates.arAmount ?? existingSnapshot.arAmount ?? '0');
    const newStockRevenue = parseFloat(updates.stockRevenueAmount ?? existingSnapshot.stockRevenueAmount ?? '0');
    const newShippingIncome = parseFloat(updates.shippingIncomeAmount ?? existingSnapshot.shippingIncomeAmount ?? '0');
    const newDiscount = parseFloat(updates.discountAmount ?? existingSnapshot.discountAmount ?? '0');
    
    // NET TOTAL RECALCULATION:
    // netTotal is ALWAYS recalculated from component fields on every adjustment.
    // This ensures consistency: netTotal = stockRevenue + shippingIncome - discounts.
    // The original captured netTotal is preserved in originalNetTotal for audit.
    const newNetTotal = newStockRevenue + newShippingIncome - newDiscount;
    
    if (String(newNetTotal) !== existingSnapshot.netTotal) {
      adjustments.push({ fieldName: 'net_total', oldValue: existingSnapshot.netTotal || '0', newValue: String(newNetTotal) });
      updates.netTotal = String(newNetTotal);
    }
    
    await db.transaction(async (tx) => {
      await tx
        .update(shipmentAccountingSnapshots)
        .set(updates)
        .where(eq(shipmentAccountingSnapshots.id, id));
      
      for (const adj of adjustments) {
        await tx.insert(shipmentAccountingAdjustments).values({
          snapshotId: id,
          fieldName: adj.fieldName,
          oldValue: adj.oldValue,
          newValue: adj.newValue,
          reason: reason,
          adjustedBy: username,
        });
      }
    });
    
    const [updatedSnapshot] = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(eq(shipmentAccountingSnapshots.id, id));
    
    res.json(updatedSnapshot);
  } catch (error: any) {
    console.error('Error updating snapshot:', error);
    res.status(500).json({ error: 'Failed to update snapshot' });
  }
});

router.post('/capture', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const {
      shipmentId,
      shipmentDate,
      customerId,
      customerName,
      salesOrderId,
      arAmount,
      stockRevenueAmount,
      shippingIncomeAmount,
      discountAmount,
    } = req.body;
    
    const netTotal = parseFloat(stockRevenueAmount || 0) + parseFloat(shippingIncomeAmount || 0) - parseFloat(discountAmount || 0);
    
    const [existingSnapshot] = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(eq(shipmentAccountingSnapshots.shipmentId, shipmentId));
    
    if (existingSnapshot) {
      return res.status(409).json({ error: 'Snapshot already exists for this shipment', snapshot: existingSnapshot });
    }
    
    const [newSnapshot] = await db
      .insert(shipmentAccountingSnapshots)
      .values({
        shipmentId,
        shipmentDate: new Date(shipmentDate),
        customerId,
        customerName,
        salesOrderId,
        arAmount: String(arAmount || netTotal),
        stockRevenueAmount: String(stockRevenueAmount || 0),
        shippingIncomeAmount: String(shippingIncomeAmount || 0),
        discountAmount: String(discountAmount || 0),
        netTotal: String(netTotal),
        currency: 'USD',
        originalArAmount: String(arAmount || netTotal),
        originalStockRevenueAmount: String(stockRevenueAmount || 0),
        originalShippingIncomeAmount: String(shippingIncomeAmount || 0),
        originalDiscountAmount: String(discountAmount || 0),
        originalNetTotal: String(netTotal),
      })
      .returning();
    
    res.status(201).json(newSnapshot);
  } catch (error: any) {
    console.error('Error capturing snapshot:', error);
    res.status(500).json({ error: 'Failed to capture snapshot' });
  }
});

router.get('/summary/monthly', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }
    
    const startDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
    const endDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59);
    
    const snapshots = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(
        and(
          gte(shipmentAccountingSnapshots.shipmentDate, startDate),
          lte(shipmentAccountingSnapshots.shipmentDate, endDate)
        )
      )
      .orderBy(desc(shipmentAccountingSnapshots.shipmentDate));
    
    const summary = {
      totalAR: snapshots.reduce((sum, s) => sum + parseFloat(s.arAmount || '0'), 0),
      totalStockRevenue: snapshots.reduce((sum, s) => sum + parseFloat(s.stockRevenueAmount || '0'), 0),
      totalShippingIncome: snapshots.reduce((sum, s) => sum + parseFloat(s.shippingIncomeAmount || '0'), 0),
      totalDiscounts: snapshots.reduce((sum, s) => sum + parseFloat(s.discountAmount || '0'), 0),
      totalNet: snapshots.reduce((sum, s) => sum + parseFloat(s.netTotal || '0'), 0),
      snapshotCount: snapshots.length,
      adjustedCount: snapshots.filter(s => s.lastAdjustedAt).length,
    };
    
    res.json({ snapshots, summary });
  } catch (error: any) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ error: 'Failed to fetch monthly summary' });
  }
});

export default router;
