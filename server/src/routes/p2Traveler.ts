import { Router, type Request, type Response } from 'express';
import { db } from '../../db';
import { 
  p2SerializedItems, 
  p2SerializedItemEvents, 
  p2WorkTasks,
  partRoutings,
  p2EmployeePartCertifications,
  p2SerializedItemTraceability,
  p2SerializedItemCustomData,
  employees,
  travelers,
  travelerSteps,
  travelerTasks,
  p2PurchaseOrderItems,
  inventoryItems,
  cuttingBuiltPackets,
  cuttingBuiltPacketFabricSources,
  cuttingFabricInventory,
  insertP2WorkTaskSchema,
  insertP2SerializedItemEventSchema,
  insertP2SerializedItemTraceabilitySchema,
  insertP2SerializedItemCustomDataSchema,
  P2_DEPARTMENT_STAGES,
} from '../../schema';
import { eq, and, desc, or, ilike, inArray, asc, sql } from 'drizzle-orm';
import { storage } from '../../storage';
import { createEmployeeIdentitySnapshot } from '../../identity/userIdentity';
import { buildChargeContextFromTraveler } from '../helpers/travelerBarcodeResolver';
import { executeTravelerAutoPunch, type TravelerAutoPunchResult } from './timeClock';
import { ensureProductionWorkflowReadSchema } from '../lib/productionWorkflowReadiness';

const router = Router();

router.use(async (_req, res, next) => {
  try {
    await ensureProductionWorkflowReadSchema();
    next();
  } catch (error) {
    console.error('[P2Traveler] Schema readiness check failed:', error);
    res.status(503).json({ error: 'Production traveler schema is not ready, please retry' });
  }
});

/**
 * Task #188: Auto-switch the operator's punch_ledger session to the WAD's
 * charge code when they start a P2 Traveler task. Reuses the same gates as
 * the kiosk traveler-scan flow (executeTravelerAutoPunch).
 *
 * Returns:
 *   - { ok: true,  punch: { action, chargeCode, warning? } } on success
 *   - { ok: false, status, body }                            to short-circuit the route
 *
 * Fail-closed: when no traveler is linked, or any kiosk-equivalent gate
 * (WAD release, material readiness, certification, PTO, charge-code
 * resolution, charge-code activeness, budget) fails, returns { ok: false }
 * so the caller does NOT create or resume a p2_work_tasks row.
 */
async function runAutoPunchForP2Task(params: {
  serialNumber: string;
  partNumber: string;
  inventoryItemId?: string | number | null;
  employeeId: string | number;
  laborApprovalId?: number | null;
  adminPtoOverride?: boolean;
  adminOverrideReason?: string | null;
  user?: Express.Request['user'] | null;
  ip?: string | null;
}): Promise<
  | {
      ok: true;
      entry: any;
      chargeContext: any;
      punch: { action: 'clockedIn' | 'switched' | 'unchanged'; chargeCode?: string | null; warning?: string };
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const travelerPartMatches = [eq(travelers.partNumber, params.partNumber)];
  if (params.inventoryItemId != null) {
    travelerPartMatches.push(eq(travelers.inventoryItemId, String(params.inventoryItemId)));
  }

  const linkedTraveler = await db
    .select({
      id: travelers.id,
      travelerNumber: travelers.travelerNumber,
      productionWorkOrderId: travelers.productionWorkOrderId,
    })
    .from(travelers)
    .where(
      and(
        eq(travelers.serialNumber, params.serialNumber),
        or(...travelerPartMatches),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!linkedTraveler) {
    // Fail-closed: a P2 task cannot start without a traveler/WAD link, otherwise
    // we would create a p2_work_tasks row that is not anchored to any project
    // charge code, breaking the unified labor pipeline (Constitution §5.2).
    return {
      ok: false,
      status: 409,
      body: {
        error: 'NO_TRAVELER_LINK',
        message:
          'No traveler is linked to this serialized item. Generate a traveler before starting work.',
      },
    };
  }
  const ctxResult = await buildChargeContextFromTraveler(linkedTraveler);
  if (!ctxResult.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: ctxResult.error.code || 'CHARGE_CODE_UNRESOLVED',
        message: ctxResult.error.message,
      },
    };
  }
  const autoPunch: TravelerAutoPunchResult = await executeTravelerAutoPunch({
    context: ctxResult.context,
    employeeIdString: String(params.employeeId),
    parsedApprovalId: params.laborApprovalId ?? null,
    ptoOverride:
      params.adminPtoOverride
        ? {
            requested: true,
            reason: params.adminOverrideReason ?? null,
            user: params.user ?? null,
            ip: params.ip ?? null,
          }
        : undefined,
  });
  if (!autoPunch.ok) {
    return { ok: false, status: autoPunch.status, body: autoPunch.body };
  }
  return {
    ok: true,
    entry: autoPunch.entry,
    chargeContext: autoPunch.chargeContext,
    punch: {
      action: autoPunch.action,
      chargeCode:
        autoPunch.chargeContext?.resolvedChargeCode ??
        autoPunch.chargeContext?.chargeCode ??
        null,
      warning: autoPunch.warning,
    },
  };
}

function getTraceValue(item: any): string {
  return typeof item?.value === 'string' ? item.value.trim() : '';
}

function isPacketTraceItem(item: any): boolean {
  const type = String(item?.type || '').toLowerCase();
  return Boolean(item?.builtPacketId || item?.packetBarcode || type.includes('packet'));
}

async function expandAndConsumePacketTraceability(params: {
  traceabilityData: any[];
  serializedItem: typeof p2SerializedItems.$inferSelect;
  department: string;
  recordedBy: string;
  workTaskId: string;
}) {
  const { traceabilityData, serializedItem, department, recordedBy, workTaskId } = params;
  const expandedTraceability = [...traceabilityData];
  const packetTraceRecords: Array<typeof p2SerializedItemTraceability.$inferInsert> = [];
  const consumedPackets: Array<{ id: number; barcode: string; status: string }> = [];
  const seenPacketIds = new Set<number>();

  for (const item of traceabilityData) {
    const scanValue = getTraceValue(item);
    if (!scanValue && !item?.builtPacketId) continue;
    if (!isPacketTraceItem(item) && item?.type !== 'material_lot') continue;

    let packet = item?.builtPacketId
      ? await db.query.cuttingBuiltPackets.findFirst({
          where: eq(cuttingBuiltPackets.id, Number(item.builtPacketId)),
        })
      : null;

    if (!packet && scanValue) {
      packet = await db.query.cuttingBuiltPackets.findFirst({
        where: eq(cuttingBuiltPackets.barcode, scanValue),
      });
    }

    if (!packet || seenPacketIds.has(packet.id)) continue;
    seenPacketIds.add(packet.id);

    const allocatedToThisItem = [serializedItem.id, serializedItem.barcode, serializedItem.serialNumber]
      .filter(Boolean)
      .includes(packet.allocatedToOrder || '');

    const usablePacketStatuses = new Set(['AVAILABLE', 'ALLOCATED']);
    if (packet.status && !usablePacketStatuses.has(packet.status) && !allocatedToThisItem) {
      throw new Error(`Packet ${packet.barcode} is already ${packet.status.toLowerCase()}${packet.allocatedToOrder ? ` for ${packet.allocatedToOrder}` : ''}`);
    }

    const fabricSources = await db
      .select({
        sourceId: cuttingBuiltPacketFabricSources.id,
        fabricInventoryId: cuttingBuiltPacketFabricSources.fabricInventoryId,
        fabricType: cuttingBuiltPacketFabricSources.fabricType,
        lotNumber: cuttingBuiltPacketFabricSources.lotNumber,
        batchNumber: cuttingBuiltPacketFabricSources.batchNumber,
        rollNumber: cuttingBuiltPacketFabricSources.rollNumber,
        supplierPartNumber: cuttingBuiltPacketFabricSources.supplierPartNumber,
        internalControlNumber: cuttingBuiltPacketFabricSources.internalControlNumber,
        expirationDate: cuttingBuiltPacketFabricSources.expirationDate,
        quantityUsed: cuttingBuiltPacketFabricSources.quantityUsed,
        invFabric: cuttingFabricInventory.fabric,
        invLotNumber: cuttingFabricInventory.lotNumber,
        invBatchNumber: cuttingFabricInventory.batchNumber,
        invRollNumber: cuttingFabricInventory.rollNumber,
        invInternalControlNumber: cuttingFabricInventory.internalControlNumber,
        invExpirationDate: cuttingFabricInventory.expirationDate,
        invSupplierPartNumber: cuttingFabricInventory.supplierPartNumber,
        invFabricPartNumber: cuttingFabricInventory.fabricPartNumber,
      })
      .from(cuttingBuiltPacketFabricSources)
      .leftJoin(
        cuttingFabricInventory,
        eq(cuttingBuiltPacketFabricSources.fabricInventoryId, cuttingFabricInventory.id)
      )
      .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));

    await db
      .update(cuttingBuiltPackets)
      .set({
        status: 'CONSUMED',
        allocatedToOrder: serializedItem.id,
        consumedAt: new Date(),
        consumedBy: recordedBy,
        updatedAt: new Date(),
        notes: packet.notes
          ? `${packet.notes}\nConsumed by P2 traveler ${serializedItem.barcode} (${department}) task ${workTaskId}`
          : `Consumed by P2 traveler ${serializedItem.barcode} (${department}) task ${workTaskId}`,
      })
      .where(eq(cuttingBuiltPackets.id, packet.id));

    packetTraceRecords.push({
      serializedItemId: serializedItem.id,
      department,
      inventoryPartId: String(packet.id),
      inventoryPartNumber: packet.barcode,
      traceabilityType: 'packet_barcode',
      traceabilityLabel: 'Packet Barcode',
      traceabilityValue: packet.barcode,
      recordedBy,
    });

    for (const [index, source] of fabricSources.entries()) {
      const sourceLabel = `Packet ${packet.packetNumber} Source ${index + 1}`;
      const sourcePartNumber = source.supplierPartNumber || source.invSupplierPartNumber || source.invFabricPartNumber || null;
      const sourceFields = [
        ['fabric_type', 'Fabric Type', source.fabricType || source.invFabric],
        ['fabric_lot_number', 'Fabric Lot Number', source.lotNumber || source.invLotNumber],
        ['fabric_batch_number', 'Fabric Batch Number', source.batchNumber || source.invBatchNumber],
        ['fabric_roll_number', 'Fabric Roll Number', source.rollNumber || source.invRollNumber],
        ['fabric_internal_control_number', 'Fabric Internal Control Number', source.internalControlNumber || source.invInternalControlNumber],
        ['fabric_supplier_part_number', 'Fabric Supplier Part Number', sourcePartNumber],
        ['fabric_expiration_date', 'Fabric Expiration Date', source.expirationDate || source.invExpirationDate],
      ] as const;

      for (const [type, label, rawValue] of sourceFields) {
        if (rawValue == null || rawValue === '') continue;
        const value = rawValue instanceof Date ? rawValue.toISOString().slice(0, 10) : String(rawValue);
        packetTraceRecords.push({
          serializedItemId: serializedItem.id,
          department,
          inventoryPartId: source.fabricInventoryId || null,
          inventoryPartNumber: sourcePartNumber,
          traceabilityType: type,
          traceabilityLabel: `${sourceLabel} - ${label}`,
          traceabilityValue: value,
          recordedBy,
        });
      }
    }

    expandedTraceability.push({
      type: 'packet_consumption',
      label: 'Packet Consumption',
      value: packet.barcode,
      builtPacketId: packet.id,
      packetBarcode: packet.barcode,
      fabricSourceCount: fabricSources.length,
    });
    consumedPackets.push({ id: packet.id, barcode: packet.barcode, status: 'CONSUMED' });
  }

  return { expandedTraceability, packetTraceRecords, consumedPackets };
}

// Department name aliases for matching certifications with routing names
const DEPARTMENT_ALIASES: Record<string, string[]> = {
  'Assemble/Disassembly': ['Assembly/Disassembly', 'Assemble/Disassembly'],
  'Assembly/Disassembly': ['Assembly/Disassembly', 'Assemble/Disassembly'],
};

function getDepartmentVariants(department: string): string[] {
  return DEPARTMENT_ALIASES[department] || [department];
}

async function getSerializedItemInventoryIdentity(serializedItem: any) {
  let poItem: typeof p2PurchaseOrderItems.$inferSelect | null = null;
  let inventoryItem: typeof inventoryItems.$inferSelect | null = null;

  if (serializedItem?.poItemId) {
    poItem = await db.query.p2PurchaseOrderItems.findFirst({
      where: eq(p2PurchaseOrderItems.id, serializedItem.poItemId),
    }) ?? null;
  }

  if (poItem?.inventoryItemId) {
    inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, poItem.inventoryItemId),
    }) ?? null;
  }

  if (!inventoryItem && serializedItem?.partNumber) {
    inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, serializedItem.partNumber),
    }) ?? null;
  }

  return {
    poItem,
    inventoryItem,
    inventoryItemId: poItem?.inventoryItemId ?? inventoryItem?.id ?? null,
    internalPartNumber: inventoryItem?.agPartNumber ?? poItem?.partNumber ?? serializedItem?.partNumber ?? null,
    partName: inventoryItem?.name ?? poItem?.partName ?? serializedItem?.partName ?? null,
  };
}

async function findActiveRoutingForSerializedItem(serializedItem: any) {
  const identity = await getSerializedItemInventoryIdentity(serializedItem);

  if ((serializedItem as any).partRoutingId) {
    const linkedRouting = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.id, (serializedItem as any).partRoutingId),
        eq(partRoutings.isActive, true)
      ),
    });
    if (linkedRouting) return linkedRouting;
  }

  if (identity.inventoryItemId != null) {
    const byInventoryItem = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.inventoryItemId, String(identity.inventoryItemId)),
        eq(partRoutings.isActive, true)
      ),
    });
    if (byInventoryItem) return byInventoryItem;
  }

  if (identity.internalPartNumber) {
    const byInternalPartNumber = await db.query.partRoutings.findFirst({
      where: and(
        eq(partRoutings.partNumber, identity.internalPartNumber),
        eq(partRoutings.isActive, true)
      ),
    });
    if (byInternalPartNumber) return byInternalPartNumber;

    const byInternalPartNumberCase = await db.query.partRoutings.findFirst({
      where: and(
        ilike(partRoutings.partNumber, identity.internalPartNumber),
        eq(partRoutings.isActive, true)
      ),
    });
    if (byInternalPartNumberCase) return byInternalPartNumberCase;
  }

  let routing = await db.query.partRoutings.findFirst({
    where: and(
      eq(partRoutings.partNumber, serializedItem.partNumber),
      eq(partRoutings.isActive, true)
    ),
  });

  if (!routing) {
    routing = await db.query.partRoutings.findFirst({
      where: and(
        ilike(partRoutings.partNumber, serializedItem.partNumber),
        eq(partRoutings.isActive, true)
      ),
    });
  }

  if (!routing) {
    const basePartMatch = serializedItem.partNumber?.match(/^(.+?)\s*Rev\s*\w+$/i);
    if (basePartMatch) {
      const basePartNumber = basePartMatch[1].trim();
      const allRoutings = await db
        .select()
        .from(partRoutings)
        .where(and(
          ilike(partRoutings.partNumber, `${basePartNumber} Rev%`),
          eq(partRoutings.isActive, true)
        ));
      if (allRoutings.length > 0) {
        routing = allRoutings[0];
      }
    }
  }

  return routing ?? null;
}

function operationTypeToTravelerTaskType(operationType: string | null | undefined) {
  switch (operationType) {
    case 'SETUP':
    case 'RUN':
      return 'PROCESS';
    case 'INSPECT':
    case 'QC':
      return 'QC';
    case 'OSP':
      return 'SPECIAL_PROCESS';
    case 'MATERIAL':
      return 'TRACE';
    default:
      return 'CHECK';
  }
}

function operationTypeToTravelerPhase(operationType: string | null | undefined) {
  switch (operationType) {
    case 'SETUP':
    case 'MATERIAL':
      return 'START';
    case 'QC':
    case 'INSPECT':
      return 'FINISH';
    default:
      return 'WORK';
  }
}

async function ensureExistingTravelerHasRoutingDetails(params: {
  traveler: typeof travelers.$inferSelect;
  routing: typeof partRoutings.$inferSelect | null;
  actor: string;
}) {
  const { traveler, routing, actor } = params;
  if (!routing) return false;

  const travelerRoutingPatch: Record<string, unknown> = {};
  if (traveler.partRoutingId !== routing.id) {
    travelerRoutingPatch.partRoutingId = routing.id;
    travelerRoutingPatch.partRoutingRevision = (routing as any).routingRevision || traveler.partRoutingRevision || 1;
  }
  if (traveler.inventoryItemId !== routing.inventoryItemId) {
    travelerRoutingPatch.inventoryItemId = routing.inventoryItemId;
  }
  if (Object.keys(travelerRoutingPatch).length > 0) {
    await db
      .update(travelers)
      .set({
        ...travelerRoutingPatch,
        updatedAt: new Date(),
      } as any)
      .where(eq(travelers.id, traveler.id));
  }

  const existingSteps = await db
    .select({ id: travelerSteps.id })
    .from(travelerSteps)
    .where(eq(travelerSteps.travelerId, traveler.id))
    .limit(1);

  if (existingSteps.length > 0) return false;

  const operations = await storage.getRoutingOperations(routing.id);
  if (operations.length > 0) {
    const stepGroups = new Map<string, Array<(typeof operations)[number]>>();
    for (const op of operations) {
      const key = `${op.stepNumber}__${op.departmentName}`;
      if (!stepGroups.has(key)) stepGroups.set(key, []);
      stepGroups.get(key)!.push(op);
    }

    const sortedKeys = Array.from(stepGroups.keys()).sort((a, b) => {
      const [aStep] = a.split('__').map(Number);
      const [bStep] = b.split('__').map(Number);
      return aStep - bStep;
    });

    let stepNumber = 0;
    for (const key of sortedKeys) {
      const groupOps = stepGroups.get(key)!;
      const departmentName = groupOps[0].departmentName;
      const step = await storage.createTravelerStep({
        travelerId: traveler.id,
        departmentName,
        stepNumber: ++stepNumber,
        status: 'NOT_STARTED',
        assignedTechnicianId: null,
      } as any);

      let sortOrder = 0;
      for (const op of groupOps) {
        const instructionPack = op.instructionPack as any;
        await storage.createTravelerTask({
          travelerStepId: step.id,
          taskType: operationTypeToTravelerTaskType(op.operationType) as any,
          taskPhase: operationTypeToTravelerPhase(op.operationType) as any,
          title: op.operationName,
          instructions: instructionPack?.specialNotes || op.operationName,
          required: true,
          sortOrder: sortOrder++,
          timePolicy: 'AUTO_ON_COMPLETE',
          requiresSignature: op.requiresSignature ?? false,
          signatureRole: op.requiresSignature ? 'OPERATOR' : null,
          requiresCertification: op.requiresCertification ?? false,
          instructionPack,
          status: 'NOT_STARTED',
        } as any);
      }
    }
  } else {
    const departmentSequence = Array.isArray(routing.departmentSequence)
      ? routing.departmentSequence as string[]
      : [];

    let stepNumber = 0;
    for (const departmentName of departmentSequence) {
      const step = await storage.createTravelerStep({
        travelerId: traveler.id,
        departmentName,
        stepNumber: ++stepNumber,
        status: 'NOT_STARTED',
        assignedTechnicianId: null,
      } as any);

      await storage.createTravelerTask({
        travelerStepId: step.id,
        taskType: 'CHECK',
        taskPhase: 'START',
        title: 'Badge Scan',
        instructions: `Badge scan to start work in ${departmentName}`,
        required: true,
        sortOrder: 0,
        timePolicy: 'AUTO_ON_START',
        requiresSignature: false,
        signatureRole: null,
        requiresCertification: true,
        status: 'NOT_STARTED',
      } as any);

      await storage.createTravelerTask({
        travelerStepId: step.id,
        taskType: 'SIGNATURE',
        taskPhase: 'FINISH',
        title: `Complete ${departmentName}`,
        instructions: `Badge scan to complete ${departmentName}`,
        required: true,
        sortOrder: 1,
        timePolicy: 'AUTO_ON_COMPLETE',
        requiresSignature: false,
        signatureRole: null,
        requiresCertification: false,
        status: 'NOT_STARTED',
      } as any);
    }
  }

  await storage.createTravelerEvent({
    travelerId: traveler.id,
    actor,
    action: 'ROUTING_STEPS_REPAIRED',
    details: {
      fromRoutingId: routing.id,
      fromRoutingRevision: (routing as any).routingRevision || 1,
      reason: 'Existing P2 traveler had no steps/tasks when opened from barcode scan',
    },
  });

  return true;
}

// GET /api/p2-traveler/badge-lookup/:employeeCode
// Look up employee by badge code (badge_scan_code UUID or employee_code)
router.get('/badge-lookup/:employeeCode', async (req: Request, res: Response) => {
  try {
    const { employeeCode } = req.params;
    // Normalize: strip dashes so UUID badges work whether or not they include hyphens.
    const normalized = employeeCode.replace(/-/g, '');

    const cols = {
      id: employees.id,
      name: employees.name,
      employeeCode: employees.employeeCode,
    };

    // Try badge_scan_code first (REPLACE strips dashes on both sides), then employee_code
    let rows = await db
      .select(cols)
      .from(employees)
      .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalized}`)
      .limit(1);

    if (!rows.length) {
      rows = await db
        .select(cols)
        .from(employees)
        .where(sql`LOWER(${employees.employeeCode}) = LOWER(${employeeCode})`)
        .limit(1);
    }

    if (!rows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = rows[0];
    res.json({
      id: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name || emp.employeeCode,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Badge lookup failed' });
  }
});

// GET /api/p2-traveler/employee-lookup?name=John+Smith
// Public name-based employee lookup for manual fallback on the traveler execute page.
// Returns 404 when not found, 409 when multiple employees share the same name.
router.get('/employee-lookup', async (req: Request, res: Response) => {
  try {
    const { name } = req.query;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name parameter is required' });
    }

    const rows = await db
      .select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode })
      .from(employees)
      .where(sql`LOWER(${employees.name}) = LOWER(${name.trim()})`)
      .limit(2);

    if (!rows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (rows.length > 1) {
      return res.status(409).json({ error: 'Multiple employees found with that name' });
    }

    const emp = rows[0];
    res.json({ id: emp.id, name: emp.name, employeeCode: emp.employeeCode });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Employee lookup failed' });
  }
});

// GET /api/p2-traveler/verify-certification/:employeeCode/:barcode
// Verify employee certification for part's next department
router.get('/verify-certification/:employeeCode/:barcode', async (req: Request, res: Response) => {
  try {
    const { employeeCode } = req.params;
    const barcode = decodeURIComponent(req.params.barcode).trim();

    // Get employee — check badge_scan_code (REPLACE strips dashes) then employee_code fallback
    const normalized = employeeCode.replace(/-/g, '');
    const empCols = { id: employees.id, name: employees.name, employeeCode: employees.employeeCode };
    let empRows = await db
      .select(empCols)
      .from(employees)
      .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalized}`)
      .limit(1);
    if (!empRows.length) {
      empRows = await db
        .select(empCols)
        .from(employees)
        .where(sql`LOWER(${employees.employeeCode}) = LOWER(${employeeCode})`)
        .limit(1);
    }
    const employee = empRows[0] ?? null;

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get serialized item - check both system barcode and physical traveler barcode (case-insensitive)
    let serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode)
      ),
    });

    // If not found, try suffix/contains match (physical labels may omit prefix like "SG0")
    if (!serializedItem) {
      serializedItem = await db.query.p2SerializedItems.findFirst({
        where: or(
          ilike(p2SerializedItems.barcode, `%${barcode}`),
          ilike(p2SerializedItems.travelerBarcode, `%${barcode}`),
          ilike(p2SerializedItems.serialNumber, `%${barcode}`)
        ),
      });
    }

    if (!serializedItem) {
      const looksLikeBadge = /^EMP\d+$/i.test(barcode) || barcode.toUpperCase() === employeeCode.toUpperCase();
      if (looksLikeBadge) {
        return res.status(404).json({ error: 'That looks like a badge code, not a part barcode. Please scan the part label instead.' });
      }
      return res.status(404).json({ error: 'Part not found. Verify the barcode and try again.' });
    }

    const inventoryIdentity = await getSerializedItemInventoryIdentity(serializedItem);
    const routing = await findActiveRoutingForSerializedItem(serializedItem);

    const departmentSequence: string[] = routing?.departmentSequence 
      ? (routing.departmentSequence as string[]) 
      : [...P2_DEPARTMENT_STAGES];
    const currentIndex = serializedItem.currentStageIndex || 0;
    
    if (currentIndex >= departmentSequence.length) {
      return res.status(400).json({ error: 'Part has completed all departments' });
    }

    const nextDepartment = departmentSequence[currentIndex];

    const deptVariants = getDepartmentVariants(nextDepartment);
    const certificationPartNumber =
      inventoryIdentity.internalPartNumber ||
      routing?.partNumber ||
      serializedItem.partNumber;
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, employee.id),
        or(
          eq(p2EmployeePartCertifications.partNumber, certificationPartNumber),
          eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber)
        ),
        or(
          inArray(p2EmployeePartCertifications.department, deptVariants),
          sql`lower(trim(${p2EmployeePartCertifications.department})) = lower(trim(${nextDepartment}))`
        ),
        eq(p2EmployeePartCertifications.drawingKnowledge, true),
        eq(p2EmployeePartCertifications.specSheetUnderstanding, true),
        eq(p2EmployeePartCertifications.procedureCompletion, true)
      ),
    });

    const isCertified = !!certification;

    const departmentConfig = routing ? (routing.departmentConfig as any) : {};
    const config = departmentConfig?.[nextDepartment] || {};

    return res.json({
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
      },
      serializedItem: {
        id: serializedItem.id,
        barcode: serializedItem.barcode,
        serialNumber: serializedItem.serialNumber,
        partNumber: certificationPartNumber,
        partName: inventoryIdentity.partName || serializedItem.partName,
        customerName: serializedItem.customerName,
        currentDepartment: serializedItem.currentDepartment,
        status: serializedItem.status,
      },
      routing: {
        id: routing?.id || null,
        departmentSequence,
        currentStageIndex: currentIndex,
      },
      nextDepartment,
      isCertified,
      departmentConfig: config,
      traceabilityRequirements: routing ? ((routing.traceabilityConfig as any)?.[nextDepartment] || []) : [],
      hasRouting: !!routing,
    });
  } catch (error: any) {
    console.error('Error verifying certification:', error);
    return res.status(500).json({ error: 'Failed to verify certification' });
  }
});

// GET /api/p2-traveler/part-info/:barcode
// Get part info and next department requirements
router.get('/part-info/:barcode', async (req: Request, res: Response) => {
  try {
    const barcode = decodeURIComponent(req.params.barcode).trim();

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode)
      ),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const inventoryIdentity = await getSerializedItemInventoryIdentity(serializedItem);
    const routing = await findActiveRoutingForSerializedItem(serializedItem);

    const departmentSequence = routing?.departmentSequence
      ? (routing.departmentSequence as string[])
      : [...P2_DEPARTMENT_STAGES];
    const currentIndex = serializedItem.currentStageIndex || 0;
    const nextDepartment = currentIndex < departmentSequence.length ? departmentSequence[currentIndex] : null;
    const departmentConfig = routing ? (routing.departmentConfig as any) : {};
    const config = nextDepartment ? (departmentConfig?.[nextDepartment] || {}) : {};

    return res.json({
      serializedItem: {
        id: serializedItem.id,
        barcode: serializedItem.barcode,
        serialNumber: serializedItem.serialNumber,
        partNumber: inventoryIdentity.internalPartNumber || routing?.partNumber || serializedItem.partNumber,
        partName: inventoryIdentity.partName || serializedItem.partName,
        customerName: serializedItem.customerName,
        currentDepartment: serializedItem.currentDepartment,
        currentStageIndex: currentIndex,
        status: serializedItem.status,
      },
      routing: {
        id: routing?.id || null,
        departmentSequence,
      },
      nextDepartment,
      departmentConfig: config,
      traceabilityRequirements: routing && nextDepartment ? ((routing.traceabilityConfig as any)?.[nextDepartment] || []) : [],
      hasRouting: !!routing,
    });
  } catch (error: any) {
    console.error('Error getting part info:', error);
    return res.status(500).json({ error: 'Failed to get part information' });
  }
});

// GET /api/p2-traveler/active-tasks/:employeeId
// Get employee's active tasks
router.get('/active-tasks/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);

    const activeTasks = await db.query.p2WorkTasks.findMany({
      where: and(
        eq(p2WorkTasks.employeeId, employeeId),
        eq(p2WorkTasks.status, 'IN_PROGRESS')
      ),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    return res.json(activeTasks);
  } catch (error: any) {
    console.error('Error getting active tasks:', error);
    return res.status(500).json({ error: 'Failed to get active tasks' });
  }
});

// POST /api/p2-traveler/generate-traveler
// Generate (or retrieve existing) traveler from routing for a P2 serialized item
router.post('/generate-traveler', async (req: Request, res: Response) => {
  try {
    const { serializedItemId, employeeCode } = req.body;

    if (!serializedItemId) {
      return res.status(400).json({ error: 'serializedItemId is required' });
    }

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    const inventoryIdentity = await getSerializedItemInventoryIdentity(serializedItem);
    const routing = await findActiveRoutingForSerializedItem(serializedItem);

    if (!routing) {
      return res.status(404).json({ error: 'No active routing found for this part number' });
    }

    if (serializedItem.partRoutingId !== routing.id) {
      await db
        .update(p2SerializedItems)
        .set({
          partRoutingId: routing.id,
          partRoutingRevision: (routing as any).routingRevision || serializedItem.partRoutingRevision || 1,
          updatedAt: new Date(),
        })
        .where(eq(p2SerializedItems.id, serializedItem.id));
    }

    let resolvedDisplayName = employeeCode || 'p2-system';
    if (employeeCode) {
      const emp = await db.query.employees.findFirst({
        where: eq(employees.employeeCode, employeeCode),
      });
      if (emp) {
        const snapshot = await createEmployeeIdentitySnapshot(emp.id);
        resolvedDisplayName = snapshot.displayName;
      }
    }

    const travelerPartMatches = [
      eq(travelers.partRoutingId, routing.id),
      eq(travelers.partNumber, serializedItem.partNumber),
    ];
    if (inventoryIdentity.inventoryItemId != null) {
      travelerPartMatches.push(eq(travelers.inventoryItemId, String(inventoryIdentity.inventoryItemId)));
    }
    if (inventoryIdentity.internalPartNumber) {
      travelerPartMatches.push(eq(travelers.partNumber, inventoryIdentity.internalPartNumber));
    }

    // Check if a traveler already exists for this serialized item and inventory part identity.
    const existingTraveler = await db.query.travelers.findFirst({
      where: and(
        eq(travelers.serialNumber, serializedItem.serialNumber),
        or(...travelerPartMatches)
      ),
    });

    if (existingTraveler) {
      const repaired = await ensureExistingTravelerHasRoutingDetails({
        traveler: existingTraveler,
        routing,
        actor: resolvedDisplayName,
      });

      return res.json({
        travelerId: existingTraveler.id,
        travelerNumber: existingTraveler.travelerNumber,
        created: false,
        repaired,
      });
    }

    const traveler = await storage.generateTravelerFromRouting(routing.id, {
      serialNumber: serializedItem.serialNumber,
      lotNumber: serializedItem.poNumber || undefined,
      createdBy: resolvedDisplayName,
    });

    await storage.updateTraveler(traveler.id, { status: 'IN_PROGRESS' });

    const currentStageIndex = serializedItem.currentStageIndex || 0;
    if (currentStageIndex > 0) {
      const steps = await db
        .select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, traveler.id))
        .orderBy(asc(travelerSteps.stepNumber));

      const now = new Date();

      for (let i = 0; i < steps.length && i < currentStageIndex; i++) {
        await db
          .update(travelerSteps)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            completedBy: resolvedDisplayName,
          })
          .where(eq(travelerSteps.id, steps[i].id));

        await db
          .update(travelerTasks)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            completedBy: resolvedDisplayName,
          })
          .where(eq(travelerTasks.travelerStepId, steps[i].id));
      }

      if (steps[currentStageIndex]) {
        await db
          .update(travelerSteps)
          .set({
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            startedBy: resolvedDisplayName,
          })
          .where(eq(travelerSteps.id, steps[currentStageIndex].id));
      }

      console.log(`[P2Traveler] Advanced traveler to step ${currentStageIndex + 1} of ${steps.length} (matching P2 item stage)`);
    } else {
      const steps = await db
        .select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, traveler.id))
        .orderBy(asc(travelerSteps.stepNumber));

      if (steps.length > 0) {
        await db
          .update(travelerSteps)
          .set({
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            startedBy: resolvedDisplayName,
          })
          .where(eq(travelerSteps.id, steps[0].id));
      }
    }

    console.log(`[P2Traveler] Generated traveler ${traveler.travelerNumber} for serialized item ${serializedItem.serialNumber}`);

    return res.json({
      travelerId: traveler.id,
      travelerNumber: traveler.travelerNumber,
      created: true,
    });
  } catch (error: any) {
    console.error('[P2Traveler] Error generating traveler:', error);
    return res.status(500).json({ error: 'Failed to generate traveler', detail: error?.message });
  }
});

// POST /api/p2-traveler/start-task
// Start a task (create work task, log event)
router.post('/start-task', async (req: Request, res: Response) => {
  try {
    const {
      employeeId,
      employeeCode,
      employeeName,
      barcode,
      serializedItemId,
      department,
      partNumber,
      partName,
      traceabilityData,
      customData,
      qcResults,
      notes,
    } = req.body;

    const identitySnapshot = await createEmployeeIdentitySnapshot(parseInt(employeeId));
    const displayName = identitySnapshot.displayName !== 'Unknown User' ? identitySnapshot.displayName : (employeeName || employeeCode);

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const inventoryIdentity = await getSerializedItemInventoryIdentity(serializedItem);
    const routing = await findActiveRoutingForSerializedItem(serializedItem);

    const departmentConfig = routing ? (routing.departmentConfig as any) : {};
    const config = departmentConfig?.[department] || {};

    // BACKEND CERTIFICATION ENFORCEMENT - Critical for AS9100 compliance
    const startDeptVariants = getDepartmentVariants(department);
    const certificationPartNumber =
      inventoryIdentity.internalPartNumber ||
      routing?.partNumber ||
      serializedItem.partNumber;
    const certification = await db.query.p2EmployeePartCertifications.findFirst({
      where: and(
        eq(p2EmployeePartCertifications.employeeId, parseInt(employeeId)),
        or(
          eq(p2EmployeePartCertifications.partNumber, certificationPartNumber),
          eq(p2EmployeePartCertifications.partNumber, serializedItem.partNumber)
        ),
        or(
          inArray(p2EmployeePartCertifications.department, startDeptVariants),
          sql`lower(trim(${p2EmployeePartCertifications.department})) = lower(trim(${department}))`
        ),
        eq(p2EmployeePartCertifications.drawingKnowledge, true),
        eq(p2EmployeePartCertifications.specSheetUnderstanding, true),
        eq(p2EmployeePartCertifications.procedureCompletion, true)
      ),
    });

    if (!certification) {
      return res.status(403).json({ 
        error: `Employee ${employeeName} is not certified for ${department} on part ${partNumber}`,
        code: 'NOT_CERTIFIED'
      });
    }

    // Check if part is available (not already in progress by another tech in same department)
    const existingTask = await db.query.p2WorkTasks.findFirst({
      where: and(
        eq(p2WorkTasks.serializedItemId, serializedItemId),
        eq(p2WorkTasks.department, department),
        eq(p2WorkTasks.status, 'IN_PROGRESS')
      ),
    });

    if (existingTask && existingTask.employeeId !== parseInt(employeeId)) {
      return res.status(400).json({ 
        error: `Part is already being worked on by ${existingTask.employeeName}` 
      });
    }
    
    if (existingTask && existingTask.employeeId === parseInt(employeeId)) {
      // Task #188: also auto-switch the punch on resume so the operator's
      // active punch_ledger session is on the correct WAD/charge-code.
      const resumedPunch = await runAutoPunchForP2Task({
        serialNumber: serializedItem.serialNumber,
        partNumber: certificationPartNumber,
        inventoryItemId: inventoryIdentity.inventoryItemId,
        employeeId,
        laborApprovalId: req.body?.laborApprovalId ? parseInt(req.body.laborApprovalId, 10) : null,
        adminPtoOverride: req.body?.adminPtoOverride === true,
        adminOverrideReason:
          typeof req.body?.adminOverrideReason === 'string' ? req.body.adminOverrideReason.trim() : null,
        user: req.user ?? null,
        ip: req.ip ?? null,
      });
      if (!resumedPunch.ok) {
        return res.status(resumedPunch.status).json(resumedPunch.body);
      }
      return res.json({
        success: true,
        workTask: existingTask,
        resumed: true,
        message: 'Resumed existing task',
        punch: resumedPunch.punch,
      });
    }

    // MULTI-TASK CONTROL - Check if employee can work on multiple parts simultaneously
    const allowMultipleTasks = config.allowMultipleTasks !== false; // Default to true if not specified
    
    if (!allowMultipleTasks) {
      const employeeActiveTasks = await db.query.p2WorkTasks.findMany({
        where: and(
          eq(p2WorkTasks.employeeId, parseInt(employeeId)),
          eq(p2WorkTasks.status, 'IN_PROGRESS')
        ),
      });

      if (employeeActiveTasks.length > 0) {
        const activePartName = employeeActiveTasks[0]?.partName || employeeActiveTasks[0]?.partNumber || 'another part';
        return res.status(400).json({ 
          error: `You must complete your current task on ${activePartName} before starting a new one`,
          code: 'MULTI_TASK_NOT_ALLOWED'
        });
      }
    }

    // Task #188: Auto-switch operator's punch_ledger session to the WAD's
    // charge code. Runs the same gates as the kiosk traveler-scan flow
    // (WAD release, material readiness, certification, PTO, budget,
    // charge-code activeness). Per Task #77, traveler punches default to
    // PENDING_APPROVAL. If a gate fails we return BEFORE inserting the
    // p2_work_tasks row so the operator is not "started" against an
    // unauthorized charge code.
    const startPunch = await runAutoPunchForP2Task({
      serialNumber: serializedItem.serialNumber,
      partNumber: certificationPartNumber,
      inventoryItemId: inventoryIdentity.inventoryItemId,
      employeeId,
      laborApprovalId: req.body?.laborApprovalId ? parseInt(req.body.laborApprovalId, 10) : null,
      adminPtoOverride: req.body?.adminPtoOverride === true,
      adminOverrideReason:
        typeof req.body?.adminOverrideReason === 'string' ? req.body.adminOverrideReason.trim() : null,
      user: req.user ?? null,
      ip: req.ip ?? null,
    });
    if (!startPunch.ok) {
      return res.status(startPunch.status).json(startPunch.body);
    }

    const incomingTraceabilityData = Array.isArray(traceabilityData)
      ? traceabilityData.filter((item: any) => getTraceValue(item))
      : [];

    // Validate input - pull denormalized fields from serialized item (use DB values as source of truth)
    const resolvedPartName = partName || serializedItem.partName || serializedItem.partNumber || 'Unknown';
    const resolvedPartNumber = partNumber || serializedItem.partNumber;
    const validatedData = insertP2WorkTaskSchema.parse({
      serializedItemId,
      barcode: barcode || serializedItem.barcode,
      poNumber: serializedItem.poNumber,
      partNumber: resolvedPartNumber,
      partName: resolvedPartName,
      customerId: serializedItem.customerId,
      customerName: serializedItem.customerName,
      department,
      employeeId: parseInt(employeeId),
      employeeCode,
      employeeName,
      certificationId: certification.id,
      travelerId: startPunch.chargeContext.travelerId ?? null,
      travelerStepId: startPunch.entry?.travelerStepId ?? null,
      productionWorkOrderId: startPunch.entry?.productionWorkOrderId ?? null,
      projectId: startPunch.entry?.projectId ?? null,
      chargeCodeId: startPunch.entry?.chargeCodeId ?? null,
      operationName: startPunch.chargeContext.operation ?? department,
      electronicSignoffRequired: true,
      electronicSignoffStatus: 'PENDING',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      traceabilityData: incomingTraceabilityData,
      customData,
      notes,
    });

    // Create work task
    const [workTask] = await db.insert(p2WorkTasks).values(validatedData).returning();

    const {
      expandedTraceability,
      packetTraceRecords,
      consumedPackets,
    } = await expandAndConsumePacketTraceability({
      traceabilityData: incomingTraceabilityData,
      serializedItem,
      department,
      recordedBy: displayName,
      workTaskId: workTask.id,
    });

    if (expandedTraceability.length !== incomingTraceabilityData.length) {
      await db
        .update(p2WorkTasks)
        .set({ traceabilityData: expandedTraceability, updatedAt: new Date() })
        .where(eq(p2WorkTasks.id, workTask.id));
      (workTask as any).traceabilityData = expandedTraceability;
    }

    // Save traceability data
    if (incomingTraceabilityData.length > 0 || packetTraceRecords.length > 0) {
      const traceabilityRecords = incomingTraceabilityData.map((item: any) => ({
        serializedItemId,
        department,
        inventoryPartId: item.builtPacketId ? String(item.builtPacketId) : (item.inventoryPartId || null),
        inventoryPartNumber: item.inventoryPartNumber || null,
        traceabilityType: item.type,
        traceabilityLabel: item.label,
        traceabilityValue: item.value,
        recordedBy: displayName,
      }));

      await db.insert(p2SerializedItemTraceability).values([
        ...traceabilityRecords,
        ...packetTraceRecords,
      ]);
    }

    if (customData && Object.keys(customData).length > 0) {
      await db.insert(p2SerializedItemCustomData).values({
        serializedItemId,
        department,
        customData,
        recordedBy: displayName,
      });
    }

    if (qcResults && Array.isArray(qcResults) && qcResults.length > 0) {
      await db.insert(p2SerializedItemCustomData).values({
        serializedItemId,
        department,
        customData: { qcResults },
        recordedBy: displayName,
      });

      const passCount = qcResults.filter((r: any) => r.passed === true).length;
      const failCount = qcResults.filter((r: any) => r.passed === false).length;
      await db.insert(p2SerializedItemEvents).values({
        serializedItemId,
        barcode,
        eventType: 'NOTE',
        performedBy: displayName,
        notes: `QC results recorded in ${department}: ${passCount} passed, ${failCount} failed`,
        metadata: { taskId: workTask.id, action: 'qc_results', qcResults },
      });
    }

    // Update serialized item's currentDepartment if task is starting in a later department
    const departmentSequence = (routing?.departmentSequence as string[]) || 
      ['Layup', 'Assemble/Disassembly', 'CNC', 'Finish', 'Paint', 'Final QC'];
    const startedDeptIndex = departmentSequence.indexOf(department);
    const currentStageIndex = serializedItem.currentStageIndex || 0;
    if (startedDeptIndex >= 0 && startedDeptIndex >= currentStageIndex) {
      await db.update(p2SerializedItems).set({
        currentDepartment: department,
        currentStageIndex: startedDeptIndex,
        updatedAt: new Date(),
      }).where(eq(p2SerializedItems.id, serializedItemId));
    } else if (startedDeptIndex < 0) {
      await db.update(p2SerializedItems).set({
        currentDepartment: department,
        updatedAt: new Date(),
      }).where(eq(p2SerializedItems.id, serializedItemId));
    }

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId,
      barcode,
      eventType: 'NOTE',
      performedBy: displayName,
      notes: `Task started in ${department}`,
      metadata: { taskId: workTask.id, action: 'start_task', consumedPackets },
    });

    return res.json({
      success: true,
      workTask,
      message: 'Task started successfully',
      punch: startPunch.punch,
    });
  } catch (error: any) {
    console.error('Error starting task:', error);
    return res.status(500).json({ error: error.message || 'Failed to start task' });
  }
});

// POST /api/p2-traveler/complete-task
// Complete task (rescan verification, calculate duration, advance department)
router.post('/complete-task', async (req: Request, res: Response) => {
  try {
    const {
      taskId,
      employeeCode,
      barcode,
      notes,
    } = req.body;

    let completeDisplayName = employeeCode || 'unknown';
    if (employeeCode) {
      const emp = await db.query.employees.findFirst({
        where: eq(employees.employeeCode, employeeCode),
      });
      if (emp) {
        const snapshot = await createEmployeeIdentitySnapshot(emp.id);
        completeDisplayName = snapshot.displayName;
      }
    }

    const workTask = await db.query.p2WorkTasks.findFirst({
      where: eq(p2WorkTasks.id, taskId),
    });

    if (!workTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (workTask.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Task is not in progress' });
    }

    // Verify employee and barcode match (case-insensitive for scanner compatibility)
    if (workTask.employeeCode.toLowerCase() !== employeeCode.toLowerCase()) {
      return res.status(403).json({ error: 'Only the assigned technician can complete this task' });
    }

    // Check barcode against both system barcode and traveler barcode (scanners may use either)
    const scannedBarcode = barcode.toLowerCase();
    const taskBarcode = workTask.barcode.toLowerCase();
    let barcodeMatch = taskBarcode === scannedBarcode;

    if (!barcodeMatch) {
      // Also check if the scanned barcode matches the serialized item's traveler barcode
      const serializedItemForBarcode = await db.query.p2SerializedItems.findFirst({
        where: eq(p2SerializedItems.id, workTask.serializedItemId),
      });
      if (serializedItemForBarcode) {
        const travelerBarcode = serializedItemForBarcode.travelerBarcode?.toLowerCase();
        const systemBarcode = serializedItemForBarcode.barcode?.toLowerCase();
        barcodeMatch = scannedBarcode === travelerBarcode || scannedBarcode === systemBarcode;
      }
    }

    if (!barcodeMatch) {
      return res.status(400).json({ error: 'Barcode does not match the started task' });
    }

    // Calculate duration in minutes
    const startTime = new Date(workTask.startedAt).getTime();
    const endTime = Date.now();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // Update work task
    await db.update(p2WorkTasks)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        durationMinutes,
        electronicSignoffStatus: 'SIGNED',
        electronicSignoffAt: new Date(),
        electronicSignoffBy: workTask.employeeId,
        notes: notes || workTask.notes,
        updatedAt: new Date(),
      })
      .where(eq(p2WorkTasks.id, taskId));

    // Get serialized item and routing
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, workTask.serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    const routing = await findActiveRoutingForSerializedItem(serializedItem);

    const departmentSequence = routing?.departmentSequence
      ? (routing.departmentSequence as string[])
      : [...P2_DEPARTMENT_STAGES];
    const currentIndex = serializedItem.currentStageIndex || 0;
    
    if (currentIndex >= departmentSequence.length) {
      return res.status(400).json({ error: 'Part has already completed all departments in the sequence' });
    }
    
    const currentDepartment = departmentSequence[currentIndex] || serializedItem.currentDepartment || 'Layup';
    const nextIndex = currentIndex + 1;
    const nextDepartment = departmentSequence[nextIndex];

    // TOLERANCE GATE ENFORCEMENT: If progressing FROM Final QC, check for failed inspections
    if (currentDepartment === 'Final QC') {
      // Check if item has any failed inspection data in metadata
      const itemMetadata = serializedItem.metadata as any;
      const hasFinalQCFailures = itemMetadata?.finalQcFailures?.length > 0 || 
                                  itemMetadata?.hasToleranceDeviation === true;
      
      if (hasFinalQCFailures) {
        // Check if tolerance authorization has been recorded on the item
        const hasToleranceAuthorization = itemMetadata?.toleranceDeviationApproved === true;
        
        if (!hasToleranceAuthorization) {
          // Also check PO for tolerance authorizer if poItemId exists
          let poHasAuthorizer = false;
          
          if (serializedItem.poItemId) {
            const { p2PurchaseOrders, p2PurchaseOrderItems } = await import('../../schema');
            
            const poItem = await db.query.p2PurchaseOrderItems.findFirst({
              where: eq(p2PurchaseOrderItems.id, serializedItem.poItemId),
            });
            
            if (poItem) {
              const po = await db.query.p2PurchaseOrders.findFirst({
                where: eq(p2PurchaseOrders.id, poItem.poId),
              });
              poHasAuthorizer = !!(po as any)?.toleranceAuthorizerId;
            }
          }
          
          if (!poHasAuthorizer) {
            return res.status(403).json({
              error: 'Tolerance authorization required',
              gatingFailed: true,
              message: 'This item has failed Final QC inspections. Tolerance authorizer signature is required before the item can proceed. ' +
                       'Please use the Tolerance Gate approval workflow.',
              currentDepartment,
              requiresToleranceAuth: true,
              serializedItemId: serializedItem.id,
            });
          }
        }
      }

      const item = serializedItem as any;
      const missingSku = !item.sku;
      const missingDrawing = !item.drawingName;

      const requiresCustomerSerial = false;
      const missingCustomerSerial = requiresCustomerSerial && !item.customerSerialNumber;

      if (missingSku || missingDrawing || missingCustomerSerial) {
        return res.status(403).json({
          error: 'Finalization required before leaving Final QC',
          gatingFailed: true,
          guard: 'FINALIZATION_REQUIRED',
          missing: {
            sku: missingSku,
            drawingName: missingDrawing,
            customerSerialNumber: missingCustomerSerial,
          },
          serializedItemId: serializedItem.id,
        });
      }

      if (!item.finalizedAt) {
        await db.update(p2SerializedItems).set({
          finalizedAt: new Date(),
          finalizedBy: completeDisplayName,
          updatedAt: new Date(),
        }).where(eq(p2SerializedItems.id, serializedItem.id));

        await db.insert(p2SerializedItemEvents).values({
          serializedItemId: serializedItem.id,
          barcode: serializedItem.barcode,
          eventType: 'NOTE',
          performedBy: completeDisplayName,
          notes: 'Finalized identity (SKU/drawing/customer serial)',
          metadata: { sku: item.sku, drawingName: item.drawingName, customerSerialNumber: item.customerSerialNumber },
        });
      }
    }

    // Update department completion timestamp
    const completionField = `${currentDepartment.toLowerCase().replace(/[^a-z]/g, '')}CompletedAt`;
    const updates: any = {
      updatedAt: new Date(),
    };

    // Set completion timestamp for current department
    if (currentDepartment === 'Layup' || currentDepartment === 'Layup/Plugging') {
      updates.layupCompletedAt = new Date();
    } else if (currentDepartment === 'Assemble/Disassembly') {
      updates.assembleDisassemblyCompletedAt = new Date();
    } else if (currentDepartment === 'CNC') {
      updates.cncCompletedAt = new Date();
    } else if (currentDepartment === 'Finish') {
      updates.finishCompletedAt = new Date();
    } else if (currentDepartment === 'Paint') {
      updates.paintCompletedAt = new Date();
    } else if (currentDepartment === 'Final QC') {
      updates.finalQcCompletedAt = new Date();
    }

    // Advance to next department or mark completed
    if (nextIndex < departmentSequence.length) {
      updates.currentDepartment = nextDepartment;
      updates.currentStageIndex = nextIndex;
    } else {
      updates.status = 'COMPLETED';
      updates.completedAt = new Date();
      updates.currentStageIndex = departmentSequence.length;
      updates.currentDepartment = 'COMPLETED';
    }

    // Update serialized item
    await db.update(p2SerializedItems)
      .set(updates)
      .where(eq(p2SerializedItems.id, serializedItem.id));

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId: serializedItem.id,
      barcode: serializedItem.barcode,
      eventType: 'TRANSITION',
      fromDepartment: currentDepartment,
      toDepartment: nextDepartment || 'COMPLETED',
      fromStageIndex: currentIndex,
      toStageIndex: nextIndex < departmentSequence.length ? nextIndex : null,
      performedBy: completeDisplayName,
      notes: notes || `Completed ${currentDepartment} - Duration: ${durationMinutes} minutes`,
      metadata: { taskId, durationMinutes },
    });

    return res.json({
      success: true,
      message: nextDepartment 
        ? `Task completed. Part advanced to ${nextDepartment}` 
        : 'Task completed. Part has finished all departments',
      durationMinutes,
      nextDepartment: nextDepartment || null,
      status: updates.status || 'ACTIVE',
    });
  } catch (error: any) {
    console.error('Error completing task:', error);
    return res.status(500).json({ error: error.message || 'Failed to complete task' });
  }
});

// POST /api/p2-traveler/admin/force-complete-task
// Admin: Force-complete a stuck task (bypasses employee/barcode checks)
router.post('/admin/force-complete-task', async (req: Request, res: Response) => {
  try {
    const { taskId, reason } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const workTask = await db.query.p2WorkTasks.findFirst({
      where: eq(p2WorkTasks.id, taskId),
    });

    if (!workTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (workTask.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Task is not in progress' });
    }

    const startedAt = workTask.startedAt ? new Date(workTask.startedAt) : new Date();
    const completedAt = new Date();
    const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

    await db.update(p2WorkTasks)
      .set({
        status: 'COMPLETED',
        completedAt,
        durationMinutes,
        notes: `[ADMIN FORCE-COMPLETE] ${reason || 'Stuck task cleared by admin'}`,
      })
      .where(eq(p2WorkTasks.id, taskId));

    console.log(`[ADMIN] Force-completed task ${taskId} for ${workTask.employeeName} in ${workTask.department}`);

    return res.json({ 
      success: true, 
      message: `Task force-completed for ${workTask.employeeName}`,
      taskId,
    });
  } catch (error: any) {
    console.error('Error force-completing task:', error);
    return res.status(500).json({ error: error.message || 'Failed to force-complete task' });
  }
});

// GET /api/p2-traveler/admin/stuck-tasks
// Admin: List all IN_PROGRESS tasks (for clearing stuck ones)
router.get('/admin/stuck-tasks', async (_req: Request, res: Response) => {
  try {
    const stuckTasks = await db.query.p2WorkTasks.findMany({
      where: eq(p2WorkTasks.status, 'IN_PROGRESS'),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });
    return res.json(stuckTasks);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to get stuck tasks' });
  }
});

// GET /api/p2-traveler/traceability/:serializedItemId
// Get complete traceability report for a serialized item
router.get('/traceability/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;

    // Get serialized item
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Get all events
    const events = await db.query.p2SerializedItemEvents.findMany({
      where: eq(p2SerializedItemEvents.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemEvents.createdAt)],
    });

    // Get all work tasks
    const workTasks = await db.query.p2WorkTasks.findMany({
      where: eq(p2WorkTasks.serializedItemId, serializedItemId),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    // Get all traceability records
    const traceabilityRecords = await db.query.p2SerializedItemTraceability.findMany({
      where: eq(p2SerializedItemTraceability.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemTraceability.createdAt)],
    });

    // Get all custom data records
    const customDataRecords = await db.query.p2SerializedItemCustomData.findMany({
      where: eq(p2SerializedItemCustomData.serializedItemId, serializedItemId),
      orderBy: [desc(p2SerializedItemCustomData.createdAt)],
    });

    return res.json({
      serializedItem,
      events,
      workTasks,
      traceabilityRecords,
      customDataRecords,
    });
  } catch (error: any) {
    console.error('Error getting traceability:', error);
    return res.status(500).json({ error: 'Failed to get traceability report' });
  }
});

// PUT /api/p2-traveler/edit-department-data/:serializedItemId
// Edit traceability, QC results, or custom data for a serialized item in a department
// Technicians can edit while item is still in that department; only admin can edit after department is closed
router.put('/edit-department-data/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;
    const { department, traceabilityData: newTraceData, qcResults: newQcResults, customData: newCustomData, editedBy, editedByName, isAdmin } = req.body;

    if (!department || !editedBy) {
      return res.status(400).json({ error: 'department and editedBy are required' });
    }

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    const isCurrentDepartment = serializedItem.currentDepartment === department;

    if (!isCurrentDepartment && !isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can edit data for completed departments',
        requiresAdmin: true,
      });
    }

    const changes: string[] = [];

    if (newTraceData && Array.isArray(newTraceData) && newTraceData.length > 0) {
      await db.delete(p2SerializedItemTraceability)
        .where(and(
          eq(p2SerializedItemTraceability.serializedItemId, serializedItemId),
          eq(p2SerializedItemTraceability.department, department)
        ));

      const traceRecords = newTraceData.map((item: any) => ({
        serializedItemId,
        department,
        inventoryPartId: item.inventoryPartId || null,
        inventoryPartNumber: item.inventoryPartNumber || null,
        traceabilityType: item.type,
        traceabilityLabel: item.label,
        traceabilityValue: item.value,
        recordedBy: editedBy,
      }));

      await db.insert(p2SerializedItemTraceability).values(traceRecords);
      changes.push('traceability data');
    }

    if (newCustomData && Object.keys(newCustomData).length > 0) {
      const existingCustom = await db.query.p2SerializedItemCustomData.findFirst({
        where: and(
          eq(p2SerializedItemCustomData.serializedItemId, serializedItemId),
          eq(p2SerializedItemCustomData.department, department)
        ),
      });

      if (existingCustom) {
        const merged = { ...(existingCustom.customData as any || {}), ...newCustomData };
        if ((existingCustom.customData as any)?.qcResults) {
          merged.qcResults = (existingCustom.customData as any).qcResults;
        }
        await db.update(p2SerializedItemCustomData)
          .set({ customData: merged, recordedBy: editedBy })
          .where(eq(p2SerializedItemCustomData.id, existingCustom.id));
      } else {
        await db.insert(p2SerializedItemCustomData).values({
          serializedItemId,
          department,
          customData: newCustomData,
          recordedBy: editedBy,
        });
      }
      changes.push('custom data');
    }

    if (newQcResults && Array.isArray(newQcResults) && newQcResults.length > 0) {
      const existingQc = await db.query.p2SerializedItemCustomData.findFirst({
        where: and(
          eq(p2SerializedItemCustomData.serializedItemId, serializedItemId),
          eq(p2SerializedItemCustomData.department, department),
          sql`(custom_data->>'qcResults') IS NOT NULL`
        ),
      });

      if (existingQc) {
        const merged = { ...(existingQc.customData as any || {}), qcResults: newQcResults };
        await db.update(p2SerializedItemCustomData)
          .set({ customData: merged, recordedBy: editedBy })
          .where(eq(p2SerializedItemCustomData.id, existingQc.id));
      } else {
        await db.insert(p2SerializedItemCustomData).values({
          serializedItemId,
          department,
          customData: { qcResults: newQcResults },
          recordedBy: editedBy,
        });
      }
      changes.push('QC results');
    }

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId,
      barcode: serializedItem.barcode,
      eventType: 'NOTE',
      performedBy: editedBy,
      notes: `${isAdmin && !isCurrentDepartment ? '[ADMIN EDIT]' : '[EDIT]'} Updated ${changes.join(', ')} in ${department}`,
      metadata: { action: 'edit_department_data', department, isAdmin: isAdmin && !isCurrentDepartment, editedByName },
    });

    return res.json({
      success: true,
      message: `Updated ${changes.join(', ')} for ${department}`,
      changes,
    });
  } catch (error: any) {
    console.error('Error editing department data:', error);
    return res.status(500).json({ error: error.message || 'Failed to edit department data' });
  }
});

// GET /api/p2-traveler/department-data/:serializedItemId/:department
// Get existing data for a specific department (for editing purposes)
router.get('/department-data/:serializedItemId/:department', async (req: Request, res: Response) => {
  try {
    const { serializedItemId, department } = req.params;
    const decodedDept = decodeURIComponent(department);

    const traceRecords = await db.query.p2SerializedItemTraceability.findMany({
      where: and(
        eq(p2SerializedItemTraceability.serializedItemId, serializedItemId),
        eq(p2SerializedItemTraceability.department, decodedDept)
      ),
      orderBy: [desc(p2SerializedItemTraceability.createdAt)],
    });

    const customDataRecords = await db.query.p2SerializedItemCustomData.findMany({
      where: and(
        eq(p2SerializedItemCustomData.serializedItemId, serializedItemId),
        eq(p2SerializedItemCustomData.department, decodedDept)
      ),
      orderBy: [desc(p2SerializedItemCustomData.createdAt)],
    });

    let customData: Record<string, string> = {};
    let qcResults: any[] = [];
    for (const record of customDataRecords) {
      const data = record.customData as any;
      if (data?.qcResults) {
        qcResults = data.qcResults;
      } else {
        customData = { ...customData, ...data };
      }
    }

    const workTasks = await db.query.p2WorkTasks.findMany({
      where: and(
        eq(p2WorkTasks.serializedItemId, serializedItemId),
        eq(p2WorkTasks.department, decodedDept)
      ),
      orderBy: [desc(p2WorkTasks.startedAt)],
    });

    return res.json({
      traceabilityData: traceRecords.map(r => ({
        id: r.id,
        type: r.traceabilityType,
        label: r.traceabilityLabel,
        value: r.traceabilityValue,
        inventoryPartId: r.inventoryPartId,
        inventoryPartNumber: r.inventoryPartNumber,
      })),
      customData,
      qcResults,
      workTasks: workTasks.map(t => ({
        id: t.id,
        department: t.department,
        employeeName: t.employeeName,
        status: t.status,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        notes: t.notes,
      })),
    });
  } catch (error: any) {
    console.error('Error getting department data:', error);
    return res.status(500).json({ error: 'Failed to get department data' });
  }
});

// POST /api/p2-traveler/add-note/:serializedItemId
// Add a note to a serialized item at any time during the process
router.post('/add-note/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;
    const { note, department, addedBy, addedByName } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    if (!addedBy) {
      return res.status(400).json({ error: 'addedBy is required' });
    }

    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: eq(p2SerializedItems.id, serializedItemId),
    });

    if (!serializedItem) {
      return res.status(404).json({ error: 'Serialized item not found' });
    }

    await db.insert(p2SerializedItemEvents).values({
      serializedItemId,
      barcode: serializedItem.barcode,
      eventType: 'NOTE',
      fromDepartment: department || serializedItem.currentDepartment,
      performedBy: addedBy,
      notes: note.trim(),
      metadata: { action: 'manual_note', department: department || serializedItem.currentDepartment, addedByName },
    });

    return res.json({
      success: true,
      message: 'Note added successfully',
    });
  } catch (error: any) {
    console.error('Error adding note:', error);
    return res.status(500).json({ error: error.message || 'Failed to add note' });
  }
});

// GET /api/p2-traveler/notes/:serializedItemId
// Get all notes for a serialized item
router.get('/notes/:serializedItemId', async (req: Request, res: Response) => {
  try {
    const { serializedItemId } = req.params;

    const notes = await db.query.p2SerializedItemEvents.findMany({
      where: and(
        eq(p2SerializedItemEvents.serializedItemId, serializedItemId),
        eq(p2SerializedItemEvents.eventType, 'NOTE')
      ),
      orderBy: [desc(p2SerializedItemEvents.createdAt)],
    });

    return res.json(notes);
  } catch (error: any) {
    console.error('Error getting notes:', error);
    return res.status(500).json({ error: 'Failed to get notes' });
  }
});

export default router;
