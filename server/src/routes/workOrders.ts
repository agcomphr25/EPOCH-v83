import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import {
  workOrders,
  workOrderParts,
  workOrderAttachments,
  assets,
  inventoryItems,
  users,
  maintenanceSchedules,
  productionWorkOrders,
  employees,
  insertWorkOrderSchema,
  insertWorkOrderPartSchema,
  insertWorkOrderAttachmentSchema,
  insertProductionWorkOrderSchema,
  insertLaborThresholdSettingsSchema,
} from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import { evaluateWorkOrderLaborStatus } from '../helpers/laborBudgetHelper';
import { evaluateWorkOrderReadiness } from '../lib/workOrderReadiness';

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const supervisorRoles = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
  if (!user || !supervisorRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Supervisor or admin access required to approve labor overruns' });
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

// ==================== PRODUCTION WORK ORDER (WAD) TRAVELER ENDPOINTS ====================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

// POST /api/work-orders/:id/travelers/create — create a traveler from a WAD using its part routing
router.post('/:id/travelers/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const user = (req as any).user;
    const createdBy = req.body?.createdBy ?? user?.username ?? user?.id ?? 'system';

    let traveler: Awaited<ReturnType<typeof storage.createTravelerFromProductionWorkOrder>>;
    try {
      traveler = await storage.createTravelerFromProductionWorkOrder(id, String(createdBy));
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_TRAVELER') {
        return res.status(409).json({
          error: 'A traveler already exists for this work order',
          travelerId: err.travelerId,
        });
      }
      if (err?.code === 'NO_ROUTING') {
        return res.status(400).json({ error: err.message });
      }
      if (err?.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }

    return res.status(201).json({
      id: traveler.id,
      travelerNumber: traveler.travelerNumber,
      productionWorkOrderId: traveler.productionWorkOrderId,
      partNumber: traveler.partNumber,
      status: traveler.status,
      partRoutingId: traveler.partRoutingId,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error creating traveler from WAD:', error);
    return res.status(500).json({ error: 'Failed to create traveler', message: error.message });
  }
});

// GET /api/work-orders/:id/travelers — return all travelers linked to a production WAD (newest first)
router.get('/:id/travelers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const linkedTravelers = await storage.getTravelersByProductionWorkOrderId(id);
    res.json(linkedTravelers);
  } catch (error: any) {
    console.error('Error fetching travelers for production work order:', error);
    res.status(500).json({ error: 'Failed to fetch travelers', message: error.message });
  }
});

// POST /api/work-orders/:id/travelers/:travelerId/link — link an existing traveler to a WAD
router.post('/:id/travelers/:travelerId/link', async (req: Request, res: Response) => {
  try {
    const { id, travelerId } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }
    if (!validateUuid(travelerId)) {
      return res.status(400).json({ error: 'Invalid traveler ID format', travelerId });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found', travelerId });
    }

    const updated = await storage.linkTravelerToProductionWorkOrder(travelerId, id);
    res.json(updated);
  } catch (error: any) {
    console.error('Error linking traveler to production work order:', error);
    res.status(500).json({ error: 'Failed to link traveler', message: error.message });
  }
});

// DELETE /api/work-orders/:id/travelers/:travelerId/link — unlink a traveler from a WAD
router.delete('/:id/travelers/:travelerId/link', async (req: Request, res: Response) => {
  try {
    const { id, travelerId } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }
    if (!validateUuid(travelerId)) {
      return res.status(400).json({ error: 'Invalid traveler ID format', travelerId });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found', travelerId });
    }

    if (traveler.productionWorkOrderId !== id) {
      return res.status(400).json({
        error: 'Traveler is not linked to this production work order',
        travelerId,
        linkedWorkOrderId: traveler.productionWorkOrderId,
      });
    }

    const updated = await storage.unlinkTravelerFromProductionWorkOrder(travelerId);
    res.json(updated);
  } catch (error: any) {
    console.error('Error unlinking traveler from production work order:', error);
    res.status(500).json({ error: 'Failed to unlink traveler', message: error.message });
  }
});

// ==================== PRODUCTION WORK ORDER LABOR BUDGET ====================

const approveOverrunBodySchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  supervisorEmployeeId: z.string().min(1, 'supervisorEmployeeId is required'),
  reason: z.string().min(1, 'reason is required'),
  department: z.string().optional(),
});

const SUPERVISOR_ROLES = ['ADMIN', 'OWNER'];

router.post(
  '/:id/approve-overrun',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateUuid(id)) {
        return res.status(400).json({ error: 'Invalid production work order ID format', id });
      }

      const parsed = approveOverrunBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const supervisorIdRaw = parsed.data.supervisorEmployeeId.trim();

      // Validate the supervisor by employee code or strict numeric ID.
      // Use /^\d+$/ to require exact numeric format — prevents "12abc" from matching employee 12.
      const isStrictNumericId = /^\d+$/.test(supervisorIdRaw);
      const supervisorQuery = isStrictNumericId
        ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
            .from(employees)
            .where(eq(employees.id, parseInt(supervisorIdRaw, 10)))
            .limit(1)
        : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
            .from(employees)
            .where(eq(employees.employeeCode, supervisorIdRaw))
            .limit(1);

      const [supervisor] = await supervisorQuery;

      if (!supervisor) {
        return res.status(403).json({
          error: 'SUPERVISOR_NOT_FOUND',
          message: `No employee found with ID "${supervisorIdRaw}". Please enter a valid supervisor employee ID.`,
        });
      }

      if (!SUPERVISOR_ROLES.includes(supervisor.userRole)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_SUPERVISOR_ROLE',
          message: `Employee "${supervisor.name}" does not have supervisor or admin privileges to approve labor overruns.`,
        });
      }

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) {
        return res.status(404).json({ error: 'Production work order not found' });
      }

      const approvedBy = supervisor.employeeCode
        ? `${supervisor.name} (${supervisor.employeeCode})`
        : supervisor.name;

      const laborStatus = await evaluateWorkOrderLaborStatus(id, parsed.data.department);
      const approval = await storage.createLaborApproval({
        productionWorkOrderId: id,
        employeeId: parsed.data.employeeId.trim(),
        approvedBy,
        department: parsed.data.department ?? null,
        reason: parsed.data.reason,
        hoursAtApproval: String(laborStatus.totalHours),
      });

      return res.status(201).json({ approval, laborStatus });
    } catch (error: any) {
      console.error('[WorkOrders] Error creating labor approval:', error);
      return res.status(500).json({ error: 'Failed to create labor approval', message: error.message });
    }
  }
);

router.get('/:id/labor-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { department } = req.query;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const laborStatus = await evaluateWorkOrderLaborStatus(id, department ? String(department) : undefined);
    const latestApproval = await storage.getLatestLaborApprovalByWorkOrder(id);
    return res.json({
      workOrderId: id,
      ...laborStatus,
      latestApprovalId: latestApproval?.id ?? null,
      latestApprovalAt: latestApproval?.approvedAt ?? null,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error fetching labor status:', error);
    return res.status(500).json({ error: 'Failed to fetch labor status', message: error.message });
  }
});

// ==================== LABOR THRESHOLD SETTINGS (system-wide) ====================

router.get('/production/labor-settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getLaborThresholdSettings();
    if (!settings) {
      return res.json({
        warningThreshold: '0.8',
        blockedThreshold: '1.0',
        isDefault: true,
      });
    }
    return res.json({ ...settings, isDefault: false });
  } catch (error: any) {
    console.error('[WorkOrders] Error fetching labor threshold settings:', error);
    return res.status(500).json({ error: 'Failed to fetch labor threshold settings', message: error.message });
  }
});

router.put('/production/labor-settings', authenticateToken, requireSupervisorOrAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertLaborThresholdSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid threshold values', details: parsed.error.flatten() });
    }

    const { warningThreshold, blockedThreshold } = parsed.data;
    const warning = parseFloat(warningThreshold);
    const blocked = parseFloat(blockedThreshold);

    if (warning <= 0 || warning >= blocked) {
      return res.status(400).json({ error: 'warningThreshold must be positive and less than blockedThreshold' });
    }

    const settings = await storage.upsertLaborThresholdSettings(warningThreshold, blockedThreshold);
    return res.json(settings);
  } catch (error: any) {
    console.error('[WorkOrders] Error updating labor threshold settings:', error);
    return res.status(500).json({ error: 'Failed to update labor threshold settings', message: error.message });
  }
});

// ==================== PER-WORK-ORDER THRESHOLD OVERRIDE ====================

router.patch('/production/:id/labor-thresholds', authenticateToken, requireSupervisorOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const patchSchema = z.object({
      warningThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').nullable().optional(),
      blockedThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').nullable().optional(),
    }).refine(
      (data) => {
        const hasWarning = data.warningThreshold !== undefined;
        const hasBlocked = data.blockedThreshold !== undefined;
        return hasWarning === hasBlocked;
      },
      { message: 'warningThreshold and blockedThreshold must be provided or cleared together' }
    );

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid threshold values', details: parsed.error.flatten() });
    }

    const { warningThreshold, blockedThreshold } = parsed.data;

    const [existing] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const newWarning = warningThreshold !== undefined ? warningThreshold : existing.warningThreshold;
    const newBlocked = blockedThreshold !== undefined ? blockedThreshold : existing.blockedThreshold;

    if (newWarning != null && newBlocked != null) {
      const w = parseFloat(String(newWarning));
      const b = parseFloat(String(newBlocked));
      if (w <= 0 || w >= b) {
        return res.status(400).json({ error: 'warningThreshold must be positive and less than blockedThreshold' });
      }
    }

    const [updated] = await db
      .update(productionWorkOrders)
      .set({
        warningThreshold: newWarning,
        blockedThreshold: newBlocked,
        updatedAt: new Date(),
      })
      .where(eq(productionWorkOrders.id, id))
      .returning();

    return res.json({
      id: updated.id,
      warningThreshold: updated.warningThreshold,
      blockedThreshold: updated.blockedThreshold,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error updating work order labor thresholds:', error);
    return res.status(500).json({ error: 'Failed to update labor thresholds', message: error.message });
  }
});

// ==================== WAD RELEASE GATE ====================

// POST /api/work-orders/:id/release — evaluate readiness and flip WAD to RELEASED
router.post('/:id/release', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    if (wad.status === 'RELEASED') {
      return res.status(400).json({ error: 'Work order is already released to the floor' });
    }

    if (wad.status === 'IN_PROGRESS' || wad.status === 'COMPLETE' || wad.status === 'CLOSED') {
      return res.status(400).json({ error: `Cannot release a work order with status: ${wad.status}` });
    }

    const readiness = await evaluateWorkOrderReadiness(id);

    if (readiness.status !== 'READY') {
      return res.status(400).json({
        error: 'Work order not ready for release to floor',
        readiness,
      });
    }

    const updated = await storage.updateWorkOrderStatus(id, 'RELEASED');
    console.log(`[WorkOrders] WAD ${id} released to floor`);
    return res.json(updated);
  } catch (err: any) {
    console.error('[WorkOrders] Error releasing work order:', err);
    return res.status(500).json({ error: 'Failed to release work order', message: err?.message });
  }
});

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
