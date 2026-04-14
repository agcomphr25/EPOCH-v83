import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  workOrders,
  workOrderParts,
  workOrderAttachments,
  assets,
  inventoryItems,
  users,
  maintenanceSchedules,
  insertWorkOrderSchema,
  insertWorkOrderPartSchema,
  insertWorkOrderAttachmentSchema,
  insertProductionWorkOrderSchema,
} from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { storage } from '../../storage';

const router = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== WORK ORDERS (MAINTENANCE EVENTS) ====================

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, type, assetId } = req.query;
    let query = db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .orderBy(desc(workOrders.reportedAt))
      .$dynamic();

    const conditions = [];
    if (status && typeof status === 'string') {
      conditions.push(eq(workOrders.status, status));
    }
    if (type && typeof type === 'string') {
      conditions.push(eq(workOrders.type, type));
    }
    if (assetId && typeof assetId === 'string') {
      conditions.push(eq(workOrders.assetId, assetId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query;
    res.json(results);
  } catch (error) {
    console.error('[WorkOrders] Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// ==================== PRODUCTION WORK ORDERS (WAD) — EPOCH v9 spine ====================

// GET /project/:projectId — list production work orders for a project, newest-first
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const workOrderList = await storage.getWorkOrdersByProject(req.params.projectId);
    return res.json(workOrderList);
  } catch (err: any) {
    console.error('[ProductionWorkOrders] Error fetching by project:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch work orders' });
  }
});

// GET /:id — checks production WO first; falls back to maintenance WO for legacy compat
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Production WO lookup takes priority
    const productionWO = await storage.getWorkOrderById(id);
    if (productionWO) {
      return res.json(productionWO);
    }

    // Compatibility alias: fall through to maintenance WO for legacy clients
    const [wo] = await db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    return res.json(wo);
  } catch (err: any) {
    console.error('[WorkOrders] Error fetching work order:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch work order' });
  }
});

// GET /maintenance/:id — maintenance work order detail (legacy)
router.get('/maintenance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [wo] = await db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const parts = await db
      .select({
        id: workOrderParts.id,
        workOrderId: workOrderParts.workOrderId,
        inventoryItemId: workOrderParts.inventoryItemId,
        partName: workOrderParts.partName,
        quantity: workOrderParts.quantity,
        costSnapshot: workOrderParts.costSnapshot,
        inventoryPartNumber: inventoryItems.agPartNumber,
        inventoryPartName: inventoryItems.name,
      })
      .from(workOrderParts)
      .leftJoin(inventoryItems, eq(workOrderParts.inventoryItemId, inventoryItems.id))
      .where(eq(workOrderParts.workOrderId, id));

    const attachments = await db
      .select({
        id: workOrderAttachments.id,
        workOrderId: workOrderAttachments.workOrderId,
        fileUrl: workOrderAttachments.fileUrl,
        fileName: workOrderAttachments.fileName,
        uploadedBy: workOrderAttachments.uploadedBy,
        uploadedAt: workOrderAttachments.uploadedAt,
        uploadedByUsername: users.username,
      })
      .from(workOrderAttachments)
      .leftJoin(users, eq(workOrderAttachments.uploadedBy, users.id))
      .where(eq(workOrderAttachments.workOrderId, id));

    res.json({ ...wo, parts, attachments });
  } catch (error) {
    console.error('[WorkOrders] Error fetching work order:', error);
    res.status(500).json({ error: 'Failed to fetch work order' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    // Production Work Order path — detected by presence of workOrderNumber
    if (req.body.workOrderNumber !== undefined) {
      // Require authentication for production WO creation
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const parsed = insertProductionWorkOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      }
      const productionWO = await storage.createProductionWorkOrder(parsed.data);
      return res.status(201).json(productionWO);
    }

    // Maintenance Work Order path — requires admin role
    if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const parsed = insertWorkOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [wo] = await db.insert(workOrders).values({
      ...parsed.data,
      createdBy: user?.id,
    }).returning();

    res.status(201).json(wo);
  } catch (error) {
    console.error('[WorkOrders] Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = insertWorkOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [existing] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [updated] = await db.update(workOrders).set(parsed.data).where(eq(workOrders.id, id)).returning();
    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// ==================== WORK ORDER STATE TRANSITIONS ====================

router.post('/:id/start', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status !== 'open' && wo.status !== 'waiting_parts') {
      return res.status(400).json({ error: `Cannot start work order with status: ${wo.status}` });
    }

    const [updated] = await db.update(workOrders).set({
      status: 'in_progress',
      startedAt: new Date(),
      downtimeStart: wo.downtimeStart || new Date(),
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error starting work order:', error);
    res.status(500).json({ error: 'Failed to start work order' });
  }
});

router.post('/:id/complete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status === 'completed' || wo.status === 'closed') {
      return res.status(400).json({ error: `Work order already ${wo.status}` });
    }

    const now = new Date();
    const [updated] = await db.update(workOrders).set({
      status: 'completed',
      completedAt: now,
      downtimeEnd: wo.downtimeStart ? now : null,
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error completing work order:', error);
    res.status(500).json({ error: 'Failed to complete work order' });
  }
});

router.post('/:id/close', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status === 'closed') {
      return res.status(400).json({ error: 'Work order already closed' });
    }

    const now = new Date();
    const [updated] = await db.update(workOrders).set({
      status: 'closed',
      closedBy: userId,
      completedAt: wo.completedAt || now,
      downtimeEnd: wo.downtimeStart && !wo.downtimeEnd ? now : wo.downtimeEnd,
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error closing work order:', error);
    res.status(500).json({ error: 'Failed to close work order' });
  }
});

// ==================== WORK ORDER PARTS ====================

router.post('/:id/add-part', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const partSchema = z.object({
      inventoryItemId: z.number().int().positive().optional(),
      partName: z.string().optional(),
      quantity: z.string().or(z.number()).transform(v => String(v)),
      costSnapshot: z.string().or(z.number()).transform(v => String(v)).optional(),
    });

    const parsed = partSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    let costSnapshot = parsed.data.costSnapshot;
    if (parsed.data.inventoryItemId && !costSnapshot) {
      const [item] = await db.select({ costPer: inventoryItems.costPer }).from(inventoryItems).where(eq(inventoryItems.id, parsed.data.inventoryItemId)).limit(1);
      if (item?.costPer) {
        costSnapshot = String(item.costPer);
      }
    }

    const [part] = await db.insert(workOrderParts).values({
      workOrderId: id,
      inventoryItemId: parsed.data.inventoryItemId,
      partName: parsed.data.partName,
      quantity: parsed.data.quantity,
      costSnapshot: costSnapshot,
    }).returning();

    res.status(201).json(part);
  } catch (error) {
    console.error('[WorkOrders] Error adding part:', error);
    res.status(500).json({ error: 'Failed to add part' });
  }
});

// ==================== WORK ORDER ATTACHMENTS ====================

router.post('/:id/add-attachment', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const attachSchema = z.object({
      fileUrl: z.string().min(1),
      fileName: z.string().optional(),
    });

    const parsed = attachSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const userId = (req as any).user?.id;
    const [attachment] = await db.insert(workOrderAttachments).values({
      workOrderId: id,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      uploadedBy: userId,
    }).returning();

    res.status(201).json(attachment);
  } catch (error) {
    console.error('[WorkOrders] Error adding attachment:', error);
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

// ==================== PM-TO-WORK-ORDER GENERATION ====================

router.post('/generate-from-pm', requireAdmin, async (req: Request, res: Response) => {
  try {
    const pmSchema = z.object({
      scheduleId: z.number().int().positive(),
      assetId: z.string().uuid().optional(),
    });

    const parsed = pmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [schedule] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, parsed.data.scheduleId))
      .limit(1);

    if (!schedule) {
      return res.status(404).json({ error: 'Maintenance schedule not found' });
    }

    const userId = (req as any).user?.id;
    const title = `PM: ${schedule.equipment} - ${schedule.frequency} maintenance`;

    const [wo] = await db.insert(workOrders).values({
      assetId: parsed.data.assetId || null,
      type: 'preventive',
      title,
      description: schedule.description || `Scheduled ${schedule.frequency.toLowerCase()} maintenance for ${schedule.equipment}`,
      priority: 'medium',
      status: 'open',
      createdBy: userId,
      maintenanceScheduleId: schedule.id,
    }).returning();

    console.log(`[WorkOrders] Generated PM work order ${wo.id} from schedule ${schedule.id} (${schedule.equipment})`);
    res.status(201).json(wo);
  } catch (error) {
    console.error('[WorkOrders] Error generating PM work order:', error);
    res.status(500).json({ error: 'Failed to generate work order from PM schedule' });
  }
});

export { generateWorkOrderFromPM };

async function generateWorkOrderFromPM(scheduleId: number, assetId?: string, userId?: number): Promise<any> {
  try {
    const [schedule] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) {
      console.error(`[WorkOrders] PM schedule ${scheduleId} not found for WO generation`);
      return null;
    }

    const title = `PM: ${schedule.equipment} - ${schedule.frequency} maintenance`;
    const [wo] = await db.insert(workOrders).values({
      assetId: assetId || null,
      type: 'preventive',
      title,
      description: schedule.description || `Scheduled ${schedule.frequency.toLowerCase()} maintenance for ${schedule.equipment}`,
      priority: 'medium',
      status: 'open',
      createdBy: userId || null,
      maintenanceScheduleId: schedule.id,
    }).returning();

    console.log(`[WorkOrders] Auto-generated PM work order ${wo.id} from schedule ${schedule.id}`);
    return wo;
  } catch (error) {
    console.error('[WorkOrders] Error auto-generating PM work order:', error);
    return null;
  }
}

export default router;
