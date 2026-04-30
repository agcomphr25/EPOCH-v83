import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, asc, desc, ilike, notInArray, sql } from 'drizzle-orm';
import { auditService } from '../services/auditService';
import { requirePermission } from '../../middleware/requirePermission';
import { validateActionToken } from '../../middleware/actionToken';
import { requireScopedCapability, ScopedForbiddenError } from '../permissions';
import { storage } from '../../storage';
import { evaluateTravelerStartGates, evaluateTravelerFinishGates, evaluateStartGatesDetailed, evaluateWadReleaseGate, buildGateErrorBody, buildTrainingGateErrorBody } from '../lib/travelerGates';
import { evaluateTravelerTrainingGate, evaluateQcTrainingGate } from '../lib/trainingEnforcement';
import { resolveChargeCode, deriveProjectId, resolveCertificationStatus, resolveBudgetOverrunState } from '../lib/resolveChargeCode';
import { laborAllocationsEnabled } from '../lib/featureFlags';
import * as allocationService from '../services/laborAllocationService';
import { db } from '../../db';
import {
  insertTravelerSchema,
  insertTravelerStepSchema,
  insertTravelerTaskSchema,
  insertTravelerTaskFieldSchema,
  insertTravelerSignatureSchema,
  insertTravelerAuthorizedNoteSchema,
  employees,
  p2SerializedItems,
  p2SerializedItemEvents,
  travelers,
  travelerSteps,
  travelerAuthorizedNotes,
  partRoutings,
  inventoryItems,
  manufacturingQueue,
  productionWorkOrders,
  getSupplySourceDashboard,
  supplySourceDashboardToLegacyDept,
} from '../../schema';
import type { ManufacturedCategory } from '../../schema';

const P2_DEPARTMENT_STAGES = [
  'Layup', 'Assemble/Disassembly', 'CNC', 'Finish', 'Paint', 'Final QC', 'Shipping'
];

const DEPT_ALIASES: Record<string, string> = {
  'layup': 'layup',
  'layupplugging': 'layup',
  'layup/plugging': 'layup',
  'assembledisassembly': 'assembledisassembly',
  'assemble/disassembly': 'assembledisassembly',
  'assembly/disassembly': 'assembledisassembly',
  'assembly': 'assembledisassembly',
  'cnc': 'cnc',
  'finish': 'finish',
  'finishing': 'finish',
  'paint': 'paint',
  'painting': 'paint',
  'finalqc': 'finalqc',
  'final qc': 'finalqc',
  'final_qc': 'finalqc',
  'shipping': 'shipping',
};

function normalizeDept(d: string): string {
  let lower = d.toLowerCase().trim();
  lower = lower.replace(/^pending\s+/i, '');
  if (DEPT_ALIASES[lower]) return DEPT_ALIASES[lower];
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  return DEPT_ALIASES[stripped] || stripped;
}

function getDeptTimestampField(dept: string): string | null {
  const key = normalizeDept(dept);
  const map: Record<string, string> = {
    'layup': 'layupCompletedAt',
    'assembledisassembly': 'assembleDisassemblyCompletedAt',
    'cnc': 'cncCompletedAt',
    'finish': 'finishCompletedAt',
    'paint': 'paintCompletedAt',
    'finalqc': 'finalQcCompletedAt',
  };
  return map[key] || null;
}

async function syncP2SerializedItemOnStepComplete(
  traveler: { id: string; serialNumber?: string | null; partNumber?: string | null },
  completedStep: { departmentName: string; stepNumber: number },
  performedBy: string
): Promise<void> {
  try {
    if (!traveler.serialNumber) return;

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: and(
        ilike(p2SerializedItems.serialNumber, traveler.serialNumber),
        eq(p2SerializedItems.status, 'ACTIVE')
      ),
    });

    if (!serializedItem) return;

    let routing = serializedItem.partRoutingId
      ? await db.query.partRoutings.findFirst({
          where: eq(partRoutings.id, serializedItem.partRoutingId),
        })
      : null;

    if (!routing && serializedItem.partNumber) {
      routing = await db.query.partRoutings.findFirst({
        where: and(
          eq(partRoutings.partNumber, serializedItem.partNumber),
          eq(partRoutings.isActive, true)
        ),
      });
    }

    const departmentSequence = routing?.departmentSequence
      ? (routing.departmentSequence as string[])
      : [...P2_DEPARTMENT_STAGES];

    const stepDept = completedStep.departmentName;
    const itemDept = serializedItem.currentDepartment;
    const currentIndex = serializedItem.currentStageIndex || 0;

    const normalizedStepDept = normalizeDept(stepDept);
    const normalizedItemDept = normalizeDept(itemDept);

    const stepDeptIndex = departmentSequence.findIndex(d => normalizeDept(d) === normalizedStepDept);

    if (normalizedStepDept !== normalizedItemDept) {
      if (stepDeptIndex < 0 || stepDeptIndex < currentIndex) {
        console.log(`[P2 Sync] Step dept "${stepDept}" is behind or unknown vs item dept "${itemDept}" — skipping`);
        return;
      }

      console.log(`[P2 Sync] Step dept "${stepDept}" is ahead of item dept "${itemDept}" — catching up`);
    }

    const targetIndex = stepDeptIndex >= 0 ? stepDeptIndex + 1 : currentIndex + 1;
    const nextDepartment = departmentSequence[targetIndex];

    const updates: any = { updatedAt: new Date() };

    const tsField = getDeptTimestampField(stepDept);
    if (tsField) {
      updates[tsField] = new Date();
    }

    for (let i = currentIndex; i < targetIndex && i < departmentSequence.length; i++) {
      const intermediateTsField = getDeptTimestampField(departmentSequence[i]);
      if (intermediateTsField && !updates[intermediateTsField]) {
        updates[intermediateTsField] = new Date();
      }
    }

    if (targetIndex < departmentSequence.length) {
      updates.currentDepartment = nextDepartment;
      updates.currentStageIndex = targetIndex;
    } else {
      updates.status = 'COMPLETED';
      updates.completedAt = new Date();
    }

    const result = await db.update(p2SerializedItems)
      .set(updates)
      .where(eq(p2SerializedItems.id, serializedItem.id))
      .returning({ id: p2SerializedItems.id });

    if (!result.length) {
      console.log(`[P2 Sync] Skipped "${serializedItem.barcode}" — update failed`);
      return;
    }

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId: serializedItem.id,
      barcode: serializedItem.barcode,
      eventType: 'TRANSITION',
      fromDepartment: itemDept,
      toDepartment: nextDepartment || 'COMPLETED',
      fromStageIndex: currentIndex,
      toStageIndex: targetIndex < departmentSequence.length ? targetIndex : null,
      performedBy,
      notes: `Synced from traveler step completion (${traveler.id}, step ${completedStep.stepNumber})`,
    });

    console.log(`[P2 Sync] Advanced "${serializedItem.barcode}" from "${itemDept}" to "${nextDepartment || 'COMPLETED'}"`);
  } catch (err: any) {
    console.error('[P2 Sync] Failed to sync serialized item on step complete:', err?.message);
  }
}

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[Travelers] ${req.method} ${req.path}`);
  next();
});

router.use(validateActionToken);

// Get all travelers with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, partNumber, workOrderId, inventoryItemId } = req.query;

    const filters: {
      status?: string;
      partNumber?: string;
      workOrderId?: string;
      inventoryItemId?: string;
    } = {};

    if (status && typeof status === 'string') filters.status = status;
    if (partNumber && typeof partNumber === 'string') filters.partNumber = partNumber;
    if (workOrderId && typeof workOrderId === 'string') filters.workOrderId = workOrderId;
    if (inventoryItemId && typeof inventoryItemId === 'string') filters.inventoryItemId = inventoryItemId;

    const travelers = await storage.getTravelers(
      Object.keys(filters).length > 0 ? filters : undefined
    );
    res.json(travelers);
  } catch (error: any) {
    console.error('Error fetching travelers:', error);
    res.status(500).json({ error: 'Failed to fetch travelers', message: error.message });
  }
});

// Get traveler by number (MUST be before /:id to avoid route conflict)
router.get('/by-number/:travelerNumber', async (req: Request, res: Response) => {
  try {
    const { travelerNumber } = req.params;
    const traveler = await storage.getTravelerByNumber(travelerNumber);

    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }
    res.json(traveler);
  } catch (error: any) {
    console.error('Error fetching traveler by number:', error);
    res.status(500).json({ error: 'Failed to fetch traveler', message: error.message });
  }
});

router.get('/by-serial/:serialNumber', async (req: Request, res: Response) => {
  try {
    const serialNumber = decodeURIComponent(req.params.serialNumber).trim();
    const allTravelers = await storage.getTravelers();
    const matched = allTravelers.filter(t =>
      t.serialNumber && t.serialNumber.toLowerCase() === serialNumber.toLowerCase()
    );

    if (matched.length === 0) {
      return res.status(404).json({ error: 'No travelers found for this serial number' });
    }

    const results = await Promise.all(
      matched.map(t => storage.getTravelerWithDetails(t.id))
    );

    res.json(results.filter(Boolean));
  } catch (error: any) {
    console.error('Error fetching travelers by serial number:', error);
    res.status(500).json({ error: 'Failed to fetch travelers', message: error.message });
  }
});

// Get traveler by ID with full details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { details } = req.query;

    if (details === 'true') {
      const travelerWithDetails = await storage.getTravelerWithDetails(id);
      if (!travelerWithDetails) {
        return res.status(404).json({ error: 'Traveler not found' });
      }
      if (travelerWithDetails.steps?.length) {
        travelerWithDetails.steps = await resolveEmpCodes(travelerWithDetails.steps);
      }
      return res.json(travelerWithDetails);
    }

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }
    res.json(traveler);
  } catch (error: any) {
    console.error('Error fetching traveler:', error);
    res.status(500).json({ error: 'Failed to fetch traveler', message: error.message });
  }
});

// Create a new traveler manually
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertTravelerSchema.parse(req.body);

    if (validatedData.productionWorkOrderId) {
      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, validatedData.productionWorkOrderId));
      if (!wad) {
        return res.status(404).json({
          error: 'Production work order not found',
          productionWorkOrderId: validatedData.productionWorkOrderId,
        });
      }
    }

    const traveler = await storage.createTraveler(validatedData);

    await storage.createTravelerEvent({
      travelerId: traveler.id,
      actor: validatedData.createdBy,
      action: 'CREATED',
      details: { manual: true },
    });

    res.status(201).json(traveler);
  } catch (error: any) {
    console.error('Error creating traveler:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        issues: error.issues,
      });
    }
    res.status(500).json({ error: 'Failed to create traveler', message: error.message });
  }
});

// Suggest the best routing for a manufactured item based on its manufacturedCategory.
// Uses getSupplySourceDashboard to determine the lead department, then finds
// an active routing whose partNumber or inventoryItemId matches the item and whose
// departmentSequence starts with that lead department.
// Returns the best matching routing (or null if none found), for use by callers
// that then invoke /from-routing/:partRoutingId to create a traveler.
// This is the routing SELECTION logic — it does not modify generateTravelerFromRouting.
router.get('/suggest-routing/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;

    const invItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, partNumber),
    });

    if (!invItem) {
      return res.status(404).json({ error: 'Inventory item not found', partNumber });
    }

    const category = invItem.manufacturedCategory as ManufacturedCategory | null;
    const dashboard = getSupplySourceDashboard(category);
    const leadDepartment = supplySourceDashboardToLegacyDept(dashboard);

    const exactRouting = await storage.getPartRoutingByPartNumber(partNumber);

    if (exactRouting) {
      return res.json({
        routing: exactRouting,
        matchType: 'exact_part_number',
        supplySourceDashboard: dashboard,
        leadDepartment,
      });
    }

    const routingByItem = invItem.id
      ? await storage.getPartRoutingByInventoryItem(String(invItem.id))
      : null;

    if (routingByItem) {
      return res.json({
        routing: routingByItem,
        matchType: 'inventory_item_id',
        supplySourceDashboard: dashboard,
        leadDepartment,
      });
    }

    return res.json({
      routing: null,
      matchType: 'none',
      supplySourceDashboard: dashboard,
      leadDepartment,
      hint: leadDepartment
        ? `No routing found. Create a routing whose departmentSequence starts with "${leadDepartment}" for part ${partNumber}.`
        : `No routing found and no supplySourceDashboard mapped for category ${category}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error suggesting routing for part:', err);
    res.status(500).json({ error: 'Failed to suggest routing', message: msg });
  }
});

// Generate a traveler by part number — uses manufacturedCategory-based routing selection.
// Routing selection priority (uses supplySourceDashboard → leadDepartment):
//   1. Active part routing matched by agPartNumber
//   2. Active part routing matched by inventoryItemId
//   3. Any active routing whose departmentSequence starts with the leadDepartment
//      (category-based default — uses getDashboardCategories/getSupplySourceDashboard)
//   4. 400 with hint if no routing can be resolved
// Once a routing is found, delegates to generateTravelerFromRouting.
router.post('/from-part-number/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;
    const { workOrderId, salesOrderId, lotNumber, serialNumber, internalControlNumber, quantity, createdBy, productionWorkOrderId } = req.body;

    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy is required' });
    }

    if (productionWorkOrderId) {
      const wadSchema = z.string().uuid();
      const wadParsed = wadSchema.safeParse(productionWorkOrderId);
      if (!wadParsed.success) {
        return res.status(400).json({ error: 'productionWorkOrderId must be a valid UUID' });
      }
      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, productionWorkOrderId));
      if (!wad) {
        return res.status(404).json({
          error: 'Production work order not found',
          productionWorkOrderId,
        });
      }
    }

    const invItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, partNumber),
    });

    if (!invItem) {
      return res.status(404).json({ error: 'Inventory item not found', partNumber });
    }

    const category = invItem.manufacturedCategory as ManufacturedCategory | null;
    const dashboard = getSupplySourceDashboard(category);
    const leadDepartment = supplySourceDashboardToLegacyDept(dashboard);

    // Priority 1 & 2: exact part number or inventory item match
    let routing: Awaited<ReturnType<typeof storage.getPartRoutingByPartNumber>> | null =
      (await storage.getPartRoutingByPartNumber(partNumber)) ??
      (invItem.id ? await storage.getPartRoutingByInventoryItem(String(invItem.id)) : null) ??
      null;

    // Priority 3: category-based fallback — find any active routing whose
    // departmentSequence first element matches the lead department for this category.
    if (!routing && leadDepartment) {
      const allActive = await storage.getPartRoutings({ isActive: true });
      const leadDeptNorm = leadDepartment.toLowerCase().trim();
      routing = allActive.find(r => {
        const seq = r.departmentSequence as string[] | null;
        return Array.isArray(seq) && seq.length > 0 &&
          seq[0].toLowerCase().trim() === leadDeptNorm;
      }) ?? null;
    }

    if (!routing) {
      return res.status(400).json({
        error: 'No routing found for this part number',
        partNumber,
        supplySourceDashboard: dashboard,
        leadDepartment,
        hint: leadDepartment
          ? `Create an active routing whose departmentSequence starts with "${leadDepartment}" for part ${partNumber}.`
          : `Item has no manufacturedCategory. Classify the item (set manufacturedCategory) so a lead department can be determined.`,
      });
    }

    let traveler = await storage.generateTravelerFromRouting(routing.id, {
      workOrderId,
      salesOrderId,
      lotNumber,
      serialNumber,
      internalControlNumber,
      quantity,
      createdBy,
    });

    if (productionWorkOrderId) {
      traveler = await storage.linkTravelerToProductionWorkOrder(traveler.id, productionWorkOrderId);
    }

    res.status(201).json({ ...traveler, supplySourceDashboard: dashboard, leadDepartment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error generating traveler from part number:', err);
    res.status(500).json({ error: 'Failed to generate traveler', message: msg });
  }
});

// Generate traveler from part routing
router.post('/from-routing/:partRoutingId', async (req: Request, res: Response) => {
  try {
    const { partRoutingId } = req.params;
    const {
      workOrderId,
      salesOrderId,
      lotNumber,
      serialNumber,
      internalControlNumber,
      quantity,
      createdBy,
      productionWorkOrderId,
    } = req.body;

    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy is required' });
    }

    if (productionWorkOrderId) {
      const wadSchema = z.string().uuid();
      const wadParsed = wadSchema.safeParse(productionWorkOrderId);
      if (!wadParsed.success) {
        return res.status(400).json({ error: 'productionWorkOrderId must be a valid UUID' });
      }
      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, productionWorkOrderId));
      if (!wad) {
        return res.status(404).json({
          error: 'Production work order not found',
          productionWorkOrderId,
        });
      }
    }

    let traveler = await storage.generateTravelerFromRouting(partRoutingId, {
      workOrderId,
      salesOrderId,
      lotNumber,
      serialNumber,
      internalControlNumber,
      quantity,
      createdBy,
    });

    if (productionWorkOrderId) {
      traveler = await storage.linkTravelerToProductionWorkOrder(traveler.id, productionWorkOrderId);
    }

    res.status(201).json(traveler);
  } catch (error: any) {
    console.error('Error generating traveler from routing:', error);
    res.status(500).json({ error: 'Failed to generate traveler', message: error.message });
  }
});

// Update traveler
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = insertTravelerSchema.partial().parse(req.body);

    const existingTraveler = await storage.getTraveler(id);
    if (!existingTraveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (existingTraveler.status === 'COMPLETED' || existingTraveler.status === 'CANCELED') {
      return res.status(400).json({
        error: 'Cannot modify a completed or canceled traveler',
      });
    }

    const updatedTraveler = await storage.updateTraveler(id, validatedData);

    await storage.createTravelerEvent({
      travelerId: id,
      actor: req.body.updatedBy || 'system',
      action: 'EDITED',
      details: { changes: validatedData },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error updating traveler:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        issues: error.issues,
      });
    }
    res.status(500).json({ error: 'Failed to update traveler', message: error.message });
  }
});

// Delete traveler (only DRAFT status)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const traveler = await storage.getTraveler(id);

    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Only DRAFT travelers can be deleted',
      });
    }

    await storage.deleteTraveler(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting traveler:', error);
    res.status(500).json({ error: 'Failed to delete traveler', message: error.message });
  }
});

// Start traveler (DRAFT -> IN_PROGRESS)
router.post('/:id/start', requirePermission('travelers.start'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { startedBy } = req.body;

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Traveler must be in DRAFT status to start',
        currentStatus: traveler.status,
      });
    }

    // Kit release gate: if traveler is linked to a KIT queue item, it must be RELEASED.
    // Linkage strategy (most-to-least specific):
    //   1. inventoryItemId + parentProductionOrderId (workOrderId on traveler)
    //   2. inventoryItemId only — pick most recently created KIT row (desc createdAt)
    if (traveler.inventoryItemId) {
      const numericItemId = parseInt(traveler.inventoryItemId, 10);
      if (!isNaN(numericItemId)) {
        // Build base conditions
        const baseConditions = and(
          eq(manufacturingQueue.inventoryItemId, numericItemId),
          eq(manufacturingQueue.queueType, 'KIT')
        );

        // Try narrow match first: also match parentProductionOrderId when workOrderId is set
        let linkedKitItem: { id: number; status: string } | undefined;
        if (traveler.workOrderId) {
          const [narrowRow] = await db
            .select({ id: manufacturingQueue.id, status: manufacturingQueue.status })
            .from(manufacturingQueue)
            .where(
              and(
                baseConditions,
                eq(manufacturingQueue.parentProductionOrderId, traveler.workOrderId)
              )
            )
            .orderBy(desc(manufacturingQueue.createdAt))
            .limit(1);
          linkedKitItem = narrowRow;
        }

        // Fall back to inventory-item-only match — constrained to open/relevant statuses
        // (PENDING or RELEASED only; skip CANCELLED and COMPLETED rows to avoid false blocks)
        if (!linkedKitItem) {
          const [broadRow] = await db
            .select({ id: manufacturingQueue.id, status: manufacturingQueue.status })
            .from(manufacturingQueue)
            .where(
              and(
                baseConditions,
                notInArray(manufacturingQueue.status, ['CANCELLED', 'COMPLETED'])
              )
            )
            .orderBy(desc(manufacturingQueue.createdAt))
            .limit(1);
          linkedKitItem = broadRow;
        }

        if (linkedKitItem && linkedKitItem.status !== 'RELEASED') {
          return res.status(400).json({
            error: 'Kit not released — release the linked kit queue item before starting this traveler',
            kitQueueItemId: linkedKitItem.id,
            kitStatus: linkedKitItem.status,
          });
        }
      }
    }

    // WAD gate: traveler's linked production work order must be RELEASED.
    // Missing WAD is treated as a hard failure — no bypass path exists.
    if (traveler.productionWorkOrderId) {
      const wad = await storage.getWorkOrderById(traveler.productionWorkOrderId);
      if (!wad) {
        return res.status(404).json({
          error: 'Linked work order not found — cannot start traveler without a valid WAD',
          workOrderId: traveler.productionWorkOrderId,
        });
      }
      // Allow RELEASED or IN_PROGRESS: IN_PROGRESS means a prior traveler on this WAD already
      // started (which auto-transitioned the WAD), so subsequent travelers are still authorized.
      if (wad.status !== 'RELEASED' && wad.status !== 'IN_PROGRESS') {
        return res.status(403).json({
          error: 'Work order not released to floor',
          workOrderId: traveler.productionWorkOrderId,
          workOrderStatus: wad.status,
        });
      }
    }

    const updatedTraveler = await storage.updateTraveler(id, { status: 'IN_PROGRESS' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: startedBy || 'system',
      action: 'STATUS_CHANGED',
      details: { from: 'DRAFT', to: 'IN_PROGRESS' },
    });

    const startActorUser = (req as any).user;
    auditService.logEvent({
      entityType: 'traveler',
      entityId: id,
      action: 'TRAVELER_STARTED',
      actor: {
        id: startActorUser?.employeeId ?? startActorUser?.id ?? undefined,
        username: startedBy || startActorUser?.username || 'system',
      },
      meta: {
        workOrderId: traveler.productionWorkOrderId ?? undefined,
        partNumber: traveler.partNumber ?? undefined,
        travelerNumber: traveler.travelerNumber ?? undefined,
      },
    }).catch(err => console.warn('[Audit] TRAVELER_STARTED log failed:', err?.message));

    // Auto-transition the WAD to IN_PROGRESS when the first traveler step starts
    if (traveler.productionWorkOrderId) {
      const wad = await storage.getWorkOrderById(traveler.productionWorkOrderId);
      if (wad && wad.status === 'RELEASED') {
        await storage.updateWorkOrderStatus(wad.id, 'IN_PROGRESS');
        console.log(`[Travelers] WAD ${wad.id} transitioned to IN_PROGRESS on first traveler start`);
      }
    }

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error starting traveler:', error);
    res.status(500).json({ error: 'Failed to start traveler', message: error.message });
  }
});

// Complete traveler (requires all steps completed and signed)
router.post('/:id/complete', requirePermission('travelers.finish'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { completedBy } = req.body;

    const travelerDetails = await storage.getTravelerWithDetails(id);
    if (!travelerDetails) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const { traveler, steps } = travelerDetails;

    if (traveler.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Traveler must be IN_PROGRESS to complete',
        currentStatus: traveler.status,
      });
    }

    const incompleteSteps = steps.filter((s) => s.status !== 'COMPLETED');
    if (incompleteSteps.length > 0) {
      return res.status(400).json({
        error: 'All steps must be completed before completing the traveler',
        incompleteSteps: incompleteSteps.map((s) => ({
          stepNumber: s.stepNumber,
          departmentName: s.departmentName,
          status: s.status,
        })),
      });
    }

    const unsignedSteps = steps.filter((s) => s.signatures.length === 0);
    if (unsignedSteps.length > 0) {
      return res.status(400).json({
        error: 'All steps must be signed before completing the traveler',
        unsignedSteps: unsignedSteps.map((s) => ({
          stepNumber: s.stepNumber,
          departmentName: s.departmentName,
        })),
      });
    }

    const updatedTraveler = await storage.updateTraveler(id, { status: 'COMPLETED' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: completedBy || 'system',
      action: 'STATUS_CHANGED',
      details: { from: 'IN_PROGRESS', to: 'COMPLETED' },
    });

    const completeActorUser = (req as any).user;
    auditService.logEvent({
      entityType: 'traveler',
      entityId: id,
      action: 'TRAVELER_COMPLETED',
      actor: {
        id: completeActorUser?.employeeId ?? completeActorUser?.id ?? undefined,
        username: completedBy || completeActorUser?.username || 'system',
      },
      meta: {
        workOrderId: traveler.productionWorkOrderId ?? undefined,
        partNumber: traveler.partNumber ?? undefined,
        travelerNumber: traveler.travelerNumber ?? undefined,
      },
    }).catch(err => console.warn('[Audit] TRAVELER_COMPLETED log failed:', err?.message));

    const lastStep = steps
      .slice()
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .pop();
    if (lastStep) {
      await syncP2SerializedItemOnStepComplete(
        traveler,
        { departmentName: lastStep.departmentName, stepNumber: lastStep.stepNumber },
        completedBy || 'system'
      );
    }

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error completing traveler:', error);
    res.status(500).json({ error: 'Failed to complete traveler', message: error.message });
  }
});

// Block traveler
router.post('/:id/block', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { blockedBy, reason } = req.body;

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status === 'COMPLETED' || traveler.status === 'CANCELED') {
      return res.status(400).json({
        error: 'Cannot block a completed or canceled traveler',
      });
    }

    const updatedTraveler = await storage.updateTraveler(id, { status: 'BLOCKED' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: blockedBy || 'system',
      action: 'BLOCKED',
      details: { from: traveler.status, reason },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error blocking traveler:', error);
    res.status(500).json({ error: 'Failed to block traveler', message: error.message });
  }
});

// Unblock traveler
router.post('/:id/unblock', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { unblockedBy } = req.body;

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status !== 'BLOCKED') {
      return res.status(400).json({
        error: 'Traveler is not blocked',
        currentStatus: traveler.status,
      });
    }

    const updatedTraveler = await storage.updateTraveler(id, { status: 'IN_PROGRESS' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: unblockedBy || 'system',
      action: 'UNBLOCKED',
      details: { to: 'IN_PROGRESS' },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error unblocking traveler:', error);
    res.status(500).json({ error: 'Failed to unblock traveler', message: error.message });
  }
});

// Cancel traveler
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { canceledBy, reason } = req.body;

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status === 'COMPLETED' || traveler.status === 'CANCELED') {
      return res.status(400).json({
        error: 'Cannot cancel a completed or already canceled traveler',
      });
    }

    const updatedTraveler = await storage.updateTraveler(id, { status: 'CANCELED' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: canceledBy || 'system',
      action: 'STATUS_CHANGED',
      details: { from: traveler.status, to: 'CANCELED', reason },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error canceling traveler:', error);
    res.status(500).json({ error: 'Failed to cancel traveler', message: error.message });
  }
});

// ============================================================================
// STEP ENDPOINTS
// ============================================================================

// Helper: resolve any raw EMP-code values in startedBy/completedBy to real names
async function resolveEmpCodes(steps: any[]): Promise<any[]> {
  const empCodePattern = /^EMP\d+$/i;
  const codesToResolve = new Set<string>();
  for (const step of steps) {
    if (step.startedBy && empCodePattern.test(step.startedBy)) codesToResolve.add(step.startedBy);
    if (step.completedBy && empCodePattern.test(step.completedBy)) codesToResolve.add(step.completedBy);
  }
  if (codesToResolve.size === 0) return steps;

  const resolved = new Map<string, string>();
  for (const code of codesToResolve) {
    const emp = await db.select({ name: employees.name })
      .from(employees)
      .where(eq(employees.employeeCode, code))
      .limit(1);
    if (emp.length > 0) resolved.set(code, emp[0].name);
  }
  if (resolved.size === 0) return steps;

  return steps.map((step) => ({
    ...step,
    startedBy: step.startedBy && resolved.has(step.startedBy) ? resolved.get(step.startedBy)! : step.startedBy,
    completedBy: step.completedBy && resolved.has(step.completedBy) ? resolved.get(step.completedBy)! : step.completedBy,
  }));
}

// Get steps for a traveler
router.get('/:travelerId/steps', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const steps = await storage.getTravelerSteps(travelerId);
    res.json(await resolveEmpCodes(steps));
  } catch (error: any) {
    console.error('Error fetching traveler steps:', error);
    res.status(500).json({ error: 'Failed to fetch steps', message: error.message });
  }
});

// Update step notes
router.patch('/:travelerId/steps/:stepId', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    const { notes } = req.body;
    const [updated] = await db
      .update(travelerSteps)
      .set({ notes: notes ?? null })
      .where(and(eq(travelerSteps.id, stepId), eq(travelerSteps.travelerId, travelerId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Step not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating step notes:', error);
    res.status(500).json({ error: 'Failed to update step notes', message: error.message });
  }
});

// Get per-gate status for a NOT_STARTED step (for inline display)
router.get('/:travelerId/steps/:stepId/gates', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;

    // Verify the step belongs to this traveler
    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    // Resolve optional badge scan to employee identity (mirrors the start-step logic)
    const { badge } = req.query as Record<string, string>;
    let resolvedEmployeeId: number | undefined;
    let resolvedEmployeeName: string | undefined;
    if (badge) {
      // Normalize: strip dashes so UUID badges work whether or not they include hyphens.
      // Matches the same REPLACE() strategy used in badgeAuth middleware.
      const normalizedBadge = badge.replace(/-/g, '');
      const byBadge = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedBadge}`)
        .limit(1);
      if (byBadge.length > 0) {
        resolvedEmployeeId = byBadge[0].id;
        resolvedEmployeeName = byBadge[0].name;
      } else {
        const byCode = await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(sql`LOWER(${employees.employeeCode}) = LOWER(${badge})`)
          .limit(1);
        if (byCode.length > 0) {
          resolvedEmployeeId = byCode[0].id;
          resolvedEmployeeName = byCode[0].name;
        }
      }
    }

    const gates = await evaluateStartGatesDetailed(travelerId, stepId, {
      employeeId: resolvedEmployeeId,
      employeeName: resolvedEmployeeName,
    });
    res.json({ gates });
  } catch (error: any) {
    console.error('Error evaluating step gates:', error);
    res.status(500).json({ error: 'Failed to evaluate gates', message: error.message });
  }
});

/**
 * Shared post-gate side effects for starting a traveler step.
 *
 * Both the normal start route and the supervisor override route call this
 * after any gate checks have been satisfied (or intentionally bypassed).
 *
 * Side effects:
 *  1. Updates the step to IN_PROGRESS
 *  2. Auto-completes the START_GATE task (if present)
 *  3. Auto-completes badge-mention gate-check tasks in the START phase (if badgeScan provided)
 *  4. Emits a STEP_STARTED traveler event
 *  5. Auto-creates a CNC job + manufacturing-queue entry when the step is in a CNC department
 */
async function performStepStart(
  travelerId: string,
  stepId: string,
  traveler: Awaited<ReturnType<typeof storage.getTraveler>>,
  step: Awaited<ReturnType<typeof storage.getTravelerStep>>,
  operatorName: string,
  badgeScan?: string,
  operatorId?: number
): Promise<Awaited<ReturnType<typeof storage.updateTravelerStep>>> {
  const updatedStep = await storage.updateTravelerStep(stepId, {
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    startedBy: operatorName,
  });

  const tasks = await storage.getTravelerTasks(stepId);

  const startGateTask = tasks.find((t) => t.taskType === 'START_GATE');
  if (startGateTask) {
    await storage.updateTravelerTask(startGateTask.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: operatorName,
    });
  }

  const autoCompletedGateChecks: string[] = [];
  if (badgeScan) {
    const badgeGatePattern = /badge/i;
    const gateCheckTasks = tasks.filter(
      (t) =>
        t.taskPhase === 'START' &&
        (t.taskType === 'CHECK' || t.taskType === 'GATE_CHECK') &&
        t.status === 'NOT_STARTED' &&
        !t.requiresSignature &&
        !t.requiresCertification &&
        badgeGatePattern.test(t.title)
    );
    for (const gateTask of gateCheckTasks) {
      await storage.updateTravelerTask(gateTask.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: operatorName,
      });
      autoCompletedGateChecks.push(gateTask.title);
    }
  }

  await storage.createTravelerEvent({
    travelerId,
    actor: operatorName,
    action: 'STEP_STARTED',
    details: {
      stepId,
      stepNumber: step!.stepNumber,
      departmentName: step!.departmentName,
      badgeScan,
      autoCompletedGateChecks,
    },
  });

  auditService.logEvent({
    entityType: 'traveler_step',
    entityId: stepId,
    action: 'TRAVELER_STEP_STARTED',
    actor: { id: operatorId, username: operatorName },
    meta: {
      travelerId,
      stepNumber: step!.stepNumber,
      departmentName: step!.departmentName,
      workOrderId: traveler?.productionWorkOrderId ?? undefined,
    },
  }).catch(err => console.warn('[Audit] TRAVELER_STEP_STARTED log failed:', err?.message));

  // ── Auto-create CNC job when a CNC department step is started ──────────
  if (/cnc/i.test(step!.departmentName)) {
    try {
      const { pool: dbPool } = await import('../../db');

      const existing = await dbPool.query(
        `SELECT id FROM cnc_jobs WHERE linked_traveler_step_id = $1 LIMIT 1`,
        [stepId],
      );
      const existingRows = Array.isArray(existing) ? existing : (existing.rows ?? []);
      if (existingRows.length === 0) {
        let dueDate: string | null = null;
        let customerPo: string | null = null;
        let preferredMachine: string | null = null;

        if (traveler!.salesOrderId) {
          const orderResult = await dbPool.query(
            `SELECT due_date, customer_po FROM all_orders WHERE order_id = $1 LIMIT 1`,
            [traveler!.salesOrderId],
          );
          const orderRows = Array.isArray(orderResult) ? orderResult : (orderResult.rows ?? []);
          if (orderRows.length > 0) {
            dueDate = orderRows[0].due_date
              ? new Date(orderRows[0].due_date).toISOString().split('T')[0]
              : null;
            customerPo = orderRows[0].customer_po ?? null;
          }
        }

        if (traveler!.partNumber) {
          const machineResult = await dbPool.query(
            `SELECT preferred_machine FROM part_routings
             WHERE part_number = $1 AND preferred_machine IS NOT NULL LIMIT 1`,
            [traveler!.partNumber],
          );
          const machineRows = Array.isArray(machineResult) ? machineResult : (machineResult.rows ?? []);
          if (machineRows.length > 0) {
            preferredMachine = machineRows[0].preferred_machine ?? null;
          }
        }

        const newJob = await storage.createCncJob({
          workOrder: traveler!.workOrderId ?? traveler!.salesOrderId ?? 'AUTO',
          partNumber: traveler!.partNumber ?? 'UNKNOWN',
          partName: traveler!.partName ?? 'From Traveler',
          qty: traveler!.quantity ?? 1,
          dueDate: dueDate ?? undefined,
          customerPo: customerPo ?? undefined,
          machine: preferredMachine ?? undefined,
          priority: 'medium',
          status: 'queued',
          linkedTravelerId: travelerId,
          linkedTravelerStepId: stepId,
          createdByDisplayName: 'Traveler Auto-Create',
        });
        console.log(`[Traveler] Auto-created CNC job ${newJob.id} for traveler ${travelerId}, step ${stepId}`);

        const { createManufacturingQueueEntryForCncJob } = await import('../lib/cncMq');
        await createManufacturingQueueEntryForCncJob(newJob);
      }
    } catch (cncErr: any) {
      console.warn('[Traveler] Failed to auto-create CNC job:', cncErr?.message);
    }
  }

  return updatedStep;
}
// Supervisor gate override — bypasses all hard start gates when the supervisor has the
// 'traveler_gate_override' capability.  Every bypass is recorded in traveler_events.
router.post('/:travelerId/steps/:stepId/start/override', requirePermission('work_orders.override_charges'), async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    // operatorBadge: the badge/code of the employee who will actually do the work.
    // supervisorBadge: the badge/code of the supervisor authorising the bypass.
    const { supervisorBadge, overrideReason, operatorBadge } = req.body;

    if (!supervisorBadge) {
      return res.status(400).json({ error: 'supervisorBadge is required' });
    }
    if (!overrideReason || !overrideReason.trim()) {
      return res.status(400).json({ error: 'overrideReason is required' });
    }

    // Helper: resolve an employee record by badgeScanCode then employeeCode fallback.
    // Normalises dashes so scanner-formatted UUIDs (xxxxxxxx-xxxx-...) match DB rows
    // stored without dashes (or vice-versa).
    async function resolveEmployee(badge: string): Promise<{ id: number; name: string } | null> {
      const normalizedBadge = badge.replace(/-/g, '');
      const byBadge = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedBadge}`)
        .limit(1);
      if (byBadge.length > 0) return byBadge[0];
      const byCode = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.employeeCode, badge))
        .limit(1);
      return byCode.length > 0 ? byCode[0] : null;
    }

    // Resolve supervisor server-side (never trusted from client claims)
    const supervisor = await resolveEmployee(supervisorBadge);
    if (!supervisor) {
      return res.status(403).json({ error: 'Supervisor badge not recognised. Scan a valid supervisor badge to override.' });
    }

    // Authorization is enforced by requirePermission('work_orders.override_charges') on the route.
    // The badge-scanned supervisor identity is used for audit attribution only.
    // (Legacy traveler_gate_override employeeCapabilities check has been replaced by the
    //  route-level capability guard in the EPOCH permission system.)

    // Resolve the operator identity server-side (improves audit attribution integrity).
    // If an operatorBadge is provided, resolve it from the DB; otherwise fall back to
    // the supervisor's own name (they are acting as the operator).
    let resolvedOperator: { id?: number; name: string } = { name: supervisor.name };
    let operatorBadgeScan: string | undefined;
    if (operatorBadge) {
      const op = await resolveEmployee(operatorBadge);
      if (op) {
        resolvedOperator = op;
        operatorBadgeScan = operatorBadge;
      }
      // Unknown badge: do not trust the client's claim — log as supervisor acting
    }
    const operatorName = resolvedOperator.name;

    // Validate traveler and step state
    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    if (traveler.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Traveler must be IN_PROGRESS to start a step',
        currentStatus: traveler.status,
      });
    }

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    if (step.status !== 'NOT_STARTED') {
      return res.status(400).json({
        error: 'Step has already been started',
        currentStatus: step.status,
      });
    }

    // Evaluate gates with the actual operator identity (if known) so the blocked
    // reason in the audit log reflects the real condition rather than a generic one
    const gateResult = await evaluateTravelerStartGates(travelerId, stepId, {
      employeeId: (resolvedOperator as any).id,
      employeeName: operatorName,
    });

    // Execute all normal step-start side effects (update step, auto-complete gate tasks,
    // emit STEP_STARTED event, auto-create CNC job / manufacturing-queue entry, etc.)
    const updatedStep = await performStepStart(
      travelerId,
      stepId,
      traveler,
      step,
      operatorName,
      operatorBadgeScan,
      (resolvedOperator as any).id ?? undefined
    );

    // Phase D: switch allocation for the operator's open punch session.
    const overrideOperatorId: number | undefined = (resolvedOperator as any).id;
    if (laborAllocationsEnabled && overrideOperatorId != null) {
      try {
        const overrideOpenEntry = await storage.getOpenPunchLedgerEntry(overrideOperatorId);
        if (overrideOpenEntry) {
          const [overrideCcResult, overrideProjectId] = await Promise.all([
            resolveChargeCode({
              productionWorkOrderId: traveler.productionWorkOrderId ?? null,
              travelerId,
              travelerStepId: stepId,
              department: step.departmentName ?? null,
            }),
            deriveProjectId(traveler.productionWorkOrderId ?? null),
          ]);
          await allocationService.switchAllocation(overrideOpenEntry, {
            chargeCodeId: 'error' in overrideCcResult ? null : overrideCcResult.chargeCodeId,
            travelerId,
            travelerStepId: stepId,
            productionWorkOrderId: traveler.productionWorkOrderId ?? null,
            projectId: overrideProjectId ?? null,
            department: step.departmentName ?? null,
            operation: null,
          });
        }
      } catch (allocErr: unknown) {
        console.warn('[travelers/override] switchAllocation failed (non-fatal):', (allocErr as Error)?.message);
      }
    }

    // Record the gate bypass in traveler_events (in addition to the STEP_STARTED event
    // emitted by performStepStart above)
    await storage.createTravelerEvent({
      travelerId,
      actor: supervisor.name,
      action: 'GATE_BYPASSED',
      details: {
        stepId,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        overrideReason: overrideReason.trim(),
        operatorName,
        operatorId: (resolvedOperator as any).id ?? null,
        gatesWouldBlock: !gateResult.allowed,
        blockedReason: gateResult.reason ?? null,
        supervisorId: supervisor.id,
      },
    });

    return res.json({
      message: 'Gate bypassed by supervisor',
      step: updatedStep,
      supervisor: supervisor.name,
      operator: operatorName,
    });
  } catch (err) {
    console.error('[Traveler override] Error:', err);
    return res.status(500).json({ error: 'Failed to process gate override' });
  }
});

/**
 * GET /api/travelers/:travelerId/steps/:stepId/labor-context
 *
 * Returns WAD-resolved charge code, certification status, and budget state
 * for display in the UI before a step is started. (Task #1235, Phase 1)
 */
router.get('/:travelerId/steps/:stepId/labor-context', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    // Optional: resolve actual cert status when employeeId is known (post-badge-scan pre-start)
    const { employeeId: employeeIdQp } = req.query;

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) return res.status(404).json({ error: 'Step not found' });

    // Resolve cert requirement for this step from the routing operation (no employee ID needed)
    let requiresCertification = false;
    let certificationName: string | null = null;
    let certificationId: number | null = null;
    if (traveler.partRoutingId) {
      const routingOp = await storage.getRoutingOperationForTravelerStep(
        traveler.partRoutingId,
        step.stepNumber
      );
      if (routingOp?.certificationId) {
        requiresCertification = true;
        certificationId = routingOp.certificationId;
        const cert = await storage.getCertificationById(routingOp.certificationId);
        certificationName = cert?.name ?? `Certification #${routingOp.certificationId}`;
      }
    }

    // When employeeId is provided, resolve the employee's actual cert status
    // so the UI can show VALID/EXPIRED/MISSING pre-start (post-badge-scan)
    let certificationStatus: string | null = null;
    let certReason: string | null = null;
    if (employeeIdQp && requiresCertification && certificationId != null) {
      // Resolve the employee ID (numeric pk or employee code)
      const rawId = String(employeeIdQp).trim();
      const isNumeric = /^\d+$/.test(rawId);
      const [empRow] = await (isNumeric
        ? db.select({ id: employees.id }).from(employees).where(eq(employees.id, parseInt(rawId, 10))).limit(1)
        : db.select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, rawId)).limit(1)
      );
      if (empRow) {
        const certResult = await resolveCertificationStatus({
          travelerId,
          stepId,
          employeeId: empRow.id,
        });
        certificationStatus = certResult.status;
        certReason = certResult.reason;
      }
    } else if (requiresCertification) {
      // No employee yet — cert status unknown until badge scan
      certificationStatus = 'UNKNOWN';
    }

    const [ccResult, budgetResult, projectId] = await Promise.all([
      resolveChargeCode({
        productionWorkOrderId: traveler.productionWorkOrderId ?? null,
        travelerId,
        travelerStepId: stepId,
        department: step.departmentName ?? null,
      }),
      resolveBudgetOverrunState({
        productionWorkOrderId: traveler.productionWorkOrderId ?? null,
        department: step.departmentName ?? null,
      }),
      deriveProjectId(traveler.productionWorkOrderId ?? null),
    ]);

    return res.json({
      chargeCode: 'error' in ccResult ? null : ccResult.chargeCode,
      chargeCodeResolvedFrom: 'error' in ccResult ? null : ccResult.resolvedFrom,
      chargeCodeError: 'error' in ccResult ? ccResult.error : null,
      isOverrun: budgetResult.isOverrun,
      nearlyExhausted: budgetResult.nearlyExhausted,
      overrunReason: budgetResult.overrunReason,
      percentUsed: budgetResult.percentUsed,
      projectId,
      wadId: traveler.productionWorkOrderId ?? null,
      department: step.departmentName ?? null,
      // Cert requirement info (resolved from routing op)
      requiresCertification,
      certificationName,
      // Cert status — populated when employeeId query param is provided
      certificationStatus,
      certReason,
    });
  } catch (err: any) {
    console.error('[labor-context] Error:', err);
    return res.status(500).json({ error: 'Failed to compute labor context' });
  }
});

router.post('/:travelerId/steps/:stepId/start', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    const { startedBy, badgeScan, employeeId: bodyEmployeeId } = req.body;

    // Resolve badge scan code to employee name and ID if badge was scanned.
    // Normalise dashes so scanner-formatted UUIDs (xxxxxxxx-xxxx-...) match DB rows
    // stored without dashes (or vice-versa).
    let resolvedName = startedBy || 'unknown';
    let resolvedEmployeeId: number | undefined;
    if (badgeScan) {
      const normalizedScanCode = badgeScan.replace(/-/g, '');
      const emp = await db.select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedScanCode}`)
        .limit(1);
      if (emp.length > 0) {
        resolvedName = emp[0].name;
        resolvedEmployeeId = emp[0].id;
      } else {
        // Fallback: match by employeeCode case-insensitively (e.g. EMP003 typed/scanned directly)
        const empByCode = await db.select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(sql`LOWER(${employees.employeeCode}) = LOWER(${badgeScan})`)
          .limit(1);
        if (empByCode.length > 0) {
          resolvedName = empByCode[0].name;
          resolvedEmployeeId = empByCode[0].id;
        }
      }
    }
    // When badge scan is absent or unrecognized, accept a client-resolved employeeId directly.
    if (!resolvedEmployeeId && typeof bodyEmployeeId === 'number' && bodyEmployeeId > 0) {
      const emp = await db.select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, bodyEmployeeId))
        .limit(1);
      if (emp.length > 0) {
        resolvedName = emp[0].name;
        resolvedEmployeeId = emp[0].id;
      }
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Traveler must be IN_PROGRESS to start a step',
        currentStatus: traveler.status,
      });
    }

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    if (step.status !== 'NOT_STARTED') {
      return res.status(400).json({
        error: 'Step has already been started',
        currentStatus: step.status,
      });
    }

    // WAD release gate: the linked production work order must be RELEASED or IN_PROGRESS.
    // IN_PROGRESS is permitted because the WAD auto-transitions when the first traveler starts;
    // subsequent travelers on the same WAD would otherwise be incorrectly blocked.
    if (traveler.productionWorkOrderId) {
      const wadGate = await evaluateWadReleaseGate(traveler.productionWorkOrderId);
      if (!wadGate.allowed) {
        return res.status(403).json(
          buildGateErrorBody('wad_release', 'Work order not released to floor', wadGate.reason ?? 'The linked work order is not in RELEASED or IN_PROGRESS status.')
        );
      }
    }

    // Training enforcement gate runs BEFORE the combined process gate so that training
    // failures always surface as gate:'training' (with missing-requirement metadata) rather
    // than being absorbed into the generic process_gate response when evaluateTravelerStartGates
    // reaches its own authorization check.
    //
    // Phase 1 WARN policy (Task #1235): operation-cert failures (requirementType === 'training_module')
    // are allowed through — the cert status is stamped on punch_ledger and surfaced to the UI,
    // but the employee is NOT blocked. Identity, traveler-authorization, and P2 part-certification
    // failures remain HARD BLOCKS (these require explicit supervisor remediation, not just a flag).
    const trainingGate = await evaluateTravelerTrainingGate(travelerId, stepId, resolvedEmployeeId, resolvedName);
    const isOperationCertFailure =
      !trainingGate.allowed &&
      trainingGate.requirementType === 'training_module' &&
      (trainingGate.missingRequirement?.startsWith('operation_cert:') ?? false);

    if (!trainingGate.allowed && !isOperationCertFailure) {
      // Hard block — identity, traveler-authorization, or P2 part-cert failure
      return res.status(403).json(
        buildTrainingGateErrorBody(
          'Step start blocked by training requirement',
          trainingGate.reason ?? 'A training or certification requirement was not met.',
          trainingGate.missingRequirement,
          trainingGate.requirementType,
        )
      );
    }
    // isOperationCertFailure === true → falls through (WARN: stamp status, allow start)

    // Sequence and material gates: previous step must be COMPLETED; lot/ICN must be allocated.
    // Training authorization is already confirmed above; evaluateTravelerStartGates is kept
    // for sequence + material checks only (it also runs a secondary training check that will
    // pass since we already verified training above).
    const startGate = await evaluateTravelerStartGates(travelerId, stepId, {
      employeeId: resolvedEmployeeId,
      employeeName: resolvedName,
      // Phase 1 WARN: if the training gate already recorded a cert failure and allowed through,
      // skip the duplicate cert block in evaluateTravelerStartGates so the step is not double-blocked.
      skipOperationCertCheck: isOperationCertFailure,
    });
    if (!startGate.allowed) {
      return res.status(403).json(
        buildGateErrorBody('process_gate', 'Step start blocked by process gate', startGate.reason ?? 'A process gate check did not pass.')
      );
    }

    // ── WAD-based labor context (Task #1235) — PRE-MUTATION CHECKS ─────────
    // Resolve charge code BEFORE performStepStart so we can fail-closed without
    // leaving the step in an inconsistent IN_PROGRESS state.
    const ccResult = await resolveChargeCode({
      productionWorkOrderId: traveler.productionWorkOrderId ?? null,
      travelerId,
      travelerStepId: step.id,
      department: step.departmentName ?? null,
    });

    // Fail-closed: if WAD is linked and charge code resolution failed, abort NOW (step NOT yet started).
    if ('error' in ccResult && traveler.productionWorkOrderId) {
      return res.status(400).json({
        error: 'CHARGE_CODE_UNRESOLVED',
        message: ccResult.error,
        hint: 'Set a default charge code on the production work order or the traveler.',
      });
    }
    // ──────────────────────────────────────────────────────────────────────

    const updatedStep = await performStepStart(
      travelerId,
      stepId,
      traveler,
      step,
      resolvedName,
      badgeScan,
      resolvedEmployeeId ?? undefined
    );

    // ── WAD-based labor context stamping (Task #1235) — POST-MUTATION ──────
    // Cert + budget checks are observational (WARN only — never block). Run after step start.
    // Traceability stamping is critical-path — errors propagate as 500.
    const [certResult, budgetResult, projectId] = await Promise.all([
      resolveCertificationStatus({
        travelerId,
        stepId,
        employeeId: resolvedEmployeeId ?? null,
      }),
      resolveBudgetOverrunState({
        productionWorkOrderId: traveler.productionWorkOrderId ?? null,
        department: step.departmentName ?? null,
      }),
      deriveProjectId(traveler.productionWorkOrderId ?? null),
    ]);

    const wadLaborContext = {
      chargeCode: 'error' in ccResult ? null : ccResult.chargeCode,
      chargeCodeResolvedFrom: 'error' in ccResult ? null : ccResult.resolvedFrom,
      certificationStatus: certResult.status,
      certificationName: certResult.certificationName,
      certReason: certResult.reason ?? (isOperationCertFailure ? trainingGate.reason : null),
      isOverrun: budgetResult.isOverrun,
      nearlyExhausted: budgetResult.nearlyExhausted,
      overrunReason: budgetResult.overrunReason,
      projectId,
      warnedOnCert: isOperationCertFailure,
    };

    // Stamp the open punch entry for this employee with step-level traceability.
    if (resolvedEmployeeId != null) {
      const openEntry = await storage.getOpenPunchLedgerEntry(resolvedEmployeeId);
      if (openEntry) {
        await storage.updatePunchLedgerEntry(openEntry.id, {
          travelerStepId: stepId,
          chargeCodeId: 'error' in ccResult ? null : ccResult.chargeCodeId,
          certificationStatus: certResult.status,
          isOverrun: budgetResult.isOverrun,
          overrunReason: budgetResult.overrunReason,
          projectId,
        });

        // Phase D: close current allocation and open a new segment for the new traveler step.
        if (laborAllocationsEnabled) {
          const updatedOpenEntry = await storage.getOpenPunchLedgerEntry(resolvedEmployeeId);
          if (updatedOpenEntry) {
            allocationService.switchAllocation(updatedOpenEntry, {
              chargeCodeId: 'error' in ccResult ? null : ccResult.chargeCodeId,
              travelerId,
              travelerStepId: stepId,
              productionWorkOrderId: traveler.productionWorkOrderId ?? null,
              projectId: projectId ?? null,
              department: step.departmentName ?? null,
              operation: null,
            }).catch((e: unknown) =>
              console.warn('[travelers/step-start] switchAllocation failed (non-fatal):', (e as Error)?.message)
            );
          }
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    res.json({ ...updatedStep, wadLaborContext });
  } catch (error: any) {
    console.error('Error starting step:', error);
    res.status(500).json({ error: 'Failed to start step', message: error.message });
  }
});

// Sign and complete a step (or a specific signature task within a step)
router.post('/:travelerId/steps/:stepId/sign', requirePermission('travelers.sign_qc'), async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    const { signedBy, signedByName, badgeScan, meaning, notes, signatureRole, taskId, signatureData: sigData } = req.body;

    if (!signedBy || !meaning) {
      return res.status(400).json({ error: 'signedBy and meaning are required' });
    }

    if (!sigData) {
      return res.status(403).json(
        buildGateErrorBody('signature_required', 'Signature required', 'A drawn signature is required before signing off this step.')
      );
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const signingUser = (req as any).user as { id: number; role?: string } | undefined;
    await requireScopedCapability(signingUser, 'travelers.sign_qc', { department: step.departmentName });

    if (step.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Step must be IN_PROGRESS to sign',
        currentStatus: step.status,
      });
    }

    // Hard gate check: required QC tasks must be complete before signing
    const finishGate = await evaluateTravelerFinishGates(stepId);
    if (!finishGate.allowed) {
      return res.status(403).json(
        buildGateErrorBody('qc_completion', 'Step finish blocked by QC gate', finishGate.reason ?? 'Required QC tasks must be completed before signing off.')
      );
    }

    // Resolve signing employee identity for training gate (badge scan preferred).
    // Normalize by stripping dashes so UUID badges match whether or not they include
    // hyphens — mirrors the REPLACE() strategy used in badgeAuth middleware.
    let signingEmployeeId: number | undefined;
    let signingEmployeeName: string = signedByName || signedBy || 'unknown';
    if (badgeScan) {
      const normalizedSignBadge = badgeScan.replace(/-/g, '');
      const signerByBadge = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedSignBadge}`)
        .limit(1);
      if (signerByBadge.length > 0) {
        signingEmployeeId = signerByBadge[0].id;
        signingEmployeeName = signerByBadge[0].name;
      } else {
        const signerByCode = await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(sql`LOWER(${employees.employeeCode}) = LOWER(${badgeScan})`)
          .limit(1);
        if (signerByCode.length > 0) {
          signingEmployeeId = signerByCode[0].id;
          signingEmployeeName = signerByCode[0].name;
        }
      }
    }

    // QC training enforcement gate — independent of permission gate; both must pass
    const qcTrainingGate = await evaluateQcTrainingGate(travelerId, stepId, signingEmployeeId, signingEmployeeName);
    if (!qcTrainingGate.allowed) {
      return res.status(403).json(
        buildTrainingGateErrorBody(
          'Step signoff blocked by training requirement',
          qcTrainingGate.reason ?? 'A training or certification requirement was not met for signing off.',
          qcTrainingGate.missingRequirement,
          qcTrainingGate.requirementType,
          'qc_training',
        )
      );
    }

    const tasks = await storage.getTravelerTasks(stepId);
    
    // Rule: Check for QC failures - any FAILED QC task blocks signing
    const failedQCTasks = tasks.filter(
      (t) => t.taskType === 'QC' && t.status === 'FAILED'
    );
    if (failedQCTasks.length > 0) {
      return res.status(400).json({
        ...buildGateErrorBody('qc_failed_tasks', 'Cannot sign step with failed QC tasks', 'One or more QC tasks have failed. An NCR must be raised before the step can be signed off.'),
        failedTasks: failedQCTasks.map((t) => ({
          id: t.id,
          title: t.title,
          taskType: t.taskType,
          status: t.status,
        })),
      });
    }

    // Rule: All required FINISH phase tasks must be completed before signing
    // SIGNATURE and END_GATE tasks are completion gates — they get completed BY the signing action
    const isCompletionGate = (t: any) => t.taskType === 'END_GATE' || t.taskType === 'SIGNATURE';
    const incompleteFinishTasks = tasks.filter(
      (t) => t.required && 
             (t as any).taskPhase === 'FINISH' && 
             t.status !== 'COMPLETED' && 
             !isCompletionGate(t)
    );
    if (incompleteFinishTasks.length > 0) {
      return res.status(400).json({
        ...buildGateErrorBody('incomplete_finish_tasks', 'Required FINISH tasks must be completed before signing', 'One or more required FINISH-phase tasks have not been completed.'),
        incompleteTasks: incompleteFinishTasks.map((t) => ({
          id: t.id,
          title: t.title,
          taskType: t.taskType,
          taskPhase: (t as any).taskPhase,
          status: t.status,
        })),
      });
    }

    // Rule: All required START and WORK phase tasks must also be completed
    const incompleteOtherTasks = tasks.filter(
      (t) => t.required && 
             t.status !== 'COMPLETED' && 
             !isCompletionGate(t) &&
             ((t as any).taskPhase === 'START' || (t as any).taskPhase === 'WORK')
    );
    if (incompleteOtherTasks.length > 0) {
      return res.status(400).json({
        ...buildGateErrorBody('incomplete_tasks', 'All required tasks must be completed before signing', 'One or more required tasks have not been completed.'),
        incompleteTasks: incompleteOtherTasks.map((t) => ({
          id: t.id,
          title: t.title,
          taskType: t.taskType,
          taskPhase: (t as any).taskPhase,
          status: t.status,
        })),
      });
    }

    // Rule: All tasks with requiresSignature must have their signatures satisfied
    // Tasks that require a signature can have their data entered, but step sign-off
    // is blocked until all signature-required tasks are either completed or gate tasks
    const unsignedSigTasks = tasks.filter(
      (t) => (t as any).requiresSignature && 
             t.status !== 'COMPLETED' && 
             !isCompletionGate(t)
    );
    if (unsignedSigTasks.length > 0) {
      return res.status(400).json({
        ...buildGateErrorBody('unsigned_tasks', 'Signature tasks must be signed before completing the step', 'One or more tasks that require a signature have not been signed.'),
        unsignedTasks: unsignedSigTasks.map((t) => ({
          id: t.id,
          title: t.title,
          taskType: t.taskType,
          signatureRole: (t as any).signatureRole,
          status: t.status,
        })),
      });
    }

    // Find which SIGNATURE gate task(s) to complete with this signing
    const pendingGateTasks = tasks.filter((t) => isCompletionGate(t) && t.status !== 'COMPLETED');
    let matchedGateTask: any = null;

    if (taskId) {
      matchedGateTask = pendingGateTasks.find((t) => t.id === taskId);
    } else if (signatureRole) {
      matchedGateTask = pendingGateTasks.find(
        (t) => t.taskType === 'SIGNATURE' && (t as any).signatureRole === signatureRole
      );
    }

    const signature = await storage.createTravelerSignature({
      travelerStepId: stepId,
      travelerTaskId: matchedGateTask?.id || null,
      signedBy,
      signedByName: signedByName || null,
      signatureRole: signatureRole || matchedGateTask?.signatureRole || null,
      badgeScan: badgeScan || null,
      meaning,
      notes: notes || null,
      signatureData: sigData || null,
    });

    // Complete the matched gate task, or all pending gates if no specific match
    if (matchedGateTask) {
      await storage.updateTravelerTask(matchedGateTask.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: signedBy,
      });
    } else {
      for (const gateTask of pendingGateTasks) {
        await storage.updateTravelerTask(gateTask.id, {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedBy: signedBy,
        });
      }
    }

    // Check if all gate tasks are now complete — if so, complete the step
    const remainingGates = tasks.filter(
      (t) => isCompletionGate(t) && t.status !== 'COMPLETED' && t.id !== matchedGateTask?.id
    );
    const allGatesComplete = remainingGates.length === 0;

    // Re-check all required non-gate tasks are complete before closing the step
    const allTasksDone = tasks
      .filter((t) => t.required && !isCompletionGate(t))
      .every((t) => t.status === 'COMPLETED');

    let updatedStep = step;
    const stepCompleted = allGatesComplete && allTasksDone;
    if (stepCompleted) {
      updatedStep = await storage.updateTravelerStep(stepId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: signedBy,
      });

      await syncP2SerializedItemOnStepComplete(
        traveler,
        { departmentName: step.departmentName, stepNumber: step.stepNumber },
        signedBy
      );
    }

    await storage.createTravelerEvent({
      travelerId,
      actor: signedBy,
      actorName: signedByName,
      action: 'SIGNED',
      details: {
        stepId,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        meaning,
        signatureId: signature.id,
        signatureRole: signatureRole || matchedGateTask?.signatureRole || null,
        taskId: matchedGateTask?.id || null,
        stepCompleted,
      },
    });

    auditService.logEvent({
      entityType: 'traveler_step',
      entityId: stepId,
      action: 'QC_SIGNOFF',
      actor: { username: signedBy, id: signingEmployeeId },
      meta: {
        travelerId,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        signatureRole: signatureRole || matchedGateTask?.signatureRole || null,
        meaning,
        workOrderId: traveler.productionWorkOrderId ?? undefined,
      },
    }).catch(err => console.warn('[Audit] QC_SIGNOFF log failed:', err?.message));

    if (stepCompleted) {
      auditService.logEvent({
        entityType: 'traveler_step',
        entityId: stepId,
        action: 'TRAVELER_STEP_FINISHED',
        actor: { username: signedBy, id: signingEmployeeId },
        meta: {
          travelerId,
          stepNumber: step.stepNumber,
          departmentName: step.departmentName,
          workOrderId: traveler.productionWorkOrderId ?? undefined,
        },
      }).catch(err => console.warn('[Audit] TRAVELER_STEP_FINISHED log failed:', err?.message));
    }

    res.json({ step: updatedStep, signature, stepCompleted });
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error signing step:', error);
    res.status(500).json({ error: 'Failed to sign step', message: error.message });
  }
});

// ============================================================================
// TRAINING GATE INTROSPECTION
// ============================================================================

// Read-only training gate evaluation — returns pass/fail status with requirement details.
// Useful for future UI previews before an operator attempts to start or sign a step.
// GET /api/travelers/:id/steps/:stepId/training-gate?employeeId=<integer>&gate=start|qc
router.get('/:id/steps/:stepId/training-gate', async (req: Request, res: Response) => {
  try {
    const { id: travelerId, stepId } = req.params;
    const { employeeId, gate = 'start' } = req.query;

    let resolvedEmployeeId: number | undefined;
    let resolvedEmployeeName: string | undefined;

    if (employeeId) {
      const parsedId = parseInt(String(employeeId), 10);
      if (!isNaN(parsedId)) {
        const emp = await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(eq(employees.id, parsedId))
          .limit(1);
        if (emp.length > 0) {
          resolvedEmployeeId = emp[0].id;
          resolvedEmployeeName = emp[0].name;
        }
      }
    }

    if (gate === 'qc') {
      const result = await evaluateQcTrainingGate(travelerId, stepId, resolvedEmployeeId, resolvedEmployeeName);
      return res.json({
        gate: 'qc',
        travelerId,
        stepId,
        employeeId: resolvedEmployeeId ?? null,
        employeeName: resolvedEmployeeName ?? null,
        ...result,
      });
    }

    const result = await evaluateTravelerTrainingGate(travelerId, stepId, resolvedEmployeeId, resolvedEmployeeName);
    return res.json({
      gate: 'start',
      travelerId,
      stepId,
      employeeId: resolvedEmployeeId ?? null,
      employeeName: resolvedEmployeeName ?? null,
      ...result,
    });
  } catch (error: any) {
    console.error('Error evaluating training gate:', error);
    res.status(500).json({ error: 'Failed to evaluate training gate', message: error.message });
  }
});

// ============================================================================
// TASK ENDPOINTS
// ============================================================================

// Get tasks for a step
router.get('/:travelerId/steps/:stepId/tasks', async (req: Request, res: Response) => {
  try {
    const { stepId } = req.params;
    const tasks = await storage.getTravelerTasks(stepId);
    res.json(tasks);
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks', message: error.message });
  }
});

// Complete a task
router.post('/:travelerId/tasks/:taskId/complete', async (req: Request, res: Response) => {
  try {
    const { travelerId, taskId } = req.params;
    const { completedBy, fieldValues, fieldValidations, toleranceApproval } = req.body;

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const task = await storage.getTravelerTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const step = await storage.getTravelerStep(task.travelerStepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Task does not belong to this traveler' });
    }

    if (step.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Step must be IN_PROGRESS to complete tasks',
        stepStatus: step.status,
      });
    }

    const taskPhase = (task as any).taskPhase as string | undefined;
    if (taskPhase && taskPhase !== 'START') {
      const allStepTasks = await storage.getTravelerTasks(step.id);
      const phaseOrder = ['START', 'WORK', 'FINISH'];
      const currentPhaseIndex = phaseOrder.indexOf(taskPhase);

      for (let i = 0; i < currentPhaseIndex; i++) {
        const prevPhase = phaseOrder[i];
        const incompletePrevTasks = allStepTasks.filter(
          (t) =>
            (t as any).taskPhase === prevPhase &&
            t.required &&
            t.status !== 'COMPLETED' &&
            t.taskType !== 'END_GATE' &&
            t.taskType !== 'SIGNATURE'
        );
        if (incompletePrevTasks.length > 0) {
          if (prevPhase === 'START') {
            const badgePattern = /badge|operator|timestamp/i;
            const autoCompletable = incompletePrevTasks.filter(
              (t) => (t.taskType === 'CHECK' || t.taskType === 'GATE_CHECK') && badgePattern.test(t.title)
            );
            const nonAutoCompletable = incompletePrevTasks.filter(
              (t) => !((t.taskType === 'CHECK' || t.taskType === 'GATE_CHECK') && badgePattern.test(t.title))
            );
            
            for (const gateTask of autoCompletable) {
              await storage.updateTravelerTask(gateTask.id, {
                status: 'COMPLETED',
                completedAt: new Date(),
                completedBy: completedBy || step.startedBy || 'operator',
              });
              const gateFields = await storage.getTravelerTaskFields(gateTask.id);
              for (const gf of gateFields) {
                if (!gf.value) {
                  let autoVal = completedBy || step.startedBy || 'operator';
                  if (gf.fieldKey === 'timestamp') autoVal = new Date().toISOString();
                  await storage.updateTravelerTaskField(gf.id, {
                    value: autoVal,
                    recordedBy: completedBy || 'system',
                    recordedAt: new Date(),
                  });
                }
              }
            }

            if (nonAutoCompletable.length > 0) {
              return res.status(400).json({
                error: `All required ${prevPhase} phase tasks must be completed before working on ${taskPhase} phase tasks`,
                blockedPhase: taskPhase,
                incompletePhase: prevPhase,
                incompleteTasks: nonAutoCompletable.map((t) => ({
                  id: t.id,
                  title: t.title,
                  taskType: t.taskType,
                })),
              });
            }
          } else {
            return res.status(400).json({
              error: `All required ${prevPhase} phase tasks must be completed before working on ${taskPhase} phase tasks`,
              blockedPhase: taskPhase,
              incompletePhase: prevPhase,
              incompleteTasks: incompletePrevTasks.map((t) => ({
                id: t.id,
                title: t.title,
                taskType: t.taskType,
              })),
            });
          }
        }
      }
    }

    const fields = await storage.getTravelerTaskFields(taskId);
    if (fields.length > 0) {
      const resolvedFieldValues = fieldValues || {};
      const resolvedFieldValidations = fieldValidations || {};
      for (const field of fields) {
        let value = resolvedFieldValues[field.fieldKey];
        if (value === undefined && field.fieldKey === 'operator') {
          value = completedBy || step.startedBy || 'unknown';
        }
        if (value === undefined && field.fieldKey === 'timestamp') {
          value = new Date().toISOString();
        }
        if (value !== undefined) {
          const resultKey = `${field.fieldKey}_result`;
          const measuredResult = resolvedFieldValues[resultKey] || null;
          const valueToStore = measuredResult
            ? `${value}|${measuredResult}`
            : value;
          const fieldValidation = resolvedFieldValidations[field.fieldKey] || undefined;
          const updateData: any = {
            value: valueToStore,
            recordedBy: completedBy || 'unknown',
            recordedAt: new Date(),
          };
          if (fieldValidation) {
            updateData.validation = fieldValidation;
          }
          await storage.updateTravelerTaskField(field.id, updateData);
        } else if (field.required) {
          return res.status(400).json({
            error: `Required field "${field.fieldLabel}" is missing`,
            fieldKey: field.fieldKey,
          });
        }
      }
    }

    // Server-side validation for TRACE tasks: verify inventory links
    if (task.taskType === 'TRACE' || task.taskType === 'TRACEABILITY') {
      // Persist packet barcode as a dynamic task field if not already present
      const resolvedFV = fieldValues || {};
      const packetBarcodeValue = resolvedFV['packetBarcode'] || resolvedFV['packet_barcode'] || '';
      if (packetBarcodeValue) {
        const existingFields = await storage.getTravelerTaskFields(taskId);
        const existingFieldKeys = new Set(existingFields.map((f: any) => f.fieldKey));
        const dynamicPacketFields = [
          { fieldKey: 'packetBarcode', fieldLabel: 'packetBarcode' },
          { fieldKey: 'packet_barcode', fieldLabel: 'packet_barcode' },
        ];
        for (const df of dynamicPacketFields) {
          if (!existingFieldKeys.has(df.fieldKey)) {
            await storage.createTravelerTaskField({
              travelerTaskId: taskId,
              fieldKey: df.fieldKey,
              fieldLabel: df.fieldLabel,
              fieldType: 'text',
              required: false,
              value: packetBarcodeValue,
              recordedBy: completedBy || 'system',
              recordedAt: new Date(),
              validation: resolvedFV['packetBarcode']
                ? (fieldValidations || {})[df.fieldKey] || undefined
                : undefined,
            });
          } else {
            const existingField = existingFields.find((f: any) => f.fieldKey === df.fieldKey);
            if (existingField && !existingField.value) {
              await storage.updateTravelerTaskField(existingField.id, {
                value: packetBarcodeValue,
                recordedBy: completedBy || 'system',
                recordedAt: new Date(),
              });
            }
          }
        }
      }

      const traceWarnings: string[] = [];
      const updatedFields = await storage.getTravelerTaskFields(taskId);
      for (const field of updatedFields) {
        const validation = field.validation as any;
        if (validation?.source === 'fabric_inventory' && validation?.inventoryId) {
          const inventoryItem = await storage.getCuttingFabricInventory(validation.inventoryId);
          if (!inventoryItem) {
            traceWarnings.push(`Inventory item not found for field "${field.fieldLabel}"`);
          } else {
            const itemICN = (inventoryItem as any).internalControlNumber;
            if (validation.internalControlNumber && itemICN && itemICN !== validation.internalControlNumber) {
              traceWarnings.push(`ICN mismatch: field says "${validation.internalControlNumber}" but inventory record has "${itemICN}"`);
            }
            const expDate = (inventoryItem as any).expirationDate;
            if (expDate && new Date(expDate) < new Date()) {
              traceWarnings.push(`Material ICN ${itemICN || validation.inventoryId} is expired (${expDate})`);
            }
          }
        }
      }
      if (traceWarnings.length > 0) {
        console.warn(`[TRACE Validation] Warnings for task ${taskId}:`, traceWarnings);
      }

      // Write ICN back to the traveler header so it's visible in the traveler record
      const resolvedVals = fieldValues || {};
      const icnWriteBack =
        resolvedVals['material_internal_control_number'] ||
        resolvedVals['internalControlNumber'] ||
        resolvedVals['material_icn'] ||
        '';
      if (icnWriteBack) {
        await storage.updateTraveler(travelerId, { internalControlNumber: icnWriteBack });
      }
    }

    // Hard QC Stop validation: block completion if any hardQcStop fields are out of tolerance
    if (task.taskType === 'QC') {
      const qcFields = await storage.getTravelerTaskFields(taskId);
      const resolvedValues = fieldValues || {};
      const failedHardStops: Array<{ fieldKey: string; fieldLabel: string; measuredResult?: string }> = [];

      for (const field of qcFields) {
        const validation = field.validation as any;
        if (validation?.hardQcStop) {
          const fieldValue = resolvedValues[field.fieldKey] ?? field.value;
          const rawValue = typeof fieldValue === 'string' && fieldValue.includes('|')
            ? fieldValue.split('|')[0]
            : fieldValue;
          const normalizedVal = String(rawValue ?? '').toLowerCase().trim();
          if (normalizedVal === 'no' || normalizedVal === 'fail' || normalizedVal === 'false') {
            const resultKey = `${field.fieldKey}_result`;
            const measuredResult = resolvedValues[resultKey] ||
              (typeof fieldValue === 'string' && fieldValue.includes('|') ? fieldValue.split('|')[1] : undefined);
            failedHardStops.push({
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              measuredResult,
            });
          }
        }
      }

      if (failedHardStops.length > 0) {
        if (!toleranceApproval || !toleranceApproval.approvedBy || !toleranceApproval.notes) {
          return res.status(400).json({
            error: 'HARD_QC_STOP: Out-of-tolerance results require authorized approval',
            code: 'HARD_QC_STOP',
            taskId,
            failedChecks: failedHardStops,
            requiresApproval: true,
          });
        }
      }
    }

    const existingMetadata = (task as any).metadata || {};
    const completionMetadata: any = { ...existingMetadata };
    if (toleranceApproval && task.taskType === 'QC') {
      completionMetadata.toleranceApproval = {
        approvedBy: toleranceApproval.approvedBy,
        notes: toleranceApproval.notes,
        approvedAt: new Date().toISOString(),
      };
    }

    const updatedTask = await storage.updateTravelerTask(taskId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: completedBy || 'unknown',
      ...(Object.keys(completionMetadata).length > 0 ? { metadata: completionMetadata } : {}),
    });

    await storage.createTravelerEvent({
      travelerId,
      actor: completedBy || 'unknown',
      action: 'TASK_COMPLETED',
      details: {
        taskId,
        taskTitle: task.title,
        taskType: task.taskType,
        stepId: step.id,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        ...(toleranceApproval ? { toleranceApproval: completionMetadata.toleranceApproval } : {}),
      },
    });

    res.json(updatedTask);
  } catch (error: any) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task', message: error.message });
  }
});

// Get task fields
router.get('/:travelerId/tasks/:taskId/fields', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const fields = await storage.getTravelerTaskFields(taskId);
    res.json(fields);
  } catch (error: any) {
    console.error('Error fetching task fields:', error);
    res.status(500).json({ error: 'Failed to fetch fields', message: error.message });
  }
});

// Update a task field value
router.patch('/:travelerId/tasks/:taskId/fields/:fieldId', async (req: Request, res: Response) => {
  try {
    const { travelerId, fieldId } = req.params;
    const { value, recordedBy, validation } = req.body;

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const updateData: any = {
      value,
      recordedBy: recordedBy || 'unknown',
      recordedAt: new Date(),
    };
    if (validation !== undefined) {
      updateData.validation = validation;
    }

    const updatedField = await storage.updateTravelerTaskField(fieldId, updateData);

    res.json(updatedField);
  } catch (error: any) {
    console.error('Error updating field:', error);
    res.status(500).json({ error: 'Failed to update field', message: error.message });
  }
});

// ============================================================================
// RE-SYNC TRAVELER FROM UPDATED PART ROUTING
// ============================================================================

router.post('/:travelerId/resync-from-routing', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const { syncBy } = req.body;

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status === 'COMPLETED' || traveler.status === 'CANCELED') {
      return res.status(400).json({ error: 'Cannot re-sync a completed or canceled traveler' });
    }

    if (!traveler.partRoutingId) {
      return res.status(400).json({ error: 'Traveler has no linked part routing' });
    }

    const routing = await storage.getPartRouting(traveler.partRoutingId);
    if (!routing) {
      return res.status(404).json({ error: 'Linked part routing not found' });
    }

    const steps = await storage.getTravelerSteps(travelerId);
    const changes: string[] = [];

    const departmentSequence = routing.departmentSequence as string[];
    const traceabilityConfig = routing.traceabilityConfig as Record<string, string[]>;
    const departmentConfig = ((routing as any).departmentConfig || {}) as Record<string, any>;

    const metadataOnlyFields = new Set(['operator', 'timestamp']);

    for (const step of steps) {
      if (step.status === 'COMPLETED') continue;

      const deptName = step.departmentName;
      const deptConf = departmentConfig[deptName] || {};
      const traceFields = (traceabilityConfig[deptName] || []).filter(
        (f: string) => !metadataOnlyFields.has(f)
      );

      const tasks = await storage.getTravelerTasks(step.id);

      for (const task of tasks) {
        if (task.status === 'COMPLETED') continue;

        if (task.taskType === 'TRACE' || task.taskType === 'TRACEABILITY') {
          const fields = await storage.getTravelerTaskFields(task.id);

          const materials = deptConf.materials || [];
          const materialRequiredFields = new Set<string>();
          for (const mat of materials) {
            const reqFields = (mat as any).requiredFields || [];
            for (const fk of reqFields) {
              materialRequiredFields.add(fk);
            }
          }

          const routingRequiredFields = new Set<string>(
            traceFields.concat(Array.from(materialRequiredFields))
          );

          const hasDeptConfig = Object.keys(deptConf).length > 0;
          const hasNoTraceability = routingRequiredFields.size === 0 && materials.length === 0;

          if (hasDeptConfig && hasNoTraceability) {
            for (const field of fields) {
              if (field.required && (!field.value || field.value === '')) {
                await storage.updateTravelerTaskField(field.id, { required: false } as any);
                changes.push(`${deptName}: "${field.fieldLabel}" made optional (removed from routing)`);
              }
            }
            if (task.required) {
              await storage.updateTravelerTask(task.id, { required: false } as any);
              changes.push(`${deptName}: "${task.title}" task made optional (no traceability in routing)`);
            }
          } else {
            for (const field of fields) {
              const shouldBeRequired = routingRequiredFields.has(field.fieldKey);
              if (field.required && !shouldBeRequired && (!field.value || field.value === '')) {
                await storage.updateTravelerTaskField(field.id, { required: false } as any);
                changes.push(`${deptName}: "${field.fieldLabel}" made optional (not in updated routing)`);
              }
            }
          }
        }
      }

      if (!departmentSequence.includes(deptName) && step.status === 'NOT_STARTED') {
        const stepTasks = await storage.getTravelerTasks(step.id);
        const allNotStarted = stepTasks.every(t => t.status === 'NOT_STARTED');
        if (allNotStarted) {
          for (const t of stepTasks) {
            await storage.updateTravelerTask(t.id, { required: false } as any);
          }
          changes.push(`${deptName}: All tasks made optional (department removed from routing)`);
        }
      }
    }

    await storage.createTravelerEvent({
      travelerId,
      actor: syncBy || 'system',
      action: 'RESYNC_FROM_ROUTING',
      details: {
        partRoutingId: traveler.partRoutingId,
        routingRevision: (routing as any).routingRevision,
        changes,
      },
    });

    const updatedSteps = await storage.getTravelerSteps(travelerId);
    const stepsWithTasks = await Promise.all(
      updatedSteps.map(async (s) => ({
        ...s,
        tasks: await Promise.all(
          (await storage.getTravelerTasks(s.id)).map(async (t) => ({
            ...t,
            fields: await storage.getTravelerTaskFields(t.id),
          }))
        ),
      }))
    );

    res.json({
      traveler,
      steps: stepsWithTasks,
      changes,
      message: changes.length > 0
        ? `Re-synced traveler with ${changes.length} change(s) from routing`
        : 'Traveler is already in sync with routing — no changes needed',
    });
  } catch (error: any) {
    console.error('Error re-syncing traveler from routing:', error);
    res.status(500).json({ error: 'Failed to re-sync traveler', message: error.message });
  }
});

// ============================================================================
// ADMIN ENDPOINTS - Force operations for stuck travelers
// ============================================================================

router.post('/:travelerId/admin/force-complete-task', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const { taskId, reason, completedBy } = req.body;

    if (!taskId || !reason || !completedBy) {
      return res.status(400).json({ error: 'taskId, reason, and completedBy are required' });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const task = await storage.getTravelerTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const step = await storage.getTravelerStep(task.travelerStepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(400).json({ error: 'Task does not belong to this traveler' });
    }

    const updatedTask = await storage.updateTravelerTask(taskId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy,
    });

    await storage.createTravelerEvent({
      travelerId,
      actor: completedBy,
      action: 'ADMIN_TASK_FORCE_COMPLETED',
      details: { taskId, taskTitle: task.title, reason },
    });

    res.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error('Error force-completing task:', error);
    res.status(500).json({ error: 'Failed to force-complete task', message: error.message });
  }
});

router.post('/:travelerId/admin/force-sign-step', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const { stepId, reason, signedBy, signedByName } = req.body;

    if (!stepId || !reason || !signedBy || !signedByName) {
      return res.status(400).json({ error: 'stepId, reason, signedBy, and signedByName are required' });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    if (step.status !== 'COMPLETED' && step.status !== 'IN_PROGRESS') {
      await storage.updateTravelerStep(stepId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: signedBy,
      });
    } else if (step.status === 'IN_PROGRESS') {
      await storage.updateTravelerStep(stepId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: signedBy,
      });
    }

    const incompleteTasks = (await storage.getTravelerTasks(stepId)).filter(
      (t) => t.status !== 'COMPLETED'
    );
    for (const task of incompleteTasks) {
      await storage.updateTravelerTask(task.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: signedBy,
      });
    }

    const signature = await storage.createTravelerSignature({
      travelerStepId: stepId,
      signedBy,
      signedByName,
      badgeScan: 'ADMIN_FORCE_SIGN',
      signedAt: new Date(),
      meaning: 'COMPLETED',
      notes: `Force-signed by admin. Reason: ${reason}`,
      signatureData: null,
    });

    await syncP2SerializedItemOnStepComplete(
      traveler,
      { departmentName: step.departmentName, stepNumber: step.stepNumber },
      signedBy
    );

    await storage.createTravelerEvent({
      travelerId,
      actor: signedBy,
      action: 'ADMIN_STEP_FORCE_SIGNED',
      details: {
        stepId,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        reason,
        tasksForceCompleted: incompleteTasks.length,
      },
    });

    res.json({ success: true, signature, tasksCompleted: incompleteTasks.length });
  } catch (error: any) {
    console.error('Error force-signing step:', error);
    res.status(500).json({ error: 'Failed to force-sign step', message: error.message });
  }
});

// ============================================================================
// EVENTS ENDPOINT (audit trail)
// ============================================================================

router.get('/:travelerId/events', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const events = await storage.getTravelerEvents(travelerId);
    res.json(events);
  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events', message: error.message });
  }
});

router.get('/:travelerId/authorized-notes', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const notes = await db.select().from(travelerAuthorizedNotes)
      .where(eq(travelerAuthorizedNotes.travelerId, travelerId))
      .orderBy(travelerAuthorizedNotes.createdAt);
    res.json(notes);
  } catch (error: any) {
    console.error('Error fetching authorized notes:', error);
    res.status(500).json({ error: 'Failed to fetch authorized notes', message: error.message });
  }
});

router.post('/:travelerId/authorized-notes', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const parsed = insertTravelerAuthorizedNoteSchema.parse({
      ...req.body,
      travelerId,
    });

    const [note] = await db.insert(travelerAuthorizedNotes).values(parsed).returning();
    res.status(201).json(note);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating authorized note:', error);
    res.status(500).json({ error: 'Failed to create authorized note', message: error.message });
  }
});

router.delete('/:travelerId/authorized-notes/:noteId', async (req: Request, res: Response) => {
  try {
    const { travelerId, noteId } = req.params;
    const result = await db.delete(travelerAuthorizedNotes)
      .where(and(
        eq(travelerAuthorizedNotes.id, noteId),
        eq(travelerAuthorizedNotes.travelerId, travelerId)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Authorized note not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting authorized note:', error);
    res.status(500).json({ error: 'Failed to delete authorized note', message: error.message });
  }
});

// GET /api/travelers/:id/assembly-readiness
router.get('/:id/assembly-readiness', async (req, res) => {
  try {
    const result = await storage.getAssemblyReadinessForTraveler(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate assembly readiness', message: error.message });
  }
});

// GET /api/travelers/:id/anodize-jobs
router.get('/:id/anodize-jobs', async (req, res) => {
  try {
    const jobs = await storage.getTravelerAnodizeJobs(req.params.id);
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get traveler anodize jobs', message: error.message });
  }
});

// GET /api/travelers/:id/anodize-blocking/:stepId  (legacy path)
router.get('/:id/anodize-blocking/:stepId', async (req, res) => {
  try {
    const result = await storage.evaluateAnodizeBlockingForTravelerStep(req.params.id, req.params.stepId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate anodize blocking', message: error.message });
  }
});

// GET /api/travelers/:travelerId/steps/:stepId/anodize-blocking  (canonical path per spec)
router.get('/:travelerId/steps/:stepId/anodize-blocking', async (req, res) => {
  try {
    const result = await storage.evaluateAnodizeBlockingForTravelerStep(req.params.travelerId, req.params.stepId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate anodize blocking', message: error.message });
  }
});

// GET /api/travelers/:travelerId/dependencies
// Returns the routing dependency definitions for the traveler's routing
router.get('/:travelerId/dependencies', async (req, res) => {
  try {
    const deps = await storage.getTravelerDependencyRequirements(req.params.travelerId);
    res.json(deps);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get traveler dependencies', message: error.message });
  }
});

// GET /api/travelers/:travelerId/dependency-status
// Full AssemblyReadinessResult for the traveler (all scopes)
router.get('/:travelerId/dependency-status', async (req, res) => {
  try {
    const result = await storage.getTravelerDependencyStatus(req.params.travelerId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get traveler dependency status', message: error.message });
  }
});

// GET /api/travelers/:travelerId/steps/:stepId/dependency-blocking
// Step-scoped dependency blocking evaluation (STEP_START + TASK_COMPLETE scopes)
router.get('/:travelerId/steps/:stepId/dependency-blocking', async (req, res) => {
  try {
    const result = await storage.evaluateAssemblyDependencyStatus(req.params.travelerId, req.params.stepId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate dependency blocking', message: error.message });
  }
});

// ============================================================================
// TRAVELER COMPONENT ASSOCIATIONS (scan-to-parent)
// ============================================================================

// GET /api/travelers/:travelerId/component-associations
router.get('/:travelerId/component-associations', async (req, res) => {
  try {
    const rows = await storage.getTravelerComponentAssociations(req.params.travelerId);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get component associations', message: error.message });
  }
});

// GET /api/travelers/:travelerId/steps/:stepId/component-associations
router.get('/:travelerId/steps/:stepId/component-associations', async (req, res) => {
  try {
    const rows = await storage.getTravelerComponentAssociations(req.params.travelerId, req.params.stepId);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get step component associations', message: error.message });
  }
});

// POST /api/travelers/:travelerId/component-associations
router.post('/:travelerId/component-associations', async (req, res) => {
  try {
    const payload = { ...req.body, parentTravelerId: req.params.travelerId };
    const row = await storage.createTravelerComponentAssociation(payload);
    res.status(201).json(row);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create component association', message: error.message });
  }
});

// PUT /api/travelers/:travelerId/steps/:stepId/component-associations/replace
router.put('/:travelerId/steps/:stepId/component-associations/replace', async (req, res) => {
  try {
    const rows = await storage.replaceTravelerComponentAssociations(
      req.params.travelerId,
      req.params.stepId,
      (req.body as any[]).map((a) => ({ ...a, parentTravelerId: req.params.travelerId }))
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to replace component associations', message: error.message });
  }
});

// POST /api/travelers/:travelerId/component-associations/scan
router.post('/:travelerId/component-associations/scan', async (req, res) => {
  try {
    const { travelerId } = req.params;
    const { scanValue, notes, quantity, scannedBy } = req.body as {
      scanValue?: string; notes?: string; quantity?: number; scannedBy?: string;
    };
    if (!scanValue?.trim()) {
      return res.status(400).json({ error: 'scanValue is required' });
    }
    const result = await storage.createTravelerComponentAssociationFromScan(
      travelerId, undefined, scanValue.trim(), { notes, quantity, scannedBy }
    );
    const status = result.associationCreated ? 201 : result.candidateFound ? 422 : 404;
    return res.status(status).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Scan processing failed', message: error.message });
  }
});

// POST /api/travelers/:travelerId/steps/:stepId/component-associations/scan
router.post('/:travelerId/steps/:stepId/component-associations/scan', async (req, res) => {
  try {
    const { travelerId, stepId } = req.params;
    const { scanValue, notes, quantity, scannedBy } = req.body as {
      scanValue?: string; notes?: string; quantity?: number; scannedBy?: string;
    };
    if (!scanValue?.trim()) {
      return res.status(400).json({ error: 'scanValue is required' });
    }
    const result = await storage.createTravelerComponentAssociationFromScan(
      travelerId, stepId, scanValue.trim(), { notes, quantity, scannedBy }
    );
    const status = result.associationCreated ? 201 : result.candidateFound ? 422 : 404;
    return res.status(status).json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Scan processing failed', message: error.message });
  }
});

// GET /api/travelers/:travelerId/scan-association-status
// Returns dependency-level scan association status (which deps still need scan)
router.get('/:travelerId/scan-association-status', async (req, res) => {
  try {
    const result = await storage.evaluateDependencyScanAssociation(req.params.travelerId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate scan association status', message: error.message });
  }
});

// GET /api/travelers/:travelerId/steps/:stepId/scan-association-status
router.get('/:travelerId/steps/:stepId/scan-association-status', async (req, res) => {
  try {
    const result = await storage.evaluateDependencyScanAssociation(req.params.travelerId, req.params.stepId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate step scan association status', message: error.message });
  }
});

export default router;

// DELETE /api/traveler-component-associations/:associationId
// Exported as a standalone path from the root travelers router
import express from 'express';
export const travelerComponentAssociationsRouter = express.Router();
travelerComponentAssociationsRouter.delete('/:associationId', async (req, res) => {
  try {
    const id = parseInt(req.params.associationId, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid association ID' });
    await storage.deleteTravelerComponentAssociation(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete component association', message: error.message });
  }
});
