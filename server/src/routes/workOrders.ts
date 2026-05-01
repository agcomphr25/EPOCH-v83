import { Router, Request, Response, NextFunction } from 'express';
import { auditService } from '../services/auditService';
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
  insertLaborBudgetOverrideSchema,
  productionControlTemplates,
  wadProductionControls,
  wadDocumentLinks,
  partRoutings,
  travelers,
  travelerSteps,
  travelerTasks,
  insertWadProductionControlsSchema,
  type LaborBudgetOverride,
  type ProductionControlTemplate,
} from '../../schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireScopedCapability, ScopedForbiddenError } from '../permissions';
import { evaluateWorkOrderLaborStatus } from '../helpers/laborBudgetHelper';
import { evaluateWorkOrderReadiness } from '../lib/workOrderReadiness';
import {
  getProductionControlRecommendation,
  type WadContext,
  type ApprovedTemplateSummary,
} from '../services/productionControl/productionControlAI.service';

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
router.post('/:id/travelers/create', requirePermission('work_orders.release'), async (req: Request, res: Response) => {
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

const SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR'];

router.post(
  '/:id/approve-overrun',
  authenticateToken,
  requirePermission('work_orders.override_charges'),
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

      // Build overrun set from server data so scope context is never taken raw from req.body.
      const departmentBudgets = (wad.departmentBudgets as Record<string, number>) ?? {};
      const overrunDepts: string[] = [];
      for (const dept of Object.keys(departmentBudgets)) {
        const deptCheck = await evaluateWorkOrderLaborStatus(id, dept);
        if (deptCheck.status !== 'OK') overrunDepts.push(dept);
      }

      // Also evaluate overall WAD-level labor (null dept = total hours vs total budget)
      const overallLaborStatus = await evaluateWorkOrderLaborStatus(id, undefined);
      const wadHasGlobalOverrun = overallLaborStatus.status !== 'OK';

      // Derive the canonical department and final labor status from server data
      let canonicalDept: string | null;
      let laborStatus: typeof overallLaborStatus;

      if (parsed.data.department != null) {
        // Client named a specific department. Confirm it is in the server-computed overrun set.
        canonicalDept = overrunDepts.find(d => d === parsed.data.department) ?? null;
        if (canonicalDept === null) {
          return res.status(409).json({
            error: 'NO_OVERRUN_DETECTED',
            message: `No labor overrun detected for department "${parsed.data.department}" on this work order.`,
            overrunDepartments: overrunDepts,
          });
        }
        laborStatus = await evaluateWorkOrderLaborStatus(id, canonicalDept);
      } else {
        // No department specified — approve the overall WAD-level overrun.
        if (!wadHasGlobalOverrun && overrunDepts.length === 0) {
          return res.status(409).json({
            error: 'NO_OVERRUN_DETECTED',
            message: 'No labor overrun has been detected for this work order. Approval is not required.',
          });
        }
        canonicalDept = null;
        laborStatus = overallLaborStatus;
      }

      const requestingUser = (req as any).user as { id: number; role?: string } | undefined;
      await requireScopedCapability(
        requestingUser,
        'work_orders.override_charges',
        { department: canonicalDept, projectId: wad.projectId }
      );

      const approvedBy = supervisor.employeeCode
        ? `${supervisor.name} (${supervisor.employeeCode})`
        : supervisor.name;
      const approval = await storage.createLaborApproval({
        productionWorkOrderId: id,
        employeeId: parsed.data.employeeId.trim(),
        approvedBy,
        department: canonicalDept,
        reason: parsed.data.reason,
        hoursAtApproval: String(laborStatus.totalHours),
      });

      auditService.logEvent({
        entityType: 'work_order',
        entityId: id,
        action: 'LABOR_OVERRUN_APPROVED',
        actor: { id: supervisor.id, username: supervisor.name },
        reason: parsed.data.reason,
        meta: {
          supervisorEmployeeId: supervisor.id,
          supervisorName: supervisor.name,
          supervisorEmployeeCode: supervisor.employeeCode ?? undefined,
          department: canonicalDept ?? undefined,
          hoursAtApproval: laborStatus.totalHours,
          projectId: (wad as any).projectId ?? undefined,
        },
      }).catch(err => console.warn('[Audit] LABOR_OVERRUN_APPROVED log failed:', err?.message));

      return res.status(201).json({ approval, laborStatus });
    } catch (error: any) {
      if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
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
router.post('/:id/release', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
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

    const releasingUser = (req as any).user as { id: number; role?: string } | undefined;
    await requireScopedCapability(releasingUser, 'work_orders.release', { projectId: wad.projectId });

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

    const releasingActor = (req as any).user;
    auditService.logEvent({
      entityType: 'work_order',
      entityId: id,
      action: 'WORK_ORDER_RELEASED',
      actor: releasingActor
        ? { id: releasingActor.id, username: releasingActor.username, role: releasingActor.role }
        : undefined,
      fieldsChanged: {
        status: { before: wad.status, after: 'RELEASED' },
      },
      meta: {
        workOrderNumber: (wad as any).workOrderNumber ?? undefined,
        projectId: (wad as any).projectId ?? undefined,
      },
    }).catch(err => console.warn('[Audit] WORK_ORDER_RELEASED log failed:', err?.message));

    return res.json(updated);
  } catch (err: any) {
    if (err instanceof ScopedForbiddenError) return res.status(403).json(err.payload);
    console.error('[WorkOrders] Error releasing work order:', err);
    return res.status(500).json({ error: 'Failed to release work order', message: err?.message });
  }
});

// ==================== LABOR BUDGET OVERRIDE REQUEST WORKFLOW ====================

const SHIFT_UNLOCK_HOURS = 8; // approved override expires after one 8-hour shift

function validateProductionWadId(id: string, res: Response): boolean {
  if (!validateUuid(id)) {
    res.status(400).json({ error: 'Invalid production work order ID format', id });
    return false;
  }
  return true;
}

// POST /api/work-orders/production/:id/budget-overrides
// Operator creates a PENDING override request when blocked by budget exhaustion.
// Kiosk-mode: no session required, but operatorEmployeeId is validated against DB.
router.post('/production/:id/budget-overrides', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateProductionWadId(id, res)) return;

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const parsed = insertLaborBudgetOverrideSchema.safeParse({ ...req.body, productionWorkOrderId: id });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { operatorEmployeeId, operatorDisplayName, requestedHours, note } = parsed.data;

    // Validate operator identity against employees table to prevent fabricated requests
    const idRaw = operatorEmployeeId.trim();
    const isNumericId = /^\d+$/.test(idRaw);
    const [operatorRow] = await (isNumericId
      ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode })
          .from(employees)
          .where(eq(employees.id, parseInt(idRaw, 10)))
          .limit(1)
      : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode })
          .from(employees)
          .where(eq(employees.employeeCode, idRaw))
          .limit(1));

    if (!operatorRow) {
      return res.status(403).json({
        error: 'OPERATOR_NOT_FOUND',
        message: `No employee found with ID "${idRaw}". Cannot submit override request.`,
      });
    }

    // Canonical display name comes from DB, not client-supplied value
    const canonicalDisplayName = operatorRow.employeeCode
      ? `${operatorRow.name} (${operatorRow.employeeCode})`
      : operatorRow.name;

    // Only one PENDING request allowed per operator per WAD
    const existing = await storage.getPendingLaborBudgetOverrideByOperator(id, String(operatorRow.id));
    if (existing) {
      return res.status(409).json({
        error: 'OVERRIDE_REQUEST_ALREADY_PENDING',
        message: 'You already have a pending override request for this work order.',
        existingOverride: existing,
      });
    }

    const override = await storage.createLaborBudgetOverride({
      productionWorkOrderId: id,
      operatorEmployeeId: String(operatorRow.id),
      operatorDisplayName: canonicalDisplayName,
      requestedHours,
      note: note ?? null,
    });

    auditService.logEvent({
      entityType: 'work_order',
      entityId: id,
      action: 'LABOR_BUDGET_OVERRIDE_REQUESTED',
      actor: { id: operatorRow.id, username: operatorRow.name },
      meta: {
        overrideId: override.id,
        operatorEmployeeId: String(operatorRow.id),
        requestedHours,
        note: note ?? null,
      },
    }).catch(err => console.warn('[Audit] LABOR_BUDGET_OVERRIDE_REQUESTED log failed:', err?.message));

    return res.status(201).json({ override });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WorkOrders] Error creating budget override request:', err);
    return res.status(500).json({ error: 'Failed to create override request', message: msg });
  }
});

// GET /api/work-orders/production/:id/budget-overrides
// Supervisor (authenticated) fetches all requests.
// Authenticated operator may self-poll by providing operatorEmployeeId query param.
// Requires authentication — unauthenticated access is not permitted.
router.get('/production/:id/budget-overrides', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateProductionWadId(id, res)) return;

    const { operatorEmployeeId } = req.query;
    const authUser = req.user!;
    const SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
    const isSupervisor = SUPERVISOR_ROLES.includes(authUser.role);
    const overrides = await storage.getLaborBudgetOverridesByWorkOrder(id);

    if (operatorEmployeeId && typeof operatorEmployeeId === 'string') {
      // Non-supervisors: verify the requested filter resolves to the caller's own employee record
      if (!isSupervisor) {
        const callerEmpId = authUser.employeeId;
        if (callerEmpId == null) {
          return res.status(403).json({ error: 'IDENTITY_NOT_LINKED', message: 'Session is not linked to an employee record.' });
        }
        const paramTrimmed = operatorEmployeeId.trim();
        const isNumericParam = /^\d+$/.test(paramTrimmed);
        const paramNumericId = isNumericParam ? parseInt(paramTrimmed, 10) : null;
        // Allow if the param is the caller's own numeric ID; otherwise resolve by employee code
        if (paramNumericId !== callerEmpId) {
          const [empRow] = await db.select({ id: employees.id }).from(employees)
            .where(eq(employees.employeeCode, paramTrimmed)).limit(1);
          if (!empRow || empRow.id !== callerEmpId) {
            return res.status(403).json({ error: 'UNAUTHORIZED_FILTER', message: 'You may only query your own override requests.' });
          }
        }
      }
      return res.json(overrides.filter(o => o.operatorEmployeeId === operatorEmployeeId.trim()));
    }

    // Full list with no filter: supervisor-only
    if (!isSupervisor) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only supervisors and administrators may view all override requests.',
      });
    }
    return res.json(overrides);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WorkOrders] Error fetching budget overrides:', msg);
    return res.status(500).json({ error: 'Failed to fetch budget overrides', message: msg });
  }
});

// PATCH /api/work-orders/production/:id/budget-overrides/:overrideId
// Supervisor approves or denies an override request.
// supervisorEmployeeId is optional when the authenticated session can provide identity
const resolveOverrideBodySchema = z.object({
  action: z.enum(['APPROVED', 'DENIED']),
  // Only required if req.user.employeeId is null (e.g. in kiosk/dev-bypass scenarios)
  supervisorEmployeeId: z.string().min(1).optional(),
  supervisorNote: z.string().optional(),
  additionalHours: z.number().positive().optional(), // for approval, defaults to SHIFT_UNLOCK_HOURS
});

router.patch(
  '/production/:id/budget-overrides/:overrideId',
  authenticateToken,
  requirePermission('work_orders.approve_overrun'),
  async (req: Request, res: Response) => {
    try {
      const { id, overrideId } = req.params;
      if (!validateProductionWadId(id, res)) return;

      const overrideIdNum = parseInt(overrideId, 10);
      if (isNaN(overrideIdNum)) {
        return res.status(400).json({ error: 'Invalid overrideId' });
      }

      const parsed = resolveOverrideBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const override = await storage.getLaborBudgetOverrideById(overrideIdNum);
      if (!override) {
        return res.status(404).json({ error: 'Override request not found' });
      }
      if (override.productionWorkOrderId !== id) {
        return res.status(400).json({ error: 'Override request does not belong to this work order' });
      }
      if (override.status !== 'PENDING') {
        return res.status(409).json({
          error: 'OVERRIDE_ALREADY_RESOLVED',
          message: `Override request has already been ${override.status.toLowerCase()}.`,
        });
      }

      // ── Supervisor identity resolution ───────────────────────────────────
      // Primary source: authenticated session (req.user.employeeId).
      // Fallback (dev-bypass only, where employeeId is null): body supervisorEmployeeId.
      const authUser = req.user!;
      let supervisor: { id: number; name: string; employeeCode: string | null; userRole: string | null } | undefined;

      if (authUser.employeeId != null) {
        // Authenticated user has a linked employee record — use it directly
        const [emp] = await db
          .select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
          .from(employees)
          .where(eq(employees.id, authUser.employeeId))
          .limit(1);
        supervisor = emp;
        if (!supervisor) {
          return res.status(403).json({
            error: 'SUPERVISOR_NOT_FOUND',
            message: 'Authenticated user has no linked employee record.',
          });
        }
        // If caller also supplied a body supervisorEmployeeId, cross-check it matches
        if (parsed.data.supervisorEmployeeId) {
          const bodyIdRaw = parsed.data.supervisorEmployeeId.trim();
          const isNum = /^\d+$/.test(bodyIdRaw);
          const bodyMatchesAuth = isNum
            ? parseInt(bodyIdRaw, 10) === supervisor.id
            : bodyIdRaw === (supervisor.employeeCode ?? '');
          if (!bodyMatchesAuth) {
            return res.status(403).json({
              error: 'IDENTITY_MISMATCH',
              message: 'supervisorEmployeeId does not match the authenticated user. Omit it or provide your own ID.',
            });
          }
        }
      } else {
        // Dev-bypass or session without linked employee: fall back to body supervisorEmployeeId
        if (!parsed.data.supervisorEmployeeId) {
          return res.status(400).json({
            error: 'SUPERVISOR_ID_REQUIRED',
            message: 'supervisorEmployeeId is required when the session has no linked employee record.',
          });
        }
        const supervisorIdRaw = parsed.data.supervisorEmployeeId.trim();
        const isStrictNumericId = /^\d+$/.test(supervisorIdRaw);
        const [emp] = await (isStrictNumericId
          ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
              .from(employees)
              .where(eq(employees.id, parseInt(supervisorIdRaw, 10)))
              .limit(1)
          : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
              .from(employees)
              .where(eq(employees.employeeCode, supervisorIdRaw))
              .limit(1));
        supervisor = emp;
        if (!supervisor) {
          return res.status(403).json({
            error: 'SUPERVISOR_NOT_FOUND',
            message: `No employee found with ID "${supervisorIdRaw}".`,
          });
        }
      }

      const SUPERVISOR_ROLES_LIST = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
      if (!SUPERVISOR_ROLES_LIST.includes(supervisor.userRole ?? '')) {
        return res.status(403).json({
          error: 'INSUFFICIENT_SUPERVISOR_ROLE',
          message: `Employee "${supervisor.name}" does not have supervisor privileges.`,
        });
      }

      const { action, supervisorNote, additionalHours } = parsed.data;
      const supervisorDisplayName = supervisor.employeeCode
        ? `${supervisor.name} (${supervisor.employeeCode})`
        : supervisor.name;

      // Time-box the unlock: approved overrides expire at end of current shift
      let expiresAt: Date | null = null;
      if (action === 'APPROVED') {
        const unlockHours = additionalHours ?? SHIFT_UNLOCK_HOURS;
        expiresAt = new Date(Date.now() + unlockHours * 60 * 60 * 1000);
      }

      const resolved = await storage.resolveLaborBudgetOverride(
        overrideIdNum,
        action,
        String(supervisor.id),
        supervisorDisplayName,
        supervisorNote ?? null,
        expiresAt
      );

      auditService.logEvent({
        entityType: 'work_order',
        entityId: id,
        action: action === 'APPROVED' ? 'LABOR_BUDGET_OVERRIDE_APPROVED' : 'LABOR_BUDGET_OVERRIDE_DENIED',
        actor: { id: supervisor.id, username: supervisor.name },
        reason: supervisorNote,
        meta: {
          overrideId: overrideIdNum,
          operatorEmployeeId: override.operatorEmployeeId,
          operatorDisplayName: override.operatorDisplayName,
          requestedHours: override.requestedHours,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      }).catch(err => console.warn('[Audit] LABOR_BUDGET_OVERRIDE resolution log failed:', err?.message));

      return res.json({ override: resolved });
    } catch (err) {
      if (err instanceof ScopedForbiddenError) return res.status(403).json(err.payload);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WorkOrders] Error resolving budget override:', err);
      return res.status(500).json({ error: 'Failed to resolve override request', message: msg });
    }
  }
);

// ==================== PRODUCTION CONTROLS (WAD Step 6) ====================

const PRODUCTION_SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];

function isSupervisorForProduction(user: any): boolean {
  return user && PRODUCTION_SUPERVISOR_ROLES.includes(user.role);
}

/**
 * POST /api/work-orders/production/:id/production-controls/recommend
 * Fetches WAD context + APPROVED templates, calls AI, returns recommendation (no persistence).
 */
router.post(
  '/production/:id/production-controls/recommend',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { partType, productionType } = req.body as { partType: string; productionType: string };

      if (!partType || !productionType) {
        return res.status(400).json({ error: 'partType and productionType are required' });
      }

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) return res.status(404).json({ error: 'Work order not found' });

      // Fetch APPROVED templates
      const approvedTemplates: ProductionControlTemplate[] = await db
        .select()
        .from(productionControlTemplates)
        .where(eq(productionControlTemplates.approvalStatus, 'APPROVED'));

      const templateSummaries: ApprovedTemplateSummary[] = approvedTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        templateType: t.templateType,
        routingType: t.routingType,
        version: t.version,
      }));

      const wadContext: WadContext = {
        workOrderId: wad.id,
        workOrderNumber: wad.workOrderNumber,
        partNumber: wad.partNumber,
        description: wad.description,
        quantity: wad.quantity,
        partType,
        productionType,
      };

      const recommendation = await getProductionControlRecommendation(wadContext, templateSummaries);

      // Enrich suggested templates with name/version for display
      const enriched: Record<string, { id: string; name: string; version: number; templateType: string } | null> = {};
      for (const [key, templateId] of Object.entries(recommendation.suggestedTemplates)) {
        if (!templateId) { enriched[key] = null; continue; }
        const tmpl = approvedTemplates.find((t) => t.id === templateId);
        enriched[key] = tmpl
          ? { id: tmpl.id, name: tmpl.name, version: tmpl.version, templateType: tmpl.templateType }
          : null;
      }

      return res.json({ ...recommendation, suggestedTemplatesEnriched: enriched, availableTemplates: templateSummaries });
    } catch (err: unknown) {
      console.error('[ProductionControls] recommend error:', err);
      return res.status(500).json({ error: 'Failed to get recommendation' });
    }
  },
);

/**
 * GET /api/work-orders/production/:id/production-controls
 * Returns the persisted controls record for this WAD (if any).
 */
router.get(
  '/production/:id/production-controls',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [controls] = await db
        .select()
        .from(wadProductionControls)
        .where(eq(wadProductionControls.workOrderId, id))
        .limit(1);

      if (!controls) return res.status(404).json({ error: 'No production controls found for this WAD' });
      return res.json(controls);
    } catch (err: unknown) {
      console.error('[ProductionControls] get error:', err);
      return res.status(500).json({ error: 'Failed to fetch production controls' });
    }
  },
);

// Helper type for provisioning artifact summary
type ProvisionArtifact = {
  type: string;
  id: string | null;
  templateName: string | null;
  templateVersion: number | null;
};

type ProvisionSummary = {
  routingId?: string;
  travelerId?: string;
  travelerNumber?: string;
  travelerStepsCreated?: number;
  qcCheckpointsInjected?: number;
  workInstructionTemplateId?: string;
  workInstructionFileUrl?: string | null;
  specSheetTemplateId?: string;
  specSheetFileUrl?: string | null;
  artifacts: ProvisionArtifact[];
};

/**
 * POST /api/work-orders/production/:id/production-controls
 * Persists controls, runs provisioning pipeline atomically:
 *   (a) upsert controls record
 *   (b) create routing from APPROVED routing template
 *   (c) create traveler from APPROVED traveler template
 *   (d) inject QC checkpoints from APPROVED QC template
 *   (e) persist work instruction / spec sheet template links
 */
router.post(
  '/production/:id/production-controls',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) return res.status(404).json({ error: 'Work order not found' });
      if (wad.status !== 'PLANNED') {
        return res.status(400).json({ error: 'Production controls can only be set on WADs in PLANNED status' });
      }

      // Parse and validate body
      const bodySchema = insertWadProductionControlsSchema.extend({
        selectedTemplateIds: z.record(z.string(), z.string().nullable()).optional().nullable(),
      });
      const parsed = bodySchema.safeParse({ ...req.body, workOrderId: id });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      }

      const controls = parsed.data;

      // HIGH risk guard — requires supervisor role
      if (controls.aiRiskLevel === 'HIGH' && !isSupervisorForProduction(user)) {
        return res.status(403).json({
          error: 'HIGH risk jobs require supervisor or admin approval before generating artifacts.',
          riskLevel: 'HIGH',
        });
      }

      const selectedTemplateIds = (controls.selectedTemplateIds ?? {}) as Record<string, string | null>;

      // ── Pre-flight: required-control and template validation ────────────────
      // Map from selectedTemplateIds key → expected templateType
      const CONTROL_TYPE_MAP: Record<string, string> = {
        routing: 'ROUTING',
        traveler: 'TRAVELER',
        qc: 'QC',
        work_instruction: 'WORK_INSTRUCTION',
        spec_sheet: 'SPEC_SHEET',
      };

      // 1) Fail fast if any required control has no template ID
      const requiredFlags: { flag: boolean; key: string; expectedType: string }[] = [
        { flag: controls.routingRequired, key: 'routing', expectedType: 'ROUTING' },
        { flag: controls.travelerRequired, key: 'traveler', expectedType: 'TRAVELER' },
        {
          flag: controls.finalQcOnly || controls.inProcessInspectionRequired || controls.spotCheckPlanRequired,
          key: 'qc',
          expectedType: 'QC',
        },
        { flag: controls.workInstructionRequired, key: 'work_instruction', expectedType: 'WORK_INSTRUCTION' },
        { flag: controls.specSheetRequired, key: 'spec_sheet', expectedType: 'SPEC_SHEET' },
      ];
      const missingRequired = requiredFlags.filter(
        ({ flag, key }) => flag && !selectedTemplateIds[key],
      );
      if (missingRequired.length > 0) {
        return res.status(400).json({
          error: 'Missing required template selections. Select an APPROVED template for each required control.',
          missing: missingRequired.map(({ key, expectedType }) => ({ controlKey: key, expectedType })),
        });
      }

      // 2) Validate that every provided ID exists, is APPROVED, and matches its expected type.
      //    Also build a versioned map so we can persist {id, version} pairs for full traceability.
      const providedIdEntries = Object.entries(selectedTemplateIds).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      );
      // Map from controlKey → { id, version } — populated during validation, used when persisting
      const versionedTemplateIds: Record<string, { id: string; version: number }> = {};

      if (providedIdEntries.length > 0) {
        const fetchedTemplates = await db
          .select({
            id: productionControlTemplates.id,
            version: productionControlTemplates.version,
            approvalStatus: productionControlTemplates.approvalStatus,
            templateType: productionControlTemplates.templateType,
          })
          .from(productionControlTemplates)
          .where(inArray(productionControlTemplates.id, providedIdEntries.map(([, v]) => v)));

        const fetchedMap = new Map(fetchedTemplates.map((t) => [t.id, t]));
        const validationErrors: string[] = [];

        for (const [key, templateId] of providedIdEntries) {
          const tmpl = fetchedMap.get(templateId);
          if (!tmpl) {
            validationErrors.push(`Template ID ${templateId} (${key}) does not exist`);
          } else if (tmpl.approvalStatus !== 'APPROVED') {
            validationErrors.push(
              `Template ${templateId} (${key}) is not APPROVED (status: ${tmpl.approvalStatus})`,
            );
          } else {
            const expectedType = CONTROL_TYPE_MAP[key];
            if (expectedType && tmpl.templateType !== expectedType) {
              validationErrors.push(
                `Template ${templateId} (${key}) has wrong type: expected ${expectedType}, got ${tmpl.templateType}`,
              );
            } else {
              versionedTemplateIds[key] = { id: tmpl.id, version: tmpl.version ?? 1 };
            }
          }
        }

        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: 'Template validation failed',
            details: validationErrors,
          });
        }
      }

      // ── Phase 1: Atomic — controls record + routing + WI/SS doc links ────────
      // Traveler creation happens in Phase 2 so it can reuse storage.generateTravelerFromRouting.
      const provisionSummary: ProvisionSummary = { artifacts: [] };
      let createdRoutingId: string | null = null;

      await db.transaction(async (tx) => {
        // (a) Upsert controls record
        const [existingCtrl] = await tx
          .select({ id: wadProductionControls.id })
          .from(wadProductionControls)
          .where(eq(wadProductionControls.workOrderId, id))
          .limit(1);

        const controlData = {
          workOrderId: id,
          partType: controls.partType,
          productionType: controls.productionType,
          routingRequired: controls.routingRequired,
          travelerRequired: controls.travelerRequired,
          workInstructionRequired: controls.workInstructionRequired,
          specSheetRequired: controls.specSheetRequired,
          finalQcOnly: controls.finalQcOnly,
          inProcessInspectionRequired: controls.inProcessInspectionRequired,
          spotCheckPlanRequired: controls.spotCheckPlanRequired,
          certRequired: controls.certRequired,
          aiReason: controls.aiReason ?? null,
          aiConfidenceScore: controls.aiConfidenceScore ?? null,
          aiRiskLevel: controls.aiRiskLevel ?? null,
          // Store {id, version} pairs for full traceability, not bare IDs
          selectedTemplateIds: Object.keys(versionedTemplateIds).length > 0 ? versionedTemplateIds : (controls.selectedTemplateIds ?? null),
        };

        if (existingCtrl) {
          await tx.update(wadProductionControls).set(controlData).where(eq(wadProductionControls.workOrderId, id));
        } else {
          await tx.insert(wadProductionControls).values(controlData);
        }

        // (b) Create routing from APPROVED ROUTING template
        const routingTemplateId = selectedTemplateIds['routing'] ?? null;

        if (controls.routingRequired && routingTemplateId) {
          const [tmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, routingTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'ROUTING'),
              ),
            )
            .limit(1);

          if (tmpl?.data) {
            const tmplData = tmpl.data as Record<string, unknown>;
            const [newRouting] = await tx
              .insert(partRoutings)
              .values({
                inventoryItemId: wad.partNumber,
                partNumber: wad.partNumber,
                partName: wad.description ?? wad.partNumber,
                routingType: (tmplData.routingType as string) ?? 'COMPOSITE',
                departmentSequence: (tmplData.departmentSequence as string[]) ?? [],
                traceabilityConfig: (tmplData.traceabilityConfig ?? {}) as Record<string, unknown>,
                departmentConfig: (tmplData.departmentConfig ?? {}) as Record<string, unknown>,
                createdFromTemplateId: tmpl.id,
                createdFromTemplateVersion: tmpl.version,
                createdBy: user?.username ?? 'system',
              })
              .returning({ id: partRoutings.id });

            createdRoutingId = newRouting.id;
            provisionSummary.routingId = newRouting.id;
            provisionSummary.artifacts.push({
              type: 'routing',
              id: newRouting.id,
              templateName: tmpl.name,
              templateVersion: tmpl.version,
            });
          }
        }

        // (e) Persist work instruction / spec sheet template links
        const wiTemplateId = selectedTemplateIds['work_instruction'] ?? null;
        const ssTemplateId = selectedTemplateIds['spec_sheet'] ?? null;

        if (wiTemplateId) {
          const [wiTmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, wiTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'WORK_INSTRUCTION'),
              ),
            )
            .limit(1);
          if (wiTmpl) {
            provisionSummary.workInstructionTemplateId = wiTmpl.id;
            provisionSummary.workInstructionFileUrl = wiTmpl.fileUrl;
            provisionSummary.artifacts.push({
              type: 'work_instruction',
              id: wiTmpl.id,
              templateName: wiTmpl.name,
              templateVersion: wiTmpl.version,
            });
            await tx.insert(wadDocumentLinks).values({
              workOrderId: id,
              templateId: wiTmpl.id,
              templateVersion: wiTmpl.version,
              templateType: 'WORK_INSTRUCTION',
              templateName: wiTmpl.name,
              fileUrl: wiTmpl.fileUrl ?? null,
            });
          }
        }

        if (ssTemplateId) {
          const [ssTmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, ssTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'SPEC_SHEET'),
              ),
            )
            .limit(1);
          if (ssTmpl) {
            provisionSummary.specSheetTemplateId = ssTmpl.id;
            provisionSummary.specSheetFileUrl = ssTmpl.fileUrl;
            provisionSummary.artifacts.push({
              type: 'spec_sheet',
              id: ssTmpl.id,
              templateName: ssTmpl.name,
              templateVersion: ssTmpl.version,
            });
            await tx.insert(wadDocumentLinks).values({
              workOrderId: id,
              templateId: ssTmpl.id,
              templateVersion: ssTmpl.version,
              templateType: 'SPEC_SHEET',
              templateName: ssTmpl.name,
              fileUrl: ssTmpl.fileUrl ?? null,
            });
          }
        }
      });

      // ── Phase 2: Traveler creation via established storage pipeline ───────────
      // When a routing exists, delegate to storage.generateTravelerFromRouting so
      // step-generation logic stays in one canonical place (avoids drift).
      // When no routing was created, fall back to materialising from traveler template JSON.
      let createdTravelerId: string | null = null;
      const travelerTemplateId = selectedTemplateIds['traveler'] ?? null;

      if (controls.travelerRequired) {
        // Fetch the traveler template (for version stamping or JSON-fallback steps)
        let travelerTmpl: (typeof productionControlTemplates.$inferSelect) | null = null;
        if (travelerTemplateId) {
          const [row] = await db
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, travelerTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'TRAVELER'),
              ),
            )
            .limit(1);
          travelerTmpl = row ?? null;
        }

        if (createdRoutingId) {
          // ── Primary path: reuse the established generateTravelerFromRouting pipeline
          const generatedTraveler = await storage.generateTravelerFromRouting(createdRoutingId, {
            quantity: wad.quantity ?? 1,
            createdBy: user?.username ?? 'system',
          });
          // Link the traveler to the WAD
          await storage.linkTravelerToProductionWorkOrder(generatedTraveler.id, wad.id);
          createdTravelerId = generatedTraveler.id;

          // Stamp traveler template traceability on the traveler if one was selected
          if (travelerTmpl) {
            await db
              .update(travelers)
              .set({
                createdFromTemplateId: travelerTmpl.id,
                createdFromTemplateVersion: travelerTmpl.version,
              })
              .where(eq(travelers.id, createdTravelerId));
          }
        } else if (travelerTmpl?.data) {
          // ── Fallback: no routing — materialise steps directly from traveler template JSON
          const travelerNumber = `T-${wad.workOrderNumber}-${Date.now().toString(36).toUpperCase()}`;
          const [newTraveler] = await db
            .insert(travelers)
            .values({
              travelerNumber,
              partNumber: wad.partNumber,
              partName: wad.description ?? wad.partNumber,
              productionWorkOrderId: wad.id,
              quantity: wad.quantity ?? 1,
              status: 'DRAFT',
              partRoutingId: null,
              createdFromTemplateId: travelerTmpl.id,
              createdFromTemplateVersion: travelerTmpl.version,
              createdBy: user?.username ?? 'system',
            })
            .returning({ id: travelers.id, travelerNumber: travelers.travelerNumber });

          createdTravelerId = newTraveler.id;

          type TmplTask = { phase?: string; title: string; taskType?: string; instructions?: string };
          type TmplStep = { departmentName: string; tasks?: TmplTask[] };
          const travelerTmplData = travelerTmpl.data as { steps?: TmplStep[] };
          const tmplSteps = travelerTmplData.steps ?? [];

          for (let si = 0; si < tmplSteps.length; si++) {
            const step = tmplSteps[si];
            const [newStep] = await db
              .insert(travelerSteps)
              .values({
                travelerId: newTraveler.id,
                departmentName: step.departmentName,
                stepNumber: si + 1,
                status: 'NOT_STARTED',
              })
              .returning({ id: travelerSteps.id });

            const stepTasks = step.tasks ?? [];
            for (let ti = 0; ti < stepTasks.length; ti++) {
              const task = stepTasks[ti];
              await db.insert(travelerTasks).values({
                travelerStepId: newStep.id,
                taskType: task.taskType ?? 'GENERAL',
                taskPhase: task.phase ?? 'WORK',
                title: task.title,
                instructions: task.instructions ?? null,
                required: true,
                sortOrder: ti,
                status: 'NOT_STARTED',
                templateSourceId: travelerTmpl.id,
              });
            }
          }

          provisionSummary.travelerStepsCreated = tmplSteps.length;
        }

        if (createdTravelerId) {
          const [createdTravelerRow] = await db
            .select({ id: travelers.id, travelerNumber: travelers.travelerNumber })
            .from(travelers)
            .where(eq(travelers.id, createdTravelerId))
            .limit(1);
          if (createdTravelerRow) {
            provisionSummary.travelerId = createdTravelerRow.id;
            provisionSummary.travelerNumber = createdTravelerRow.travelerNumber;
            provisionSummary.artifacts.push({
              type: 'traveler',
              id: createdTravelerRow.id,
              templateName: travelerTmpl?.name ?? null,
              templateVersion: travelerTmpl?.version ?? null,
            });
          }

          // ── Phase 3: QC checkpoint injection into traveler steps ─────────────
          const qcTemplateId = selectedTemplateIds['qc'] ?? null;
          if (qcTemplateId) {
            const [qcTmpl] = await db
              .select()
              .from(productionControlTemplates)
              .where(
                and(
                  eq(productionControlTemplates.id, qcTemplateId),
                  eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                  eq(productionControlTemplates.templateType, 'QC'),
                ),
              )
              .limit(1);

            if (qcTmpl?.data) {
              type QcCheckpoint = { title: string; type?: string; instructions?: string };
              const qcData = qcTmpl.data as { checkpoints?: QcCheckpoint[] };
              const checkpoints = qcData.checkpoints ?? [];

              if (checkpoints.length > 0) {
                const [qcStep] = await db
                  .insert(travelerSteps)
                  .values({
                    travelerId: createdTravelerId,
                    departmentName: 'QC',
                    stepNumber: 999,
                    status: 'NOT_STARTED',
                  })
                  .returning({ id: travelerSteps.id });

                for (let i = 0; i < checkpoints.length; i++) {
                  const cp = checkpoints[i];
                  await db.insert(travelerTasks).values({
                    travelerStepId: qcStep.id,
                    taskType: cp.type ?? 'QC_CHECKPOINT',
                    taskPhase: 'WORK',
                    title: cp.title,
                    instructions: cp.instructions ?? null,
                    required: true,
                    sortOrder: i,
                    status: 'NOT_STARTED',
                    templateSourceId: qcTmpl.id,
                  });
                }

                provisionSummary.qcCheckpointsInjected = checkpoints.length;
                provisionSummary.artifacts.push({
                  type: 'qc_plan',
                  id: qcStep.id,
                  templateName: qcTmpl.name,
                  templateVersion: qcTmpl.version,
                });
              }
            }
          }
        }
      }

      // ── Final stamp: provisionedAt + summary ──────────────────────────────────
      const [finalControls] = await db
        .update(wadProductionControls)
        .set({
          provisionedAt: new Date(),
          provisionSummary: provisionSummary as Record<string, unknown>,
        })
        .where(eq(wadProductionControls.workOrderId, id))
        .returning();

      return res.status(201).json({ controls: finalControls, provisionSummary });
    } catch (err: unknown) {
      console.error('[ProductionControls] provision error:', err);
      return res.status(500).json({ error: 'Failed to provision production controls' });
    }
  },
);

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
