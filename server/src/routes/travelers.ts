import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, asc, ilike } from 'drizzle-orm';
import { storage } from '../../storage';
import { db } from '../../db';
import {
  insertTravelerSchema,
  insertTravelerStepSchema,
  insertTravelerTaskSchema,
  insertTravelerTaskFieldSchema,
  insertTravelerSignatureSchema,
  employees,
  p2SerializedItems,
  p2SerializedItemEvents,
  travelers,
  travelerSteps,
  partRoutings,
} from '../../schema';

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
    } = req.body;

    if (!createdBy) {
      return res.status(400).json({ error: 'createdBy is required' });
    }

    const traveler = await storage.generateTravelerFromRouting(partRoutingId, {
      workOrderId,
      salesOrderId,
      lotNumber,
      serialNumber,
      internalControlNumber,
      quantity,
      createdBy,
    });

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
router.post('/:id/start', async (req: Request, res: Response) => {
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

    const updatedTraveler = await storage.updateTraveler(id, { status: 'IN_PROGRESS' });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: startedBy || 'system',
      action: 'STATUS_CHANGED',
      details: { from: 'DRAFT', to: 'IN_PROGRESS' },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error starting traveler:', error);
    res.status(500).json({ error: 'Failed to start traveler', message: error.message });
  }
});

// Complete traveler (requires all steps completed and signed)
router.post('/:id/complete', async (req: Request, res: Response) => {
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

// Start a step
router.post('/:travelerId/steps/:stepId/start', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    const { startedBy, badgeScan } = req.body;

    // Resolve badge scan code to employee name if badge was scanned
    let resolvedName = startedBy || 'unknown';
    if (badgeScan) {
      const emp = await db.select({ name: employees.name })
        .from(employees)
        .where(eq(employees.badgeScanCode, badgeScan))
        .limit(1);
      if (emp.length > 0) {
        resolvedName = emp[0].name;
      } else {
        // Fallback: match by employeeCode (e.g. EMP003 typed/scanned directly)
        const empByCode = await db.select({ name: employees.name })
          .from(employees)
          .where(eq(employees.employeeCode, badgeScan))
          .limit(1);
        if (empByCode.length > 0) {
          resolvedName = empByCode[0].name;
        }
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

    const steps = await storage.getTravelerSteps(travelerId);
    const currentStepIndex = steps.findIndex((s) => s.id === stepId);
    if (currentStepIndex > 0) {
      const previousStep = steps[currentStepIndex - 1];
      if (previousStep.status !== 'COMPLETED') {
        return res.status(400).json({
          error: 'Previous step must be completed first',
          previousStep: {
            stepNumber: previousStep.stepNumber,
            departmentName: previousStep.departmentName,
            status: previousStep.status,
          },
        });
      }
    }

    const updatedStep = await storage.updateTravelerStep(stepId, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      startedBy: resolvedName,
    });

    const tasks = await storage.getTravelerTasks(stepId);
    const startGateTask = tasks.find((t) => t.taskType === 'START_GATE');
    if (startGateTask) {
      await storage.updateTravelerTask(startGateTask.id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: resolvedName,
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
          completedBy: resolvedName,
        });
        autoCompletedGateChecks.push(gateTask.title);
      }
    }

    await storage.createTravelerEvent({
      travelerId,
      actor: resolvedName,
      action: 'STEP_STARTED',
      details: {
        stepId,
        stepNumber: step.stepNumber,
        departmentName: step.departmentName,
        badgeScan,
        autoCompletedGateChecks,
      },
    });

    res.json(updatedStep);
  } catch (error: any) {
    console.error('Error starting step:', error);
    res.status(500).json({ error: 'Failed to start step', message: error.message });
  }
});

// Sign and complete a step (or a specific signature task within a step)
router.post('/:travelerId/steps/:stepId/sign', async (req: Request, res: Response) => {
  try {
    const { travelerId, stepId } = req.params;
    const { signedBy, signedByName, badgeScan, meaning, notes, signatureRole, taskId, signatureData: sigData } = req.body;

    if (!signedBy || !meaning) {
      return res.status(400).json({ error: 'signedBy and meaning are required' });
    }

    if (!sigData) {
      return res.status(400).json({ error: 'A drawn signature is required' });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const step = await storage.getTravelerStep(stepId);
    if (!step || step.travelerId !== travelerId) {
      return res.status(404).json({ error: 'Step not found' });
    }

    if (step.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'Step must be IN_PROGRESS to sign',
        currentStatus: step.status,
      });
    }

    const tasks = await storage.getTravelerTasks(stepId);
    
    // Rule: Check for QC failures - any FAILED QC task blocks signing
    const failedQCTasks = tasks.filter(
      (t) => t.taskType === 'QC' && t.status === 'FAILED'
    );
    if (failedQCTasks.length > 0) {
      return res.status(400).json({
        error: 'Cannot sign step with failed QC tasks. NCR required.',
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
        error: 'All required FINISH tasks must be completed before signing',
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
        error: 'All required tasks must be completed before signing',
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
        error: 'All tasks requiring signatures must be signed before completing the step',
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

    res.json({ step: updatedStep, signature, stepCompleted });
  } catch (error: any) {
    console.error('Error signing step:', error);
    res.status(500).json({ error: 'Failed to sign step', message: error.message });
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

export default router;
