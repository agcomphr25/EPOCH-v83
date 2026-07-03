import { Router, Request, Response } from 'express';
import { db, pool } from '../../db';
import { 
  productionPrograms, 
  productionProgramSteps, 
  productionProgramRuns, 
  productionProgramRunEvents,
  insertProductionProgramRunSchema,
  users,
  employees,
  p2OvenCureLogs,
  p2VacuumLeakTests,
  p2FinalInspectionResults,
  p2SerializedItems,
  travelers,
  partRoutings,
} from '../../schema';
import { eq, and, desc, or, inArray, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { authenticateToken, optionalAuth } from '../../middleware/auth';
import { validateActionToken } from '../../middleware/actionToken';

// ── Auto-logging helpers ──────────────────────────────────────────────────────
// Resolves serialized item from run serial number / sku for log creation
async function lookupSerializedItem(serialNumber: string | null, sku: string | null, travelerId?: string | null) {
  if (travelerId) {
    const [traveler] = await db
      .select({ serialNumber: travelers.serialNumber, lotNumber: travelers.lotNumber })
      .from(travelers)
      .where(eq(travelers.id, travelerId))
      .limit(1);

    const travelerSerial = traveler?.serialNumber || traveler?.lotNumber || null;
    if (travelerSerial) {
      const [item] = await db
        .select()
        .from(p2SerializedItems)
        .where(
          or(
            ilike(p2SerializedItems.serialNumber, travelerSerial),
            ilike(p2SerializedItems.barcode, travelerSerial),
            ilike(p2SerializedItems.travelerBarcode, travelerSerial)
          )
        )
        .limit(1);
      if (item) return item;
    }
  }

  if (!serialNumber) return null;
  try {
    const [item] = await db
      .select()
      .from(p2SerializedItems)
      .where(
        or(
          ilike(p2SerializedItems.serialNumber, serialNumber),
          ilike(p2SerializedItems.barcode, serialNumber),
          ilike(p2SerializedItems.travelerBarcode, serialNumber)
        )
      )
      .limit(1);
    return item || null;
  } catch {
    return null;
  }
}

// Creates the appropriate AS9100 log entry when a timer run starts
async function autoCreateLinkedLog(
  run: any,
  program: any,
  userId: number | null,
): Promise<{ linkedLogId: string | null; linkedLogType: string | null }> {
  const logType: string = program.logType || 'none';
  if (logType === 'none') return { linkedLogId: null, linkedLogType: null };

  const item = await lookupSerializedItem(run.serialNumber, run.sku, run.travelerId || null);
  if (!item) {
    console.warn(`[ProductionTimer] No serialized item found for serial=${run.serialNumber} — skipping auto-log`);
    return { linkedLogId: null, linkedLogType: null };
  }

  const dept = run.departmentName || item.currentDepartment || 'Unknown';
  const scannedTravelerBarcode = run.scannedTravelerBarcode || null;
  const runMetadata = {
    source: 'timer_station',
    timerRunId: run.id,
    timerProgramId: run.programId,
    timerProgramName: program.name,
    scannedTravelerBarcode,
    travelerId: run.travelerId || null,
    travelerStepId: run.travelerStepId || null,
    travelerTaskId: run.travelerTaskId || null,
    serialNumber: run.serialNumber || item.serialNumber || null,
    mandrelNumber: run.mandrelNumber || null,
    ovenNumber: run.ovenNumber || null,
    ovenSlot: run.ovenSlot || null,
  };
  try {
    if (logType === 'oven_cure') {
      const [log] = await db.insert(p2OvenCureLogs).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        partNumber: item.partNumber,
        department: dept,
        ovenId: run.ovenNumber ? `Oven ${run.ovenNumber}` : null,
        cycleNumber: null,
        startTime: run.startedAt,
        endTime: null,
        result: 'PENDING',
        operatorId: null,
        operatorName: null,
        metadata: runMetadata,
        notes: `Auto-logged from timer run ${run.id} — program: ${program.name}`,
      }).returning();
      return { linkedLogId: log.id, linkedLogType: 'oven_cure' };
    }

    if (logType === 'vacuum_leak_test') {
      const [log] = await db.insert(p2VacuumLeakTests).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        partNumber: item.partNumber,
        department: dept,
        startTime: run.startedAt,
        endTime: null,
        result: 'PENDING',
        operatorId: null,
        operatorName: null,
        metadata: runMetadata,
        notes: `Auto-logged from timer run ${run.id} — program: ${program.name}`,
      }).returning();
      return { linkedLogId: log.id, linkedLogType: 'vacuum_leak_test' };
    }

    if (logType === 'final_inspection') {
      const [log] = await db.insert(p2FinalInspectionResults).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        partNumber: item.partNumber,
        department: dept,
        inspectionDate: run.startedAt,
        inspectionType: 'FINAL',
        overallResult: 'PENDING',
        notes: `Auto-logged from timer run ${run.id} — program: ${program.name}`,
      }).returning();
      return { linkedLogId: log.id, linkedLogType: 'final_inspection' };
    }
  } catch (err: any) {
    console.warn(`[ProductionTimer] Failed to auto-create ${logType} log:`, err.message);
  }

  return { linkedLogId: null, linkedLogType: null };
}

// Closes (stamps endTime + result) the linked log entry when a run completes/stops
async function autoCloseLinkedLog(run: any, result: 'PASS' | 'STOPPED', endTime: Date) {
  if (!run.linkedLogId || !run.linkedLogType) return;
  try {
    if (run.linkedLogType === 'oven_cure') {
      await db.update(p2OvenCureLogs)
        .set({ endTime, result, updatedAt: endTime })
        .where(eq(p2OvenCureLogs.id, run.linkedLogId));
    } else if (run.linkedLogType === 'vacuum_leak_test') {
      await db.update(p2VacuumLeakTests)
        .set({ endTime, result, updatedAt: endTime })
        .where(eq(p2VacuumLeakTests.id, run.linkedLogId));
    } else if (run.linkedLogType === 'final_inspection') {
      await db.update(p2FinalInspectionResults)
        .set({ overallResult: result === 'PASS' ? 'PASS' : 'PENDING', updatedAt: endTime })
        .where(eq(p2FinalInspectionResults.id, run.linkedLogId));
    }
    console.log(`[ProductionTimer] Auto-closed ${run.linkedLogType} log ${run.linkedLogId} → ${result}`);
  } catch (err: any) {
    console.warn(`[ProductionTimer] Failed to auto-close linked log:`, err.message);
  }
}

function calculateElapsedSeconds(startedAt: Date, endTime?: Date): number {
  const end = endTime || new Date();
  return Math.floor((end.getTime() - startedAt.getTime()) / 1000);
}

async function resolveUserId(req: Request): Promise<number | null> {
  let userId = (req as any).user?.id;
  if (userId) return userId;

  const badgeVal = req.body?.badgeId;
  if (!badgeVal) return null;

  const parsedId = parseInt(badgeVal, 10);
  if (!isNaN(parsedId)) {
    return parsedId;
  }

  const [userByUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, badgeVal))
    .limit(1);
  if (userByUsername) return userByUsername.id;

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.employeeCode, badgeVal))
    .limit(1);
  if (emp) {
    const [linkedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.employeeId, emp.id))
      .limit(1);
    if (linkedUser) return linkedUser.id;
    return emp.id;
  }

  return null;
}

function field(row: any, camel: string, snake: string) {
  return row?.[camel] ?? row?.[snake] ?? null;
}

async function resolveItemIdentity(run: any): Promise<{
  itemIdentifier: string;
  serialNumber: string | null;
  travelerId: string | null;
  travelerNumber: string | null;
}> {
  const serialNumber = field(run, 'serialNumber', 'serial_number');
  const travelerId = field(run, 'travelerId', 'traveler_id');

  let travelerNumber: string | null = null;
  if (travelerId) {
    const [traveler] = await db
      .select({
        travelerNumber: travelers.travelerNumber,
        serialNumber: travelers.serialNumber,
        lotNumber: travelers.lotNumber,
      })
      .from(travelers)
      .where(eq(travelers.id, travelerId))
      .limit(1);

    travelerNumber = traveler?.travelerNumber ?? null;
    const travelerSerial = traveler?.serialNumber ?? traveler?.lotNumber ?? null;
    return {
      itemIdentifier: travelerNumber ?? travelerSerial ?? serialNumber ?? travelerId,
      serialNumber: serialNumber ?? travelerSerial,
      travelerId,
      travelerNumber,
    };
  }

  return {
    itemIdentifier: serialNumber ?? field(run, 'id', 'id') ?? 'UNKNOWN_ITEM',
    serialNumber,
    travelerId: null,
    travelerNumber: null,
  };
}

function buildRunSnapshot(run: any, itemIdentity: Awaited<ReturnType<typeof resolveItemIdentity>>, eventType: string, program?: any) {
  return {
    id: field(run, 'id', 'id'),
    itemIdentifier: itemIdentity.itemIdentifier,
    travelerId: itemIdentity.travelerId,
    travelerNumber: itemIdentity.travelerNumber,
    serialNumber: itemIdentity.serialNumber,
    programId: field(run, 'programId', 'program_id'),
    programName: program?.name ?? null,
    instanceName: field(run, 'instanceName', 'instance_name'),
    sku: field(run, 'sku', 'sku'),
    inventoryItemId: field(run, 'inventoryItemId', 'inventory_item_id'),
    mandrelNumber: field(run, 'mandrelNumber', 'mandrel_number'),
    ovenNumber: field(run, 'ovenNumber', 'oven_number'),
    ovenSlot: field(run, 'ovenSlot', 'oven_slot'),
    status: field(run, 'status', 'status'),
    currentStepIndex: field(run, 'currentStepIndex', 'current_step_index'),
    departmentName: field(run, 'departmentName', 'department_name'),
    scannedTravelerBarcode: field(run, 'scannedTravelerBarcode', 'scanned_traveler_barcode'),
    startedAt: field(run, 'startedAt', 'started_at'),
    completedAt: field(run, 'completedAt', 'completed_at'),
    totalElapsedSeconds: field(run, 'totalElapsedSeconds', 'total_elapsed_seconds'),
    recordedEventType: eventType,
  };
}

async function recordItemAudit(run: any, eventType: string, actorUserId: number | null, program?: any): Promise<void> {
  try {
    const identity = await resolveItemIdentity(run);
    const snapshot = buildRunSnapshot(run, identity, eventType, program);
    await pool.query(
      `INSERT INTO production_item_audit_records
        (item_identifier, serial_number, traveler_id, traveler_number, run_id, event_type, event_at, actor_user_id, card_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8::jsonb)`,
      [
        identity.itemIdentifier,
        identity.serialNumber,
        identity.travelerId,
        identity.travelerNumber,
        field(run, 'id', 'id'),
        eventType,
        actorUserId,
        JSON.stringify(snapshot),
      ],
    );
  } catch (err: any) {
    console.warn('[ProductionTimer] Item audit snapshot skipped:', err?.message ?? err);
  }
}

const router = Router();

// Apply optional auth and action token validation to all routes
// This allows public access for viewing while supporting both session auth and inline action tokens
router.use(optionalAuth);
router.use(validateActionToken);

const startRunSchema = z.object({
  programId: z.string().uuid(),
  instanceName: z.string().optional(),
  sku: z.string().optional(),
  serialNumber: z.string().min(1, 'Serial # is required'),
  description: z.string().optional(),
  inventoryItemId: z.number().int().positive('Inventory Item is required').optional(),
  mandrelNumber: z.number().int().min(1).max(3),
  ovenNumber: z.number().int().min(1).max(2),
  ovenSlot: z.enum(['A', 'B']),
  badgeId: z.string().optional(),
  travelerId: z.string().optional(),
  travelerStepId: z.string().optional(),
  travelerTaskId: z.string().optional(),
  departmentName: z.string().optional(),
  scannedTravelerBarcode: z.string().optional(),
});

function extractMandrelNumber(...sources: any[]): number | null {
  const keys = ['mandrelNumber', 'mandrel_number', 'mandrel', 'mandrelNo', 'mandrel_no', 'mandrelId', 'mandrel_id'];
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const value = source[key];
      const parsed = typeof value === 'number' ? value : parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3) return parsed;
    }
  }
  return null;
}

function isOvenCureDepartment(name?: string | null): boolean {
  return /oven|cure/i.test(name || '');
}

function getDepartmentTimerConfig(routing: any, preferredDepartment?: string | null) {
  const departmentConfig = routing?.departmentConfig && typeof routing.departmentConfig === 'object'
    ? routing.departmentConfig as Record<string, any>
    : {};

  if (preferredDepartment && departmentConfig[preferredDepartment]?.timerConfig?.enabled) {
    return { departmentName: preferredDepartment, timerConfig: departmentConfig[preferredDepartment].timerConfig };
  }

  const ovenDept = Object.keys(departmentConfig).find((dept) =>
    isOvenCureDepartment(dept) && departmentConfig[dept]?.timerConfig?.enabled
  );
  if (ovenDept) {
    return { departmentName: ovenDept, timerConfig: departmentConfig[ovenDept].timerConfig };
  }

  const anyTimerDept = Object.keys(departmentConfig).find((dept) => departmentConfig[dept]?.timerConfig?.enabled);
  if (anyTimerDept) {
    return { departmentName: anyTimerDept, timerConfig: departmentConfig[anyTimerDept].timerConfig };
  }

  return { departmentName: preferredDepartment || null, timerConfig: null };
}

async function resolveTimerTravelerScan(scanValue: string) {
  const scannedTravelerBarcode = scanValue.trim();

  let traveler = await db.query.travelers.findFirst({
    where: or(
      ilike(travelers.travelerNumber, scannedTravelerBarcode),
      ilike(travelers.id, scannedTravelerBarcode),
      ilike(travelers.serialNumber, scannedTravelerBarcode),
      ilike(travelers.lotNumber, scannedTravelerBarcode)
    ),
  });

  let serializedItem = await db.query.p2SerializedItems.findFirst({
    where: or(
      ilike(p2SerializedItems.barcode, scannedTravelerBarcode),
      ilike(p2SerializedItems.travelerBarcode, scannedTravelerBarcode),
      ilike(p2SerializedItems.serialNumber, scannedTravelerBarcode)
    ),
  });

  if (!serializedItem && traveler) {
    const travelerSerial = traveler.serialNumber || traveler.lotNumber || traveler.travelerNumber;
    serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.serialNumber, travelerSerial),
        ilike(p2SerializedItems.barcode, travelerSerial),
        ilike(p2SerializedItems.travelerBarcode, travelerSerial)
      ),
    });
  }

  if (!traveler && serializedItem) {
    traveler = await db.query.travelers.findFirst({
      where: or(
        ilike(travelers.serialNumber, serializedItem.serialNumber || serializedItem.barcode),
        ilike(travelers.lotNumber, serializedItem.serialNumber || serializedItem.barcode)
      ),
    });
  }

  if (!serializedItem && !traveler) return null;

  let routing: any = null;
  const routingId = traveler?.partRoutingId || (serializedItem as any)?.partRoutingId || null;
  if (routingId) {
    routing = await db.query.partRoutings.findFirst({
      where: and(eq(partRoutings.id, routingId), eq(partRoutings.isActive, true)),
    });
  }

  if (!routing) {
    const partNumber = traveler?.partNumber || serializedItem?.partNumber || '';
    if (partNumber) {
      routing = await db.query.partRoutings.findFirst({
        where: and(eq(partRoutings.partNumber, partNumber), eq(partRoutings.isActive, true)),
      });
    }
  }

  const departmentSequence = Array.isArray(routing?.departmentSequence) ? routing.departmentSequence as string[] : [];
  const currentDepartment = serializedItem?.currentDepartment
    || departmentSequence[serializedItem?.currentStageIndex || 0]
    || null;
  const timerMatch = getDepartmentTimerConfig(routing, currentDepartment);
  const mandrelNumber = extractMandrelNumber(serializedItem?.metadata, (traveler as any)?.metadata);

  return {
    scannedTravelerBarcode,
    traveler: traveler ? {
      id: traveler.id,
      travelerNumber: traveler.travelerNumber,
      serialNumber: traveler.serialNumber,
      lotNumber: traveler.lotNumber,
      partNumber: traveler.partNumber,
      partName: traveler.partName,
      status: traveler.status,
    } : null,
    serializedItem: serializedItem ? {
      id: serializedItem.id,
      barcode: serializedItem.barcode,
      travelerBarcode: serializedItem.travelerBarcode,
      serialNumber: serializedItem.serialNumber,
      partNumber: serializedItem.partNumber,
      partName: serializedItem.partName,
      currentDepartment: serializedItem.currentDepartment,
      currentStageIndex: serializedItem.currentStageIndex,
      status: serializedItem.status,
      mandrelNumber,
    } : null,
    routing: routing ? {
      id: routing.id,
      partNumber: routing.partNumber,
      partName: routing.partName,
      departmentSequence,
      ovenCureDepartment: timerMatch.departmentName,
      timerConfig: timerMatch.timerConfig,
    } : null,
    timerDefaults: {
      serialNumber: serializedItem?.serialNumber || traveler?.serialNumber || traveler?.lotNumber || scannedTravelerBarcode,
      mandrelNumber,
      programId: timerMatch.timerConfig?.defaultProgramId || null,
      programName: timerMatch.timerConfig?.defaultProgramName || null,
      departmentName: timerMatch.departmentName || currentDepartment || null,
    },
  };
}

router.get('/traveler-scan/:barcode', async (req: Request, res: Response) => {
  try {
    const scanValue = decodeURIComponent(req.params.barcode || '').trim();
    if (!scanValue) {
      return res.status(400).json({ error: 'Traveler barcode is required' });
    }

    const resolved = await resolveTimerTravelerScan(scanValue);
    if (!resolved) {
      return res.status(404).json({ error: 'Traveler or serialized item not found for scanned barcode' });
    }

    return res.json(resolved);
  } catch (error: any) {
    console.error('[ProductionTimer] Error resolving traveler scan:', error);
    return res.status(500).json({ error: 'Failed to resolve traveler scan' });
  }
});

router.post('/runs/start', async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const parseResult = startRunSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { programId, instanceName, sku, serialNumber, inventoryItemId, mandrelNumber, ovenNumber, ovenSlot, travelerId, travelerStepId, travelerTaskId, departmentName, scannedTravelerBarcode } = parseResult.data;

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, programId))
      .limit(1);

    if (!program) {
      return res.status(404).json({ error: 'Program not found' });
    }

    if (!program.isActive) {
      return res.status(400).json({ error: 'Program is not active' });
    }

    const [run] = await db.insert(productionProgramRuns).values({
      programId,
      startedByUserId: userId,
      instanceName: instanceName || null,
      sku: sku || null,
      serialNumber,
      inventoryItemId: inventoryItemId || null,
      mandrelNumber,
      ovenNumber,
      ovenSlot,
      travelerId: travelerId || null,
      travelerStepId: travelerStepId || null,
      travelerTaskId: travelerTaskId || null,
      departmentName: departmentName || null,
      status: 'running',
      currentStepIndex: 0,
      startedAt: new Date(),
      totalElapsedSeconds: 0,
    }).returning();

    await db.insert(productionProgramRunEvents).values({
      runId: run.id,
      eventType: 'started',
      stepIndex: 0,
      userId,
      occurredAt: new Date(),
    });

    // Auto-create linked AS9100 log entry if this program type requires it
    const runWithScan = { ...run, scannedTravelerBarcode: scannedTravelerBarcode || null };
    const { linkedLogId, linkedLogType } = await autoCreateLinkedLog(runWithScan, program, userId);
    if (linkedLogId && linkedLogType) {
      await db.update(productionProgramRuns)
        .set({ linkedLogId, linkedLogType })
        .where(eq(productionProgramRuns.id, run.id));
    }

    await recordItemAudit({ ...runWithScan, linkedLogId, linkedLogType }, 'started', userId, program);

    console.log(`[ProductionTimer] Run started: ${run.id} for program ${program.name}${linkedLogType ? ` (auto-linked ${linkedLogType} log ${linkedLogId})` : ''}`);

    return res.status(201).json({ ...run, linkedLogId, linkedLogType });
  } catch (error: any) {
    console.error('[ProductionTimer] Error starting run:', error);
    return res.status(500).json({ error: 'Failed to start run', detail: error?.message || 'Unknown error' });
  }
});

router.get('/runs/active', async (req: Request, res: Response) => {
  try {
    const travelerStepId = String(req.query.travelerStepId || '');
    if (!travelerStepId) {
      return res.status(400).json({ error: 'travelerStepId is required' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(
        and(
          eq(productionProgramRuns.travelerStepId, travelerStepId),
          or(
            eq(productionProgramRuns.status, 'running'),
            eq(productionProgramRuns.status, 'paused')
          )
        )
      )
      .orderBy(desc(productionProgramRuns.startedAt))
      .limit(1);

    let program = null;
    if (run) {
      const [prog] = await db
        .select({ id: productionPrograms.id, name: productionPrograms.name })
        .from(productionPrograms)
        .where(eq(productionPrograms.id, run.programId))
        .limit(1);
      program = prog || null;
    }

    return res.json({ run: run ?? null, program });
  } catch (error: any) {
    console.error('[ProductionTimer] Error fetching active run:', error);
    return res.status(500).json({ error: 'Failed to fetch active run' });
  }
});

router.post('/runs/:id/pause', async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'running') {
      return res.status(400).json({ error: `Cannot pause run with status: ${run.status}` });
    }

    const now = new Date();
    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'paused', 
        lastPausedAt: now,
        updatedAt: now 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'paused',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: now,
    });

    await recordItemAudit(updated, 'paused', userId);

    console.log(`[ProductionTimer] Run paused: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error pausing run:', error);
    return res.status(500).json({ error: 'Failed to pause run' });
  }
});

router.post('/runs/:id/step-timeout', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'running') {
      return res.status(400).json({ error: `Cannot timeout run with status: ${run.status}` });
    }

    const now = new Date();
    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'awaiting_next', 
        lastPausedAt: now,
        updatedAt: now 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'step_timeout',
      stepIndex: run.currentStepIndex,
      occurredAt: now,
    });

    await recordItemAudit(updated, 'step_timeout', null);

    console.log(`[ProductionTimer] Step timed out, awaiting next: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error on step timeout:', error);
    return res.status(500).json({ error: 'Failed to handle step timeout' });
  }
});

router.post('/runs/:id/resume', async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'paused' && run.status !== 'awaiting_next') {
      return res.status(400).json({ error: `Cannot resume run with status: ${run.status}` });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'running', 
        updatedAt: new Date() 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'resumed',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: new Date(),
    });

    await recordItemAudit(updated, 'resumed', userId);

    console.log(`[ProductionTimer] Run resumed: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error resuming run:', error);
    return res.status(500).json({ error: 'Failed to resume run' });
  }
});

router.post('/runs/:id/advance', async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'stopped') {
      return res.status(400).json({ error: `Cannot advance run with status: ${run.status}` });
    }

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, run.programId))
      .orderBy(productionProgramSteps.stepIndex);

    const totalSteps = steps.length;
    const nextStepIndex = run.currentStepIndex + 1;

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'step_complete',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: new Date(),
    });

    if (nextStepIndex >= totalSteps) {
      const completedAt = new Date();
      const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, completedAt);

      const [updated] = await db
        .update(productionProgramRuns)
        .set({ 
          status: 'completed',
          completedAt,
          totalElapsedSeconds,
          updatedAt: new Date(),
        })
        .where(eq(productionProgramRuns.id, id))
        .returning();

      await db.insert(productionProgramRunEvents).values({
        runId: id,
        eventType: 'program_completed',
        stepIndex: run.currentStepIndex,
        userId,
        occurredAt: completedAt,
      });

      // Auto-close linked AS9100 log entry
      await autoCloseLinkedLog(run, 'PASS', completedAt);
      await recordItemAudit(updated, 'program_completed', userId);

      console.log(`[ProductionTimer] Run completed: ${id}, elapsed: ${totalElapsedSeconds}s`);

      return res.json({ ...updated, message: 'Run completed' });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        currentStepIndex: nextStepIndex,
        status: 'running',
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'advanced',
      stepIndex: nextStepIndex,
      userId,
      occurredAt: new Date(),
    });

    await recordItemAudit(updated, 'advanced', userId);

    console.log(`[ProductionTimer] Run advanced to step ${nextStepIndex}: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error advancing run:', error);
    return res.status(500).json({ error: 'Failed to advance run' });
  }
});

router.post('/runs/:id/stop', async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'stopped') {
      return res.status(400).json({ error: `Run already ${run.status}` });
    }

    const completedAt = new Date();
    const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, completedAt);

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'stopped',
        completedAt,
        totalElapsedSeconds,
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'stopped',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: completedAt,
    });

    // Auto-close linked AS9100 log entry (with STOPPED result so technicians know it was interrupted)
    await autoCloseLinkedLog(run, 'STOPPED', completedAt);
    await recordItemAudit(updated, 'stopped', userId);

    console.log(`[ProductionTimer] Run stopped: ${id}, elapsed: ${totalElapsedSeconds}s`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error stopping run:', error);
    return res.status(500).json({ error: 'Failed to stop run' });
  }
});

function calculateCumulativePauseSeconds(events: any[]): number {
  let totalPauseSeconds = 0;
  let lastPauseTime: Date | null = null;

  for (const event of events) {
    if (event.eventType === 'paused') {
      lastPauseTime = new Date(event.occurredAt);
    } else if (event.eventType === 'resumed' && lastPauseTime) {
      const resumeTime = new Date(event.occurredAt);
      totalPauseSeconds += Math.floor((resumeTime.getTime() - lastPauseTime.getTime()) / 1000);
      lastPauseTime = null;
    }
  }

  // If still paused, add time from last pause to now
  if (lastPauseTime) {
    totalPauseSeconds += Math.floor((Date.now() - lastPauseTime.getTime()) / 1000);
  }

  return totalPauseSeconds;
}

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const runsResult = await pool.query(
      `SELECT * FROM production_program_runs ORDER BY started_at DESC LIMIT 100`
    );
    const runs = runsResult || [];

    const runsWithDetails = await Promise.all(runs.map(async (run: any) => {
      const itemIdentity = await resolveItemIdentity(run);
      const events = await pool.query(
        `SELECT * FROM production_program_run_events WHERE run_id = $1 ORDER BY occurred_at`,
        [run.id]
      ) || [];

      const programs = await pool.query(
        `SELECT * FROM production_programs WHERE id = $1 LIMIT 1`,
        [run.program_id]
      ) || [];
      const program = programs[0] || null;

      const steps = await pool.query(
        `SELECT * FROM production_program_steps WHERE program_id = $1 ORDER BY step_index`,
        [run.program_id]
      ) || [];

      const mappedEvents = events.map((e: any) => ({
        id: e.id,
        runId: e.run_id,
        eventType: e.event_type,
        stepIndex: e.step_index,
        userId: e.user_id,
        occurredAt: e.occurred_at,
      }));

      const cumulativePauseSeconds = calculateCumulativePauseSeconds(mappedEvents);

      return {
        id: run.id,
        itemIdentifier: itemIdentity.itemIdentifier,
        travelerId: itemIdentity.travelerId,
        travelerNumber: itemIdentity.travelerNumber,
        programId: run.program_id,
        startedByUserId: run.started_by_user_id,
        instanceName: run.instance_name,
        sku: run.sku,
        serialNumber: run.serial_number,
        inventoryItemId: run.inventory_item_id,
        mandrelNumber: run.mandrel_number,
        ovenNumber: run.oven_number,
        ovenSlot: run.oven_slot,
        status: run.status,
        currentStepIndex: run.current_step_index,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        lastPausedAt: run.last_paused_at,
        totalElapsedSeconds: run.total_elapsed_seconds,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        program: program ? {
          id: program.id,
          name: program.name,
          description: program.description,
        } : null,
        steps: steps.map((s: any) => ({
          id: s.id,
          programId: s.program_id,
          stepIndex: s.step_index,
          stepName: s.step_name,
          durationSeconds: s.duration_seconds,
        })),
        cumulativePauseSeconds,
      };
    }));

    return res.json(runsWithDetails);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching runs:', error);
    return res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

router.get('/runs/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const runs = await db
      .select({
        id: productionProgramRuns.id,
        programId: productionProgramRuns.programId,
        instanceName: productionProgramRuns.instanceName,
        sku: productionProgramRuns.sku,
        serialNumber: productionProgramRuns.serialNumber,
        inventoryItemId: productionProgramRuns.inventoryItemId,
        mandrelNumber: productionProgramRuns.mandrelNumber,
        ovenNumber: productionProgramRuns.ovenNumber,
        ovenSlot: productionProgramRuns.ovenSlot,
        status: productionProgramRuns.status,
        startedAt: productionProgramRuns.startedAt,
        completedAt: productionProgramRuns.completedAt,
        totalElapsedSeconds: productionProgramRuns.totalElapsedSeconds,
        programName: productionPrograms.name,
      })
      .from(productionProgramRuns)
      .leftJoin(productionPrograms, eq(productionProgramRuns.programId, productionPrograms.id))
      .where(
        or(
          eq(productionProgramRuns.status, 'completed'),
          eq(productionProgramRuns.status, 'stopped')
        )
      )
      .orderBy(desc(productionProgramRuns.completedAt))
      .limit(limit);

    return res.json(runs);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching history:', error);
    return res.status(500).json({ error: 'Failed to fetch run history' });
  }
});

router.get('/runs/item-audit/:identifier', async (req: Request, res: Response) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const records = await pool.query(
      `SELECT
         id,
         item_identifier,
         serial_number,
         traveler_id,
         traveler_number,
         run_id,
         event_type,
         event_at,
         actor_user_id,
         card_snapshot,
         created_at
       FROM production_item_audit_records
       WHERE item_identifier = $1
          OR serial_number = $1
          OR traveler_number = $1
          OR traveler_id = $1
       ORDER BY event_at DESC, created_at DESC
       LIMIT 250`,
      [identifier],
    );

    return res.json({
      identifier,
      records: records.map((row: any) => ({
        id: row.id,
        itemIdentifier: row.item_identifier,
        serialNumber: row.serial_number,
        travelerId: row.traveler_id,
        travelerNumber: row.traveler_number,
        runId: row.run_id,
        eventType: row.event_type,
        eventAt: row.event_at,
        actorUserId: row.actor_user_id,
        cardSnapshot: row.card_snapshot,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('[ProductionTimer] Error fetching item audit:', error);
    return res.status(500).json({ error: 'Failed to fetch item audit records' });
  }
});

router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const events = await db
      .select()
      .from(productionProgramRunEvents)
      .where(eq(productionProgramRunEvents.runId, id))
      .orderBy(productionProgramRunEvents.occurredAt);

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, run.programId))
      .limit(1);

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, run.programId))
      .orderBy(productionProgramSteps.stepIndex);

    const itemIdentity = await resolveItemIdentity(run);

    return res.json({
      ...run,
      itemIdentifier: itemIdentity.itemIdentifier,
      travelerNumber: itemIdentity.travelerNumber,
      program,
      steps,
      events,
    });
  } catch (error) {
    console.error('[ProductionTimer] Error fetching run:', error);
    return res.status(500).json({ error: 'Failed to fetch run' });
  }
});

router.patch('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { instanceName, sku, serialNumber, mandrelNumber, ovenNumber, ovenSlot } = req.body;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({
        instanceName: instanceName !== undefined ? instanceName : run.instanceName,
        sku: sku !== undefined ? sku : run.sku,
        serialNumber: serialNumber !== undefined ? serialNumber : run.serialNumber,
        mandrelNumber: mandrelNumber !== undefined ? mandrelNumber : run.mandrelNumber,
        ovenNumber: ovenNumber !== undefined ? ovenNumber : run.ovenNumber,
        ovenSlot: ovenSlot !== undefined ? ovenSlot : run.ovenSlot,
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await recordItemAudit(updated, 'updated', null);

    console.log(`[ProductionTimer] Run updated: ${id}`);
    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error updating run:', error);
    return res.status(500).json({ error: 'Failed to update run' });
  }
});

router.delete('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    await db.delete(productionProgramRunEvents).where(eq(productionProgramRunEvents.runId, id));
    await db.delete(productionProgramRuns).where(eq(productionProgramRuns.id, id));

    console.log(`[ProductionTimer] Run deleted: ${id}`);
    return res.json({ success: true, message: 'Run deleted successfully' });
  } catch (error) {
    console.error('[ProductionTimer] Error deleting run:', error);
    return res.status(500).json({ error: 'Failed to delete run' });
  }
});

router.get('/programs', async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    
    const programs = includeInactive
      ? await db.select().from(productionPrograms).orderBy(productionPrograms.name)
      : await db.select().from(productionPrograms).where(eq(productionPrograms.isActive, true)).orderBy(productionPrograms.name);

    const programsWithSteps = await Promise.all(
      programs.map(async (program) => {
        const steps = await db
          .select()
          .from(productionProgramSteps)
          .where(eq(productionProgramSteps.programId, program.id))
          .orderBy(productionProgramSteps.stepIndex);
        return { ...program, steps };
      })
    );

    return res.json(programsWithSteps);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching programs:', error);
    return res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

const createProgramSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string().optional(),
  programType: z.enum(['single', 'multi']),
  logType: z.enum(['none', 'oven_cure', 'vacuum_leak_test', 'final_inspection']).default('none'),
  steps: z.array(z.object({
    stepName: z.string().min(1),
    durationMinutes: z.number().positive('Duration must be greater than 0'),
  })).min(1, 'At least one step is required'),
});

router.post('/programs', async (req: Request, res: Response) => {
  try {
    const parseResult = createProgramSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { name, description, programType, logType, steps } = parseResult.data;

    if (programType === 'multi' && steps.length < 2) {
      return res.status(400).json({ error: 'Multi-step programs must have at least 2 steps' });
    }

    const [program] = await db.insert(productionPrograms).values({
      name,
      description: description || null,
      logType: logType || 'none',
      isActive: true,
    }).returning();

    const stepsToInsert = steps.map((step, index) => ({
      programId: program.id,
      stepIndex: index,
      stepName: step.stepName,
      durationSeconds: Math.round(step.durationMinutes * 60),
    }));

    await db.insert(productionProgramSteps).values(stepsToInsert);

    const insertedSteps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, program.id))
      .orderBy(productionProgramSteps.stepIndex);

    console.log(`[ProductionTimer] Program created: ${program.id} - ${name}`);

    return res.status(201).json({ ...program, steps: insertedSteps });
  } catch (error) {
    console.error('[ProductionTimer] Error creating program:', error);
    return res.status(500).json({ error: 'Failed to create program' });
  }
});

router.put('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = createProgramSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { name, description, programType, logType, steps } = parseResult.data;

    if (programType === 'multi' && steps.length < 2) {
      return res.status(400).json({ error: 'Multi-step programs must have at least 2 steps' });
    }

    const [existing] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const [program] = await db.update(productionPrograms)
      .set({
        name,
        description: description || null,
        logType: logType || 'none',
        updatedAt: new Date(),
      })
      .where(eq(productionPrograms.id, id))
      .returning();

    await db.delete(productionProgramSteps).where(eq(productionProgramSteps.programId, id));

    const stepsToInsert = steps.map((step, index) => ({
      programId: id,
      stepIndex: index,
      stepName: step.stepName,
      durationSeconds: Math.round(step.durationMinutes * 60),
    }));

    await db.insert(productionProgramSteps).values(stepsToInsert);

    const updatedSteps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, id))
      .orderBy(productionProgramSteps.stepIndex);

    console.log(`[ProductionTimer] Program updated: ${id} - ${name}`);

    return res.json({ ...program, steps: updatedSteps });
  } catch (error) {
    console.error('[ProductionTimer] Error updating program:', error);
    return res.status(500).json({ error: 'Failed to update program' });
  }
});

router.delete('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const [updated] = await db.update(productionPrograms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(productionPrograms.id, id))
      .returning();

    console.log(`[ProductionTimer] Program deactivated: ${id}`);

    return res.json({ message: 'Program deactivated', program: updated });
  } catch (error) {
    console.error('[ProductionTimer] Error deleting program:', error);
    return res.status(500).json({ error: 'Failed to delete program' });
  }
});

router.get('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!program) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, id))
      .orderBy(productionProgramSteps.stepIndex);

    return res.json({ ...program, steps });
  } catch (error) {
    console.error('[ProductionTimer] Error fetching program:', error);
    return res.status(500).json({ error: 'Failed to fetch program' });
  }
});

export default router;
