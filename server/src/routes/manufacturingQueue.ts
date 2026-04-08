import { Router } from 'express';
import { db } from '../../db';
import { manufacturingQueue, inventoryItems, supplySourceDashboardToLegacyDept, getDashboardCategories } from '../../schema';
import type { SupplySourceDashboard } from '../../schema';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { insertManufacturingQueueSchema } from '../../schema';
import { evaluateQueueReadiness } from '../services/queueReadinessService';
import { generateRequirementsFromRouting } from '../services/requirementGeneratorService';

const router = Router();

// Get manufacturing queue items.
// DEMAND ROUTING — additive signal for `?department=` queries:
// When `?department=<legacyDept>` is provided, records are matched by:
//   (a) department = <legacyDept>  (legacy filter, backward-compatible)
//   (b) OR inventoryItems.manufacturedCategory IN [categories for that dept]
// This ensures BOM-exploded records with a category classification appear in the
// right dashboard even if the department string hasn't been back-filled.
// The same OR logic applies when a `?dashboard=` (SupplySourceDashboard) param is used.
router.get('/', async (req, res) => {
  try {
    const { department, status, dashboard, queueType } = req.query;

    // Resolve routing signal — additive OR of dept and category matches
    let routingSignal: ReturnType<typeof eq> | ReturnType<typeof or> | undefined;

    const VALID_DASHBOARDS: SupplySourceDashboard[] = ['CUTTING_TABLE', 'CNC', 'CORE', 'ASSEMBLY'];

    if (dashboard && typeof dashboard === 'string') {
      // Strict validation — reject unknown dashboard values
      if (!VALID_DASHBOARDS.includes(dashboard as SupplySourceDashboard)) {
        return res.status(400).json({ error: `Invalid dashboard value: ${dashboard}. Valid: ${VALID_DASHBOARDS.join(', ')}` });
      }
      const dash = dashboard as SupplySourceDashboard;
      const legacyDept = supplySourceDashboardToLegacyDept(dash);
      const categories = getDashboardCategories(dash);
      if (legacyDept) {
        routingSignal = categories.length > 0
          ? or(eq(manufacturingQueue.department, legacyDept), inArray(inventoryItems.manufacturedCategory, categories))
          : eq(manufacturingQueue.department, legacyDept);
      }
    } else if (department && typeof department === 'string') {
      // Legacy dept param — also match by category for this dept via getDashboardCategories
      // Reverse-lookup from legacy dept name to dashboard, then get categories
      const matchedDash = VALID_DASHBOARDS.find(d => supplySourceDashboardToLegacyDept(d) === department);
      const categories = matchedDash ? getDashboardCategories(matchedDash) : [];
      routingSignal = categories.length > 0
        ? or(eq(manufacturingQueue.department, department), inArray(inventoryItems.manufacturedCategory, categories))
        : eq(manufacturingQueue.department, department);
    }

    const statusFilter = (status && typeof status === 'string')
      ? eq(manufacturingQueue.status, status)
      : undefined;

    const queueTypeFilter = (queueType && typeof queueType === 'string')
      ? eq(manufacturingQueue.queueType, queueType)
      : undefined;

    const filters = [routingSignal, statusFilter, queueTypeFilter].filter(Boolean);
    const whereClause = filters.length > 1 ? and(...(filters as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
      : filters[0];

    const baseQuery = db
      .select({
        id: manufacturingQueue.id,
        inventoryItemId: manufacturingQueue.inventoryItemId,
        department: manufacturingQueue.department,
        parentProductionOrderId: manufacturingQueue.parentProductionOrderId,
        quantityRequested: manufacturingQueue.quantityRequested,
        quantityCompleted: manufacturingQueue.quantityCompleted,
        priority: manufacturingQueue.priority,
        status: manufacturingQueue.status,
        dueDate: manufacturingQueue.dueDate,
        requestedBy: manufacturingQueue.requestedBy,
        assignedTo: manufacturingQueue.assignedTo,
        notes: manufacturingQueue.notes,
        startedAt: manufacturingQueue.startedAt,
        completedAt: manufacturingQueue.completedAt,
        releasedAt: manufacturingQueue.releasedAt,
        createdAt: manufacturingQueue.createdAt,
        updatedAt: manufacturingQueue.updatedAt,
        queueType: manufacturingQueue.queueType,
        readinessStatus: manufacturingQueue.readinessStatus,
        percentReady: manufacturingQueue.percentReady,
        blockedReason: manufacturingQueue.blockedReason,
        inventoryItem: {
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          type: inventoryItems.type,
          manufacturedCategory: inventoryItems.manufacturedCategory,
          manufacturingDepartment: inventoryItems.manufacturingDepartment,
          notes: inventoryItems.notes,
        },
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id));

    const items = whereClause
      ? await baseQuery.where(whereClause).orderBy(manufacturingQueue.priority, manufacturingQueue.dueDate)
      : await baseQuery.orderBy(manufacturingQueue.priority, manufacturingQueue.dueDate);

    res.json(items);
  } catch (error) {
    console.error('Error fetching manufacturing queue:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing queue' });
  }
});

// Get manufacturing queue items by supplySourceDashboard signal.
// DEMAND ROUTING: a record belongs to a dashboard when:
//   (a) manufacturing_queue.department matches the legacy dept name for this dashboard, OR
//   (b) inventoryItems.manufacturedCategory is in the category set for this dashboard
// Using both conditions ensures both legacy records and BOM-exploded records appear.
// Valid dashboard values: CUTTING_TABLE | CNC | ASSEMBLY | CORE
router.get('/by-dashboard/:dashboard', async (req, res) => {
  try {
    const dashboard = req.params.dashboard as SupplySourceDashboard;
    const legacyDept = supplySourceDashboardToLegacyDept(dashboard);
    if (!legacyDept) {
      return res.status(400).json({ error: `Unknown supplySourceDashboard: ${dashboard}` });
    }

    const categories = getDashboardCategories(dashboard);

    // Additive routing signal: dept match OR category match
    const routingSignal = categories.length > 0
      ? or(
          eq(manufacturingQueue.department, legacyDept),
          inArray(inventoryItems.manufacturedCategory, categories)
        )
      : eq(manufacturingQueue.department, legacyDept);

    const { status } = req.query;
    const whereClause = (status && typeof status === 'string')
      ? and(routingSignal, eq(manufacturingQueue.status, status))
      : routingSignal;

    const items = await db
      .select({
        id: manufacturingQueue.id,
        inventoryItemId: manufacturingQueue.inventoryItemId,
        department: manufacturingQueue.department,
        parentProductionOrderId: manufacturingQueue.parentProductionOrderId,
        quantityRequested: manufacturingQueue.quantityRequested,
        quantityCompleted: manufacturingQueue.quantityCompleted,
        priority: manufacturingQueue.priority,
        status: manufacturingQueue.status,
        dueDate: manufacturingQueue.dueDate,
        notes: manufacturingQueue.notes,
        requestedBy: manufacturingQueue.requestedBy,
        assignedTo: manufacturingQueue.assignedTo,
        startedAt: manufacturingQueue.startedAt,
        completedAt: manufacturingQueue.completedAt,
        createdAt: manufacturingQueue.createdAt,
        updatedAt: manufacturingQueue.updatedAt,
        inventoryItem: {
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
          itemType: inventoryItems.itemType,
          manufacturedCategory: inventoryItems.manufacturedCategory,
        },
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(whereClause)
      .orderBy(manufacturingQueue.priority, manufacturingQueue.dueDate);

    res.json(items.map(item => ({
      ...item,
      supplySourceDashboard: dashboard,
    })));
  } catch (error) {
    console.error('Error fetching manufacturing queue by dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing queue' });
  }
});

// Get a single manufacturing queue item by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const item = await db
      .select({
        id: manufacturingQueue.id,
        inventoryItemId: manufacturingQueue.inventoryItemId,
        department: manufacturingQueue.department,
        quantityRequested: manufacturingQueue.quantityRequested,
        quantityCompleted: manufacturingQueue.quantityCompleted,
        priority: manufacturingQueue.priority,
        status: manufacturingQueue.status,
        dueDate: manufacturingQueue.dueDate,
        requestedBy: manufacturingQueue.requestedBy,
        assignedTo: manufacturingQueue.assignedTo,
        notes: manufacturingQueue.notes,
        startedAt: manufacturingQueue.startedAt,
        completedAt: manufacturingQueue.completedAt,
        createdAt: manufacturingQueue.createdAt,
        updatedAt: manufacturingQueue.updatedAt,
        inventoryItem: {
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          type: inventoryItems.type,
          manufacturingDepartment: inventoryItems.manufacturingDepartment,
        },
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(eq(manufacturingQueue.id, id))
      .limit(1);
    
    if (item.length === 0) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(item[0]);
  } catch (error) {
    console.error('Error fetching manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing queue item' });
  }
});

// Create a new manufacturing queue item
router.post('/', async (req, res) => {
  try {
    const validatedData = insertManufacturingQueueSchema.parse(req.body);
    
    const [newItem] = await db
      .insert(manufacturingQueue)
      .values(validatedData)
      .returning();

    // Auto-generate allocation requirements from routing (best-effort, non-blocking)
    const routingId: string | undefined = req.body.partRoutingId ?? undefined;
    generateRequirementsFromRouting(newItem.id, routingId).catch(err =>
      console.warn(`[manufacturingQueue] auto-generate requirements failed for queue ${newItem.id}:`, err.message)
    );

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating manufacturing queue item:', error);
    res.status(400).json({ error: 'Failed to create manufacturing queue item' });
  }
});

// Update a manufacturing queue item
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertManufacturingQueueSchema.partial().parse(req.body);
    
    const [updatedItem] = await db
      .update(manufacturingQueue)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(manufacturingQueue.id, id))
      .returning();
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating manufacturing queue item:', error);
    res.status(400).json({ error: 'Failed to update manufacturing queue item' });
  }
});

// Update status of a manufacturing queue item
router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    
    const updateData: any = { status, updatedAt: new Date() };
    
    if (status === 'IN_PROGRESS' && !req.body.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === 'COMPLETED' && !req.body.completedAt) {
      updateData.completedAt = new Date();
    }
    
    const [updatedItem] = await db
      .update(manufacturingQueue)
      .set(updateData)
      .where(eq(manufacturingQueue.id, id))
      .returning();
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating manufacturing queue item status:', error);
    res.status(400).json({ error: 'Failed to update status' });
  }
});

// Delete a manufacturing queue item
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    await db
      .delete(manufacturingQueue)
      .where(eq(manufacturingQueue.id, id));
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to delete manufacturing queue item' });
  }
});

// POST /api/manufacturing-queue/:id/generate-requirements
// Manually triggers requirement generation from routing for a queue item.
// Optional body: { routingId: "uuid" } to pin a specific part routing.
// Idempotent — skips requirements that already exist for this queue item.
router.post('/:id/generate-requirements', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const [queueItem] = await db
      .select({ id: manufacturingQueue.id })
      .from(manufacturingQueue)
      .where(eq(manufacturingQueue.id, id))
      .limit(1);

    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }

    const routingId: string | undefined = req.body?.routingId ?? undefined;
    const result = await generateRequirementsFromRouting(id, routingId);
    res.json(result);
  } catch (error: any) {
    console.error('Error generating requirements from routing:', error);
    res.status(500).json({ error: 'Failed to generate requirements', message: error.message });
  }
});

// POST /api/manufacturing-queue/:id/release
// Formally releases a KIT, LAYUP, CORE, or SUB_ASSEMBLY queue item, setting status = RELEASED and recording releasedAt.
// Requires: queueType = KIT | LAYUP | CORE | SUB_ASSEMBLY, readinessStatus = READY, status not already IN_PROGRESS/COMPLETED/RELEASED/CANCELLED.
router.post('/:id/release', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const [item] = await db
      .select({
        id: manufacturingQueue.id,
        queueType: manufacturingQueue.queueType,
        readinessStatus: manufacturingQueue.readinessStatus,
        status: manufacturingQueue.status,
      })
      .from(manufacturingQueue)
      .where(eq(manufacturingQueue.id, id))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    if (item.queueType !== 'KIT' && item.queueType !== 'LAYUP' && item.queueType !== 'CORE' && item.queueType !== 'SUB_ASSEMBLY') {
      return res.status(400).json({ error: 'Only KIT, LAYUP, CORE, or SUB_ASSEMBLY queue items can be released' });
    }
    if (item.readinessStatus !== 'READY') {
      return res.status(400).json({ error: `${item.queueType} must be READY before it can be released` });
    }
    if (['IN_PROGRESS', 'COMPLETED', 'RELEASED', 'CANCELLED'].includes(item.status)) {
      return res.status(400).json({ error: `Item is already ${item.status} and cannot be released` });
    }

    const [updated] = await db
      .update(manufacturingQueue)
      .set({ status: 'RELEASED', releasedAt: new Date(), updatedAt: new Date() })
      .where(eq(manufacturingQueue.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Error releasing queue item:', error);
    res.status(500).json({ error: 'Failed to release queue item', message: error.message });
  }
});

// POST /api/manufacturing-queue/:id/evaluate-readiness
// Triggers readiness evaluation for a queue item and returns the result.
// NOTE: readiness evaluation only writes readinessStatus, percentReady, and blockedReason —
// it NEVER modifies queue status. A RELEASED item remains RELEASED even if readiness worsens.
router.post('/:id/evaluate-readiness', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const [queueItem] = await db
      .select({ id: manufacturingQueue.id })
      .from(manufacturingQueue)
      .where(eq(manufacturingQueue.id, id))
      .limit(1);

    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }

    const result = await evaluateQueueReadiness(id);
    res.json(result);
  } catch (error: any) {
    console.error('Error evaluating queue readiness:', error);
    res.status(500).json({ error: 'Failed to evaluate readiness', message: error.message });
  }
});

export default router;
