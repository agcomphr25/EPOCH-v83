import { Router } from 'express';
import { db } from '../../db';
import { 
  p2ProductionOrders, 
  p2PurchaseOrders, 
  p2PurchaseOrderItems,
  boms,
  bomLines,
  partRoutings
} from '../../schema';
import { eq, sql, and, inArray } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, poId, department } = req.query;

    const baseQuery = db
      .select({
        productionOrder: p2ProductionOrders,
        purchaseOrder: {
          id: p2PurchaseOrders.id,
          poNumber: p2PurchaseOrders.poNumber,
          customerName: p2PurchaseOrders.customerName,
          expectedDelivery: p2PurchaseOrders.expectedDelivery,
        },
        poItem: {
          id: p2PurchaseOrderItems.id,
          partNumber: p2PurchaseOrderItems.partNumber,
          partName: p2PurchaseOrderItems.partName,
          quantity: p2PurchaseOrderItems.quantity,
        },
        bom: {
          id: boms.id,
          parentPartAgNumber: boms.parentPartAgNumber,
          code: boms.code,
          description: boms.description,
        },
        bomLine: {
          id: bomLines.id,
          childPartAgNumber: bomLines.childPartAgNumber,
          qtyPer: bomLines.qtyPer,
          operationSeq: bomLines.operationSeq,
        },
      })
      .from(p2ProductionOrders)
      .leftJoin(
        p2PurchaseOrders,
        eq(p2ProductionOrders.p2PoId, p2PurchaseOrders.id)
      )
      .leftJoin(
        p2PurchaseOrderItems,
        eq(p2ProductionOrders.p2PoItemId, p2PurchaseOrderItems.id)
      )
      .leftJoin(
        boms,
        eq(p2ProductionOrders.bomDefinitionId, boms.id)
      )
      .leftJoin(
        bomLines,
        eq(p2ProductionOrders.bomItemId, bomLines.id)
      );

    const filters = [];

    // Gate: only surface orders whose parent PO has been cleared for production.
    // POs advance to READY_FOR_PRODUCTION when the pre-production checklist is signed off.
    // Allow broader statuses so orders already in-flight are not hidden mid-run.
    filters.push(
      inArray(p2PurchaseOrders.status, [
        'READY_FOR_PRODUCTION',
        'IN_PRODUCTION',
        'COMPLETED',
        'SHIPPED',
      ])
    );

    if (status && typeof status === 'string' && status !== 'all' && status !== 'undefined') {
      filters.push(eq(p2ProductionOrders.status, status));
    }

    if (poId && typeof poId === 'string') {
      const poIdNum = parseInt(poId, 10);
      if (!isNaN(poIdNum)) {
        filters.push(eq(p2ProductionOrders.p2PoId, poIdNum));
      }
    }

    if (department && typeof department === 'string' && department !== 'all') {
      filters.push(eq(p2ProductionOrders.department, department));
    }

    const results = filters.length > 0
      ? await baseQuery.where(and(...filters))
      : await baseQuery;

    // Get unique part numbers to fetch routing configs
    const partNumbers = results.map((r) => r.poItem?.partNumber).filter(Boolean) as string[];
    const uniquePartNumbers = Array.from(new Set(partNumbers));

    let routingConfigs: Record<string, any> = {};
    if (uniquePartNumbers.length > 0) {
      const routings = await db
        .select()
        .from(partRoutings)
        .where(
          and(
            inArray(partRoutings.partNumber, uniquePartNumbers),
            eq(partRoutings.isActive, true)
          )
        );

      routings.forEach((routing) => {
        routingConfigs[routing.partNumber] = routing;
      });
    }

    // Group by PO and parent part
    const grouped = results.reduce(
      (acc, row) => {
        const poId = row.purchaseOrder?.id;
        const poItemId = row.poItem?.id;

        if (!poId || !poItemId || !row.poItem) return acc;

        if (!acc[poId]) {
          acc[poId] = {
            purchaseOrder: row.purchaseOrder,
            parents: {},
          };
        }

        if (!acc[poId].parents[poItemId]) {
          acc[poId].parents[poItemId] = {
            poItem: row.poItem,
            bom: row.bom,
            routing: routingConfigs[row.poItem.partNumber || ''] || null,
            productionOrders: [],
          };
        }

        acc[poId].parents[poItemId].productionOrders.push({
          ...row.productionOrder,
          bomLine: row.bomLine,
        });

        return acc;
      },
      {} as Record<
        number,
        {
          purchaseOrder: any;
          parents: Record<
            number,
            {
              poItem: any;
              bom: any;
              routing: any;
              productionOrders: any[];
            }
          >;
        }
      >
    );

    const formattedResults = Object.values(grouped).map((po) => ({
      purchaseOrder: po.purchaseOrder,
      parents: Object.values(po.parents),
    }));

    res.json(formattedResults);
  } catch (error: any) {
    console.error('Error fetching P2 production queue:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production queue',
      message: error.message 
    });
  }
});

router.patch('/:id/schedule-layup', async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledLayupDate } = req.body;

    if (!scheduledLayupDate) {
      return res.status(400).json({ error: 'Scheduled layup date is required' });
    }

    const [updated] = await db
      .update(p2ProductionOrders)
      .set({
        scheduledLayupDate: new Date(scheduledLayupDate),
        updatedAt: new Date(),
      })
      .where(eq(p2ProductionOrders.id, parseInt(id, 10)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Production order not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error scheduling layup:', error);
    res.status(500).json({ 
      error: 'Failed to schedule layup',
      message: error.message 
    });
  }
});

router.patch('/:id/update-quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantityManufactured } = req.body;

    if (quantityManufactured === undefined || quantityManufactured < 0) {
      return res.status(400).json({ error: 'Valid quantity manufactured is required' });
    }

    const [productionOrder] = await db
      .select()
      .from(p2ProductionOrders)
      .where(eq(p2ProductionOrders.id, parseInt(id, 10)));

    if (!productionOrder) {
      return res.status(404).json({ error: 'Production order not found' });
    }

    const newStatus =
      quantityManufactured >= productionOrder.quantity
        ? 'COMPLETED'
        : quantityManufactured > 0
          ? 'IN_PROGRESS'
          : 'PENDING';

    const [updated] = await db
      .update(p2ProductionOrders)
      .set({
        quantityManufactured,
        status: newStatus,
        completedAt:
          newStatus === 'COMPLETED' ? new Date() : null,
        startedAt:
          newStatus === 'IN_PROGRESS' && !productionOrder.startedAt
            ? new Date()
            : productionOrder.startedAt,
        updatedAt: new Date(),
      })
      .where(eq(p2ProductionOrders.id, parseInt(id, 10)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating quantity:', error);
    res.status(500).json({ 
      error: 'Failed to update quantity',
      message: error.message 
    });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Status must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const [updated] = await db
      .update(p2ProductionOrders)
      .set({
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(p2ProductionOrders.id, parseInt(id, 10)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Production order not found' });
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating status:', error);
    res.status(500).json({ 
      error: 'Failed to update status',
      message: error.message 
    });
  }
});

export default router;
