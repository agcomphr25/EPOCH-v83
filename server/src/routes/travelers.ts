import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, asc, desc, ilike, inArray, notInArray, sql, or } from 'drizzle-orm';
import { auditService } from '../services/auditService';
import { requirePermission } from '../../middleware/requirePermission';
import { validateActionToken } from '../../middleware/actionToken';
import { requireScopedCapability, ScopedForbiddenError } from '../permissions';
import { storage } from '../../storage';
import { evaluateTravelerStartGates, evaluateTravelerFinishGates, evaluateStartGatesDetailed, evaluateWadReleaseGate, buildGateErrorBody, buildTrainingGateErrorBody } from '../lib/travelerGates';
import { evaluateTravelerTrainingGate, evaluateQcTrainingGate } from '../lib/trainingEnforcement';
import { resolveChargeCode, deriveProjectId, resolveCertificationStatus, resolveBudgetOverrunState } from '../lib/resolveChargeCode';
import { resolvePacketBarcode } from '../lib/packetResolution';
import { getActiveRoutingStep } from '../services/routingStepService';
import { adjustPacketInventoryItem } from '../utils/p1PacketInventory';
import { laborAllocationsEnabled } from '../lib/featureFlags';
import { ensureProductionWorkflowReadSchema } from '../lib/productionWorkflowReadiness';
import * as allocationService from '../services/laborAllocationService';
import { buildChargeContextFromTraveler } from '../helpers/travelerBarcodeResolver';
import { executeTravelerAutoPunch } from './timeClock';
import { recordAuditEvent } from '../services/auditLedgerService';
import { getTravelerProductionExecutionGate } from '../services/projectProductionExecutionService';
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
  travelerTasks,
  travelerTaskFields,
  travelerSignatures,
  travelerEvents,
  travelerAuthorizedNotes,
  auditEvents,
  chargeCodes,
  partRoutings,
  inventoryItems,
  manufacturingQueue,
  productionWorkOrders,
  cuttingBuiltPackets,
  cuttingPacketBOMs,
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

const TRACE_FIELD_ALIASES: Record<string, string[]> = {
  trace_internalcontrolnumber: ['internalControlNumber', 'material_internal_control_number', 'material_icn'],
  trace_supplier: ['supplier'],
  trace_inventorypartnumber: ['inventoryPartNumber', 'material_part_number'],
  trace_batchlotnumber: ['batchLotNumber', 'material_batch_number', 'material_lot'],
  trace_manufacturer: ['manufacturer', 'material_brand'],
  trace_rollnumber: ['rollNumber'],
  trace_expirationdate: ['expirationDate', 'material_expiration_date'],
  trace_receiveddate: ['receivedDate'],
};

function parseQueueIdFromPacketBarcode(barcode: string | null | undefined): number | null {
  if (!barcode) return null;
  const trimmed = barcode.trim();
  const mfgMatch = trimmed.match(/^MFG-(\d+)-/);
  if (mfgMatch) {
    const queueId = Number(mfgMatch[1]);
    return Number.isInteger(queueId) ? queueId : null;
  }

  const parts = trimmed.split('-');
  if (parts.length < 5 || parts[0] !== 'PKT') return null;

  const maybeRepairIndex = parts[parts.length - 1];
  const maybeTimestamp = parts[parts.length - 2];
  const hasRepairIndex = /^\d+$/.test(maybeRepairIndex) && /^\d{10,}$/.test(maybeTimestamp);
  const queueIndex = hasRepairIndex ? parts.length - 4 : parts.length - 3;
  const queueId = Number(parts[queueIndex]);
  return Number.isInteger(queueId) ? queueId : null;
}

async function resolvePacketInventoryItemIdForCommit(
  tx: any,
  packet: typeof cuttingBuiltPackets.$inferSelect,
  scannedBarcode: string,
): Promise<number | null> {
  const queueId = parseQueueIdFromPacketBarcode(packet.barcode) ?? parseQueueIdFromPacketBarcode(scannedBarcode);
  if (queueId != null) {
    const [queueRow] = await tx
      .select({ inventoryItemId: manufacturingQueue.inventoryItemId })
      .from(manufacturingQueue)
      .where(eq(manufacturingQueue.id, queueId))
      .limit(1);
    if (queueRow?.inventoryItemId) return queueRow.inventoryItemId;
  }

  if (packet.productCategoryId) {
    const [bom] = await tx
      .select({ inventoryItemId: cuttingPacketBOMs.inventoryItemId })
      .from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.productCategoryId, packet.productCategoryId))
      .limit(1);
    if (bom?.inventoryItemId) return bom.inventoryItemId;
  }

  return null;
}

async function commitPacketToTravelerInventory(params: {
  packet: typeof cuttingBuiltPackets.$inferSelect;
  scannedBarcode: string;
  allocationTarget: string;
  intendedRoutingStepId: string | null;
}): Promise<void> {
  const { packet, scannedBarcode, allocationTarget, intendedRoutingStepId } = params;

  await db.transaction(async (tx) => {
    const [lockedPacket] = await tx
      .select()
      .from(cuttingBuiltPackets)
      .where(eq(cuttingBuiltPackets.id, packet.id))
      .limit(1)
      .for('update');

    if (!lockedPacket) {
      throw new Error(`Cutting packet ${packet.id} disappeared before allocation`);
    }

    const alreadyCommittedToThisTraveler =
      lockedPacket.status === 'ALLOCATED' &&
      lockedPacket.allocatedToOrder === allocationTarget;

    const shouldRemoveFromInventory = lockedPacket.status === 'AVAILABLE';
    if (shouldRemoveFromInventory) {
      const inventoryItemId = await resolvePacketInventoryItemIdForCommit(tx, lockedPacket, scannedBarcode);
      if (!inventoryItemId) {
        throw new Error(`Unable to resolve inventory packet item for ${lockedPacket.barcode || scannedBarcode}`);
      }
      await adjustPacketInventoryItem(tx, inventoryItemId, -1);
    }

    if (!alreadyCommittedToThisTraveler) {
      await tx
        .update(cuttingBuiltPackets)
        .set({
          status: lockedPacket.status === 'CONSUMED' ? lockedPacket.status : 'ALLOCATED',
          allocatedToOrder: allocationTarget,
          intendedRoutingStepId,
          updatedAt: new Date(),
        })
        .where(eq(cuttingBuiltPackets.id, lockedPacket.id));
    }
  });
}

const LEGACY_ROC_BACKFILL_DEFAULT_SERIALS = [
  'ROC2600084',
  'ROC2600089',
  'ROC2600083',
  'ROC2600086',
  'ROC2600085',
  'ROC2600080',
  'ROC2600079',
  'ROC2600078',
  'ROC2600077',
  'ROC2600076',
  'ROC2600075',
  'ROC2600074',
  'ROC2600046',
] as const;

const LEGACY_ROC_BACKFILL_DEFAULT_CUTOFF = '2026-05-20';
const LEGACY_ROC_BACKFILL_DEFAULT_APPROVER = 'Tasha Mireles';
const LEGACY_ROC_LAYUP_CHARGE_CODE = 'ROC-LU330-050126';
const LEGACY_ROC_QC_CHARGE_CODE = 'ROC-QC330-050126';
const LEGACY_ROC_CANCELED_TRAVELER_NUMBER = 'TRV-2026-000271';
const LEGACY_ROC_APPROVAL_REASON =
  'Legacy routing remediation approved by Tasha Mireles. The prior six-department traveler routing was compressed into the current Layup and Quality Control charge-code structure after the 2026-05-20 routing change. Existing captured traveler data is preserved. Missing legacy gate evidence is closed by supervised backfill so serialized production travelers can continue without changing the current traveler creation or execution process.';

const LEGACY_ROC_DEPARTMENT_CHARGE_CODE_MAP: Record<string, 'layup' | 'qualityControl'> = {
  'mold prep': 'layup',
  layup: 'layup',
  'cello wrap': 'layup',
  'oven/cure': 'layup',
  'oven cure': 'layup',
  'quality control': 'qualityControl',
  qc: 'qualityControl',
  'final qc': 'qualityControl',
  finalqc: 'qualityControl',
};

const legacyRocDryRunSchema = z.object({
  serials: z.array(z.string().trim().min(1)).min(1).optional(),
  cutoffDate: z.string().trim().min(1).optional(),
  approver: z.string().trim().min(1).optional(),
  chargeCodes: z.object({
    layup: z.string().trim().min(1).optional(),
    qualityControl: z.string().trim().min(1).optional(),
  }).optional(),
});

const legacyRocApplySchema = z.object({
  travelerIds: z.array(z.string().trim().min(1)).min(1).optional(),
  approver: z.string().trim().min(1).default(LEGACY_ROC_BACKFILL_DEFAULT_APPROVER),
  reason: z.string().trim().min(1).default(LEGACY_ROC_APPROVAL_REASON),
  confirmSupervisorApproval: z.literal(true),
});

const LEGACY_ROC_RESTORE_REASON =
  'Traveler TRV-2026-000271 was canceled accidentally during manual troubleshooting of the legacy routing/charge-code issue. Cancellation is preserved in the audit history. Traveler is restored to active status for supervised legacy routing remediation and continuation of production record completion.';

const legacyRocRestoreSchema = z.object({
  approver: z.string().trim().min(1).default(LEGACY_ROC_BACKFILL_DEFAULT_APPROVER),
  reason: z.string().trim().min(1).default(LEGACY_ROC_RESTORE_REASON),
  confirmSupervisorApproval: z.literal(true),
});

function normalizeLegacyRocValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function getLegacyRocChargeCodeKey(departmentName: string | null | undefined): 'layup' | 'qualityControl' | null {
  const normalized = normalizeLegacyRocValue(departmentName).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return LEGACY_ROC_DEPARTMENT_CHARGE_CODE_MAP[normalized] ?? null;
}

function parseLegacyRocCutoff(cutoffDate: string): Date {
  // Treat a date-only cutoff as the end of that local production day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
    return new Date(`${cutoffDate}T23:59:59.999`);
  }
  return new Date(cutoffDate);
}

function resolveTraceFieldValue(
  fieldKey: string,
  fieldValues: Record<string, unknown>,
): unknown {
  const aliases = TRACE_FIELD_ALIASES[fieldKey];
  if (!aliases) return undefined;

  for (const alias of aliases) {
    const value = fieldValues[alias];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

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

export async function syncP2SerializedItemOnStepComplete(
  traveler: { id: string; serialNumber?: string | null; partNumber?: string | null },
  completedStep: { departmentName: string; stepNumber: number },
  performedBy: string
): Promise<void> {
  try {
    if (!traveler.serialNumber) return;

    // Trim + case-insensitive lookup that normalizes BOTH sides — the
    // DB column may itself have leading/trailing whitespace, so a bare
    // `ilike(col, trimmedInput)` is not enough. Do NOT restrict to
    // status='ACTIVE' here — if we find a non-ACTIVE row we want to log
    // and skip rather than silently miss the item (Task #257).
    const trimmedSerial = traveler.serialNumber.trim();
    const serializedItem = await db.query.p2SerializedItems.findFirst({
      where: sql`LOWER(TRIM(${p2SerializedItems.serialNumber})) = LOWER(TRIM(${trimmedSerial}))`,
    });

    if (!serializedItem) {
      console.warn(
        `[P2 Sync] No p2_serialized_items row found for serial "${trimmedSerial}" ` +
        `(traveler=${traveler.id}, step=${completedStep.stepNumber})`
      );
      return;
    }

    if (serializedItem.status !== 'ACTIVE') {
      console.log(
        `[P2 Sync] Skipping "${serializedItem.barcode}" — status is "${serializedItem.status}" ` +
        `(traveler=${traveler.id}, step=${completedStep.stepNumber})`
      );
      return;
    }

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

    // Final-step fallback (Task #257): even if the completed step's dept
    // doesn't appear in the routing sequence (or is "behind" the item),
    // detect "this was the traveler's last step" and force-complete the
    // item. Otherwise the item is stranded forever in Pending Layup /
    // its current dept.
    const remainingSteps = await db
      .select({ id: travelerSteps.id, status: travelerSteps.status })
      .from(travelerSteps)
      .where(eq(travelerSteps.travelerId, traveler.id));
    const noOpenStepsLeft = remainingSteps.every((s) => {
      const st = String(s.status).toUpperCase();
      return st !== 'NOT_STARTED' && st !== 'IN_PROGRESS' && st !== 'STARTED';
    });

    if (normalizedStepDept !== normalizedItemDept) {
      if (stepDeptIndex < 0 || stepDeptIndex < currentIndex) {
        if (noOpenStepsLeft) {
          console.log(
            `[P2 Sync] Step dept "${stepDept}" not in routing for "${serializedItem.barcode}" ` +
            `but no open steps remain on traveler ${traveler.id} — force-completing.`
          );
          await forceCompleteP2SerializedItem(
            serializedItem,
            departmentSequence,
            performedBy,
            `Traveler ${traveler.id} fully completed (step ${completedStep.stepNumber}, dept "${stepDept}" not in routing sequence)`
          );
          return;
        }
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

    // If the routing says we'd advance past the end OR the traveler has
    // no more open steps, terminate the item.
    const shouldComplete = targetIndex >= departmentSequence.length || noOpenStepsLeft;

    if (!shouldComplete) {
      updates.currentDepartment = nextDepartment;
      updates.currentStageIndex = targetIndex;
    } else {
      updates.status = 'COMPLETED';
      updates.completedAt = new Date();
      // Backfill any remaining per-dept completion timestamps so the
      // history is consistent with the COMPLETED status.
      for (let i = currentIndex; i < departmentSequence.length; i++) {
        const f = getDeptTimestampField(departmentSequence[i]);
        if (f && !updates[f]) updates[f] = new Date();
      }
    }

    const result = await db.update(p2SerializedItems)
      .set(updates)
      .where(eq(p2SerializedItems.id, serializedItem.id))
      .returning({ id: p2SerializedItems.id });

    if (!result.length) {
      console.log(`[P2 Sync] Skipped "${serializedItem.barcode}" — update failed`);
      return;
    }

    const toDept = shouldComplete ? 'COMPLETED' : (nextDepartment || 'COMPLETED');
    await db.insert(p2SerializedItemEvents).values({
      serializedItemId: serializedItem.id,
      barcode: serializedItem.barcode,
      eventType: 'TRANSITION',
      fromDepartment: itemDept,
      toDepartment: toDept,
      fromStageIndex: currentIndex,
      toStageIndex: shouldComplete ? null : targetIndex,
      performedBy,
      notes: `Synced from traveler step completion (${traveler.id}, step ${completedStep.stepNumber})`,
    });

    console.log(`[P2 Sync] Advanced "${serializedItem.barcode}" from "${itemDept}" to "${toDept}"`);
  } catch (err: any) {
    // Task #257: emit a structured error log and write an audit event so
    // silent drift becomes visible the next time someone looks.
    console.error('[P2 Sync] Failed to sync serialized item on step complete:', {
      travelerId: traveler.id,
      serialNumber: traveler.serialNumber,
      stepNumber: completedStep.stepNumber,
      stepDept: completedStep.departmentName,
      error: err?.message,
      stack: err?.stack,
    });
    try {
      if (traveler.serialNumber) {
        const trimmed = traveler.serialNumber.trim();
        const item = await db.query.p2SerializedItems.findFirst({
          where: sql`LOWER(TRIM(${p2SerializedItems.serialNumber})) = LOWER(TRIM(${trimmed}))`,
        });
        if (item) {
          await db.insert(p2SerializedItemEvents).values({
            serializedItemId: item.id,
            barcode: item.barcode,
            eventType: 'NOTE',
            fromDepartment: item.currentDepartment,
            toDepartment: item.currentDepartment,
            fromStageIndex: item.currentStageIndex || 0,
            toStageIndex: item.currentStageIndex || 0,
            performedBy: performedBy || 'system',
            notes: `P2 Sync error on traveler ${traveler.id} step ${completedStep.stepNumber}: ${err?.message ?? 'unknown'}`,
          });
        }
      }
    } catch (_auditErr) {
      // best-effort; do not throw out of the catch
    }
  }
}

/**
 * Task #257: belt-and-suspenders for the traveler-completion path.
 * Force-advance the matching p2_serialized_items row to COMPLETED even
 * if the per-step sync missed it (unknown dept, lookup miss, etc.).
 * Safe to call multiple times — no-ops when the row is already
 * COMPLETED / SCRAPPED / HOLD or when no row matches.
 */
async function forceCompleteP2SerializedItemForTraveler(
  traveler: { id: string; serialNumber?: string | null; partNumber?: string | null },
  performedBy: string
): Promise<void> {
  try {
    if (!traveler.serialNumber) return;
    const trimmedSerial = traveler.serialNumber.trim();
    // Normalize BOTH sides — DB column may itself have whitespace.
    const item = await db.query.p2SerializedItems.findFirst({
      where: sql`LOWER(TRIM(${p2SerializedItems.serialNumber})) = LOWER(TRIM(${trimmedSerial}))`,
    });
    if (!item) {
      console.warn(
        `[P2 ForceComplete] No p2_serialized_items row for serial "${trimmedSerial}" (traveler=${traveler.id})`
      );
      return;
    }
    if (item.status !== 'ACTIVE') {
      console.log(
        `[P2 ForceComplete] "${item.barcode}" already in terminal state "${item.status}" — no action`
      );
      return;
    }

    let routing = item.partRoutingId
      ? await db.query.partRoutings.findFirst({
          where: eq(partRoutings.id, item.partRoutingId),
        })
      : null;
    if (!routing && item.partNumber) {
      routing = await db.query.partRoutings.findFirst({
        where: and(eq(partRoutings.partNumber, item.partNumber), eq(partRoutings.isActive, true)),
      });
    }
    const departmentSequence = routing?.departmentSequence
      ? (routing.departmentSequence as string[])
      : [...P2_DEPARTMENT_STAGES];

    await forceCompleteP2SerializedItem(
      item,
      departmentSequence,
      performedBy,
      `Traveler ${traveler.id} marked COMPLETED — belt-and-suspenders force-complete`
    );
  } catch (err: any) {
    console.error('[P2 ForceComplete] Failed:', {
      travelerId: traveler.id,
      serialNumber: traveler.serialNumber,
      error: err?.message,
      stack: err?.stack,
    });
  }
}

async function forceCompleteP2SerializedItem(
  item: { id: string; barcode: string; currentDepartment: string; currentStageIndex: number | null; status: string },
  departmentSequence: string[],
  performedBy: string,
  reason: string
): Promise<void> {
  const now = new Date();
  const currentIndex = item.currentStageIndex || 0;
  const updates: any = {
    status: 'COMPLETED',
    completedAt: now,
    updatedAt: now,
  };
  for (let i = currentIndex; i < departmentSequence.length; i++) {
    const f = getDeptTimestampField(departmentSequence[i]);
    if (f && !updates[f]) updates[f] = now;
  }
  const result = await db.update(p2SerializedItems)
    .set(updates)
    .where(and(eq(p2SerializedItems.id, item.id), eq(p2SerializedItems.status, 'ACTIVE')))
    .returning({ id: p2SerializedItems.id });

  if (!result.length) {
    console.log(`[P2 ForceComplete] "${item.barcode}" no-op (status changed concurrently)`);
    return;
  }

  await db.insert(p2SerializedItemEvents).values({
    serializedItemId: item.id,
    barcode: item.barcode,
    eventType: 'TRANSITION',
    fromDepartment: item.currentDepartment,
    toDepartment: 'COMPLETED',
    fromStageIndex: currentIndex,
    toStageIndex: null,
    performedBy,
    notes: reason,
  });
  console.log(`[P2 ForceComplete] "${item.barcode}" -> COMPLETED (${reason})`);
}

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[Travelers] ${req.method} ${req.path}`);
  next();
});

router.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureProductionWorkflowReadSchema();
    next();
  } catch (error) {
    console.error('[Travelers] production workflow schema readiness failed:', error);
    res.status(503).json({
      error: 'Traveler workflow schema is not ready',
      message: 'Traveler data is temporarily unavailable while production workflow tables are prepared.',
    });
  }
});

router.use(validateActionToken);

// Get all travelers with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, partNumber, workOrderId, inventoryItemId, partRoutingId, routingId } = req.query;

    const filters: {
      status?: string;
      partNumber?: string;
      workOrderId?: string;
      inventoryItemId?: string;
      partRoutingId?: string;
    } = {};

    if (status && typeof status === 'string') filters.status = status;
    if (partNumber && typeof partNumber === 'string') filters.partNumber = partNumber;
    if (workOrderId && typeof workOrderId === 'string') filters.workOrderId = workOrderId;
    if (inventoryItemId && typeof inventoryItemId === 'string') filters.inventoryItemId = inventoryItemId;
    const routingIdParam = (typeof partRoutingId === 'string' && partRoutingId)
      || (typeof routingId === 'string' && routingId)
      || null;
    if (routingIdParam) filters.partRoutingId = routingIdParam;

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

router.post('/legacy-roc-backfill/dry-run', requirePermission('work_orders.override_charges'), async (req: Request, res: Response) => {
  try {
    const parsed = legacyRocDryRunSchema.parse(req.body ?? {});
    const serials = [...new Set(
      (parsed.serials ?? [...LEGACY_ROC_BACKFILL_DEFAULT_SERIALS])
        .map((s) => s.trim())
        .filter(Boolean)
    )];
    const cutoffDate = parsed.cutoffDate ?? LEGACY_ROC_BACKFILL_DEFAULT_CUTOFF;
    const cutoff = parseLegacyRocCutoff(cutoffDate);

    if (Number.isNaN(cutoff.getTime())) {
      return res.status(400).json({ error: 'Invalid cutoffDate', message: `Could not parse cutoff date '${cutoffDate}'.` });
    }

    const chargeCodeConfig = {
      layup: parsed.chargeCodes?.layup ?? LEGACY_ROC_LAYUP_CHARGE_CODE,
      qualityControl: parsed.chargeCodes?.qualityControl ?? LEGACY_ROC_QC_CHARGE_CODE,
    };

    const chargeCodeRows = await db
      .select({
        id: chargeCodes.id,
        code: chargeCodes.code,
        department: chargeCodes.department,
        active: chargeCodes.active,
      })
      .from(chargeCodes)
      .where(inArray(chargeCodes.code, [chargeCodeConfig.layup, chargeCodeConfig.qualityControl]));
    const chargeCodeByCode = new Map(chargeCodeRows.map((cc) => [cc.code, cc]));
    const chargeCodeStatus = {
      layup: chargeCodeByCode.get(chargeCodeConfig.layup) ?? null,
      qualityControl: chargeCodeByCode.get(chargeCodeConfig.qualityControl) ?? null,
    };

    const reportRows: any[] = [];

    for (const serial of serials) {
      const normalizedSerial = normalizeLegacyRocValue(serial);
      const serializedItem = await db.query.p2SerializedItems.findFirst({
        where: sql`
          LOWER(TRIM(${p2SerializedItems.serialNumber})) = ${normalizedSerial}
          OR LOWER(TRIM(${p2SerializedItems.barcode})) = ${normalizedSerial}
          OR LOWER(TRIM(COALESCE(${p2SerializedItems.travelerBarcode}, ''))) = ${normalizedSerial}
          OR LOWER(TRIM(COALESCE(${p2SerializedItems.customerSerialNumber}, ''))) = ${normalizedSerial}
        `,
      });

      const travelerLookupValues = [
        serial,
        serializedItem?.serialNumber,
        serializedItem?.barcode,
        serializedItem?.travelerBarcode,
        serializedItem?.customerSerialNumber,
      ]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);

      const travelersById = new Map<string, any>();
      for (const lookupValue of [...new Set(travelerLookupValues)]) {
        const normalizedLookup = normalizeLegacyRocValue(lookupValue);
        const matches = await db
          .select()
          .from(travelers)
          .where(sql`
            LOWER(TRIM(COALESCE(${travelers.serialNumber}, ''))) = ${normalizedLookup}
            OR LOWER(TRIM(COALESCE(${travelers.internalControlNumber}, ''))) = ${normalizedLookup}
            OR LOWER(TRIM(COALESCE(${travelers.lotNumber}, ''))) = ${normalizedLookup}
            OR LOWER(TRIM(${travelers.travelerNumber})) = ${normalizedLookup}
          `);
        for (const traveler of matches) travelersById.set(traveler.id, traveler);
      }

      if (travelersById.size === 0) {
        reportRows.push({
          inputSerial: serial,
          serializedItem: serializedItem
            ? {
                id: serializedItem.id,
                serialNumber: serializedItem.serialNumber,
                barcode: serializedItem.barcode,
                travelerBarcode: serializedItem.travelerBarcode,
                currentDepartment: serializedItem.currentDepartment,
                status: serializedItem.status,
                partNumber: serializedItem.partNumber,
                partRoutingId: serializedItem.partRoutingId,
                partRoutingRevision: serializedItem.partRoutingRevision,
              }
            : null,
          traveler: null,
          classification: 'needs_review',
          reasons: serializedItem
            ? ['Serialized item was found, but no matching traveler was found.']
            : ['No serialized item or traveler was found for this ROC identifier.'],
          proposedActions: [],
        });
        continue;
      }

      for (const traveler of travelersById.values()) {
        const steps = await db
          .select()
          .from(travelerSteps)
          .where(eq(travelerSteps.travelerId, traveler.id))
          .orderBy(asc(travelerSteps.stepNumber));

        const stepReports = [];
        for (const step of steps) {
          const chargeKey = getLegacyRocChargeCodeKey(step.departmentName);
          if (!chargeKey) continue;

          const tasks = await db
            .select()
            .from(travelerTasks)
            .where(eq(travelerTasks.travelerStepId, step.id))
            .orderBy(asc(travelerTasks.sortOrder));
          const taskIds = tasks.map((task) => task.id);
          const fields = taskIds.length > 0
            ? await db
                .select()
                .from(travelerTaskFields)
                .where(inArray(travelerTaskFields.travelerTaskId, taskIds))
            : [];

          const missingRequiredFields = fields
            .filter((field) => field.required && String(field.value ?? '').trim() === '')
            .map((field) => ({
              id: field.id,
              travelerTaskId: field.travelerTaskId,
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
            }));
          const incompleteRequiredTasks = tasks
            .filter((task) => task.required && String(task.status).toUpperCase() !== 'COMPLETED')
            .map((task) => ({
              id: task.id,
              title: task.title,
              taskType: task.taskType,
              taskPhase: task.taskPhase,
              status: task.status,
            }));

          const targetCode = chargeKey === 'layup' ? chargeCodeConfig.layup : chargeCodeConfig.qualityControl;
          const targetChargeCode = chargeCodeByCode.get(targetCode) ?? null;
          const hasActiveTargetChargeCode = targetChargeCode?.active === true;

          stepReports.push({
            stepId: step.id,
            stepNumber: step.stepNumber,
            departmentName: step.departmentName,
            status: step.status,
            startedAt: step.startedAt,
            completedAt: step.completedAt,
            completedBy: step.completedBy,
            mapsTo: chargeKey === 'layup' ? 'Layup' : 'Quality Control',
            targetChargeCode: targetChargeCode
              ? {
                  id: targetChargeCode.id,
                  code: targetChargeCode.code,
                  department: targetChargeCode.department,
                  active: targetChargeCode.active,
                }
              : { code: targetCode, active: false, missing: true },
            taskCount: tasks.length,
            incompleteRequiredTasks,
            missingRequiredFields,
            proposedAction: String(step.status).toUpperCase() === 'COMPLETED'
              ? 'already_completed_no_write'
              : hasActiveTargetChargeCode && missingRequiredFields.length === 0
                ? 'eligible_for_legacy_mapping_apply'
                : 'manual_review_required',
          });
        }

        const routing = traveler.partRoutingId
          ? await db.query.partRoutings.findFirst({ where: eq(partRoutings.id, traveler.partRoutingId) })
          : null;
        const routingSequence = Array.isArray(routing?.departmentSequence)
          ? routing.departmentSequence as string[]
          : [];
        const createdAt = traveler.createdAt ? new Date(traveler.createdAt) : null;
        const createdAfterCutoff = createdAt ? createdAt > cutoff : false;
        const terminalStatus = ['COMPLETED', 'CANCELED', 'CANCELLED'].includes(String(traveler.status).toUpperCase());
        const activeChargeCodesMissing =
          chargeCodeStatus.layup?.active !== true || chargeCodeStatus.qualityControl?.active !== true;
        const reviewSteps = stepReports.filter((step) => step.proposedAction === 'manual_review_required');
        const eligibleSteps = stepReports.filter((step) => step.proposedAction === 'eligible_for_legacy_mapping_apply');

        const reasons: string[] = [];
        if (terminalStatus) reasons.push(`Traveler status is terminal (${traveler.status}).`);
        if (createdAfterCutoff) reasons.push(`Traveler was created after cutoff ${cutoffDate}.`);
        if (stepReports.length === 0) reasons.push('Traveler has no legacy six-department steps in the approved mapping.');
        if (activeChargeCodesMissing) reasons.push('One or both target charge codes are missing or inactive.');
        if (reviewSteps.length > 0) reasons.push('One or more mapped legacy steps have missing required evidence or an inactive/missing target charge code.');
        if (!terminalStatus && !createdAfterCutoff && stepReports.length > 0 && eligibleSteps.length > 0 && reviewSteps.length === 0 && !activeChargeCodesMissing) {
          reasons.push('Eligible for apply step after supervisor approval; dry-run performed no writes.');
        }

        const classification = terminalStatus || createdAfterCutoff || stepReports.length === 0
          ? 'do_not_touch'
          : activeChargeCodesMissing || reviewSteps.length > 0
            ? 'needs_review'
            : 'safe_to_apply';

        reportRows.push({
          inputSerial: serial,
          serializedItem: serializedItem
            ? {
                id: serializedItem.id,
                serialNumber: serializedItem.serialNumber,
                barcode: serializedItem.barcode,
                travelerBarcode: serializedItem.travelerBarcode,
                currentDepartment: serializedItem.currentDepartment,
                currentStageIndex: serializedItem.currentStageIndex,
                status: serializedItem.status,
                partNumber: serializedItem.partNumber,
                partRoutingId: serializedItem.partRoutingId,
                partRoutingRevision: serializedItem.partRoutingRevision,
              }
            : null,
          traveler: {
            id: traveler.id,
            travelerNumber: traveler.travelerNumber,
            serialNumber: traveler.serialNumber,
            internalControlNumber: traveler.internalControlNumber,
            status: traveler.status,
            partNumber: traveler.partNumber,
            partRoutingId: traveler.partRoutingId,
            partRoutingRevision: traveler.partRoutingRevision,
            createdAt: traveler.createdAt,
          },
          routing: routing
            ? {
                id: routing.id,
                partNumber: routing.partNumber,
                routingRevision: (routing as any).routingRevision ?? null,
                departmentSequence: routingSequence,
              }
            : null,
          classification,
          reasons,
          proposedActions: stepReports,
        });
      }
    }

    const summary = reportRows.reduce((acc, row) => {
      acc.totalRows += 1;
      acc[row.classification] = (acc[row.classification] ?? 0) + 1;
      acc.proposedStepActions += row.proposedActions.filter(
        (action: any) => action.proposedAction === 'eligible_for_legacy_mapping_apply'
      ).length;
      acc.manualReviewStepActions += row.proposedActions.filter(
        (action: any) => action.proposedAction === 'manual_review_required'
      ).length;
      return acc;
    }, {
      totalRows: 0,
      safe_to_apply: 0,
      needs_review: 0,
      do_not_touch: 0,
      proposedStepActions: 0,
      manualReviewStepActions: 0,
    } as Record<string, number>);

    res.json({
      mode: 'dry_run',
      writesPerformed: false,
      scope: {
        serials,
        cutoffDate,
        cutoffTimestamp: cutoff.toISOString(),
        approver: parsed.approver ?? LEGACY_ROC_BACKFILL_DEFAULT_APPROVER,
        departmentMapping: {
          'Mold Prep': chargeCodeConfig.layup,
          Layup: chargeCodeConfig.layup,
          'Cello Wrap': chargeCodeConfig.layup,
          'Oven/Cure': chargeCodeConfig.layup,
          'Quality Control': chargeCodeConfig.qualityControl,
          'Final QC': chargeCodeConfig.qualityControl,
        },
      },
      chargeCodes: chargeCodeStatus,
      summary,
      rows: reportRows,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', issues: error.issues });
    }
    console.error('Error building legacy ROC traveler backfill dry-run:', error);
    res.status(500).json({ error: 'Failed to build legacy ROC traveler backfill dry-run', message: error.message });
  }
});

router.post('/legacy-roc-backfill/apply', requirePermission('work_orders.override_charges'), async (req: Request, res: Response) => {
  try {
    const parsed = legacyRocApplySchema.parse(req.body ?? {});
    const defaultSerials = [...LEGACY_ROC_BACKFILL_DEFAULT_SERIALS];
    const now = new Date();

    const layupChargeCode = await db.query.chargeCodes.findFirst({
      where: and(eq(chargeCodes.code, LEGACY_ROC_LAYUP_CHARGE_CODE), eq(chargeCodes.active, true)),
    });
    const qcChargeCode = await db.query.chargeCodes.findFirst({
      where: and(eq(chargeCodes.code, LEGACY_ROC_QC_CHARGE_CODE), eq(chargeCodes.active, true)),
    });
    if (!layupChargeCode || !qcChargeCode) {
      return res.status(400).json({
        error: 'TARGET_CHARGE_CODE_INACTIVE',
        message: 'Both ROC legacy backfill charge codes must exist and be active before apply can run.',
        chargeCodes: {
          layup: layupChargeCode ? { id: layupChargeCode.id, code: layupChargeCode.code, active: layupChargeCode.active } : null,
          qualityControl: qcChargeCode ? { id: qcChargeCode.id, code: qcChargeCode.code, active: qcChargeCode.active } : null,
        },
      });
    }

    const allowedTravelerRows = await db
      .select()
      .from(travelers)
      .where(inArray(travelers.serialNumber, defaultSerials));
    const allowedTravelerIds = new Set(
      allowedTravelerRows
        .filter((traveler) => !['COMPLETED', 'CANCELED', 'CANCELLED'].includes(String(traveler.status).toUpperCase()))
        .map((traveler) => traveler.id)
    );
    const requestedTravelerIds = parsed.travelerIds?.length
      ? parsed.travelerIds
      : [...allowedTravelerIds];
    const deniedTravelerIds = requestedTravelerIds.filter((id) => !allowedTravelerIds.has(id));
    if (deniedTravelerIds.length > 0) {
      return res.status(400).json({
        error: 'TRAVELER_NOT_IN_LEGACY_ROC_SCOPE',
        message: 'Apply is limited to the active legacy ROC travelers from the approved dry-run scope.',
        deniedTravelerIds,
      });
    }

    const results = [];

    for (const travelerId of requestedTravelerIds) {
      const traveler = allowedTravelerRows.find((row) => row.id === travelerId);
      if (!traveler) continue;

      const priorBackfill = await db.query.travelerEvents.findFirst({
        where: and(
          eq(travelerEvents.travelerId, traveler.id),
          eq(travelerEvents.action, 'LEGACY_ROC_ROUTING_BACKFILL_APPLIED')
        ),
      });
      if (priorBackfill) {
        results.push({
          travelerId: traveler.id,
          travelerNumber: traveler.travelerNumber,
          status: 'skipped',
          reason: 'Legacy ROC routing backfill already applied.',
        });
        continue;
      }

      const serializedItem = traveler.serialNumber
        ? await db.query.p2SerializedItems.findFirst({
            where: sql`LOWER(TRIM(${p2SerializedItems.serialNumber})) = LOWER(TRIM(${traveler.serialNumber.trim()}))`,
          })
        : null;

      const steps = await db
        .select()
        .from(travelerSteps)
        .where(eq(travelerSteps.travelerId, traveler.id))
        .orderBy(asc(travelerSteps.stepNumber));
      const mappedSteps = steps.filter((step) => getLegacyRocChargeCodeKey(step.departmentName));
      if (mappedSteps.length === 0) {
        results.push({
          travelerId: traveler.id,
          travelerNumber: traveler.travelerNumber,
          status: 'skipped',
          reason: 'No mapped legacy six-department traveler steps found.',
        });
        continue;
      }

      const result = await db.transaction(async (tx) => {
        const stepResults = [];

        for (const step of mappedSteps) {
          const chargeKey = getLegacyRocChargeCodeKey(step.departmentName);
          const targetChargeCode = chargeKey === 'qualityControl' ? qcChargeCode : layupChargeCode;
          const tasks = await tx
            .select()
            .from(travelerTasks)
            .where(eq(travelerTasks.travelerStepId, step.id));
          const taskIds = tasks.map((task) => task.id);
          const fields = taskIds.length > 0
            ? await tx
                .select()
                .from(travelerTaskFields)
                .where(inArray(travelerTaskFields.travelerTaskId, taskIds))
            : [];

          const incompleteRequiredTasks = tasks.filter((task) => task.required && String(task.status).toUpperCase() !== 'COMPLETED');
          const missingRequiredFields = fields.filter((field) => field.required && String(field.value ?? '').trim() === '');
          const changedTaskIds: string[] = [];

          for (const task of tasks) {
            if (String(task.status).toUpperCase() === 'COMPLETED') continue;
            await tx
              .update(travelerTasks)
              .set({
                status: 'COMPLETED',
                completedAt: now,
                completedBy: parsed.approver,
              })
              .where(eq(travelerTasks.id, task.id));
            changedTaskIds.push(task.id);
          }

          const existingSignature = await tx
            .select({ id: travelerSignatures.id })
            .from(travelerSignatures)
            .where(and(
              eq(travelerSignatures.travelerStepId, step.id),
              eq(travelerSignatures.badgeScan, 'LEGACY_ROC_BACKFILL')
            ))
            .limit(1);
          if (existingSignature.length === 0) {
            await tx.insert(travelerSignatures).values({
              travelerStepId: step.id,
              signedBy: parsed.approver,
              signedByName: parsed.approver,
              badgeScan: 'LEGACY_ROC_BACKFILL',
              signedAt: now,
              meaning: 'LEGACY_ROUTING_REMEDIATION',
              notes: parsed.reason,
              signatureData: null,
            });
          }

          const beforeStepStatus = step.status;
          if (String(step.status).toUpperCase() !== 'COMPLETED') {
            await tx
              .update(travelerSteps)
              .set({
                status: 'COMPLETED',
                completedAt: now,
                completedBy: parsed.approver,
                notes: step.notes
                  ? `${step.notes}\n\nLegacy ROC routing backfill: ${parsed.reason}`
                  : `Legacy ROC routing backfill: ${parsed.reason}`,
              })
              .where(eq(travelerSteps.id, step.id));
          }

          const stepPayload = {
            stepId: step.id,
            stepNumber: step.stepNumber,
            departmentName: step.departmentName,
            mappedDepartment: chargeKey === 'qualityControl' ? 'Quality Control' : 'Layup',
            targetChargeCodeId: targetChargeCode.id,
            targetChargeCode: targetChargeCode.code,
            beforeStepStatus,
            afterStepStatus: 'COMPLETED',
            changedTaskIds,
            incompleteRequiredTaskIds: incompleteRequiredTasks.map((task) => task.id),
            missingRequiredFields: missingRequiredFields.map((field) => ({
              id: field.id,
              travelerTaskId: field.travelerTaskId,
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
            })),
          };

          await tx.insert(travelerEvents).values({
            travelerId: traveler.id,
            actor: parsed.approver,
            actorName: parsed.approver,
            action: 'LEGACY_ROC_ROUTING_STEP_BACKFILLED',
            details: {
              ...stepPayload,
              reason: parsed.reason,
              approvedAt: now.toISOString(),
            },
          });

          await recordAuditEvent({
            eventType: 'LEGACY_ROC_ROUTING_STEP_BACKFILLED',
            subjectType: 'traveler_step',
            subjectId: step.id,
            sourceService: 'travelers.legacyRocBackfill',
            actor: { username: parsed.approver, role: 'supervisor' },
            occurredAt: now,
            reason: parsed.reason,
            entityType: 'traveler',
            entityId: traveler.id,
            payload: {
              travelerId: traveler.id,
              travelerNumber: traveler.travelerNumber,
              serialNumber: traveler.serialNumber ?? null,
              ...stepPayload,
            },
            meta: {
              travelerId: traveler.id,
              travelerNumber: traveler.travelerNumber,
              serialNumber: traveler.serialNumber ?? null,
            },
          }, tx);

          stepResults.push(stepPayload);
        }

        const finalSteps = await tx
          .select({ status: travelerSteps.status })
          .from(travelerSteps)
          .where(eq(travelerSteps.travelerId, traveler.id));
        const allStepsCompleted = finalSteps.every((step) => String(step.status).toUpperCase() === 'COMPLETED');

        let travelerCompleted = false;
        const beforeTravelerStatus = traveler.status;
        if (allStepsCompleted && String(traveler.status).toUpperCase() !== 'COMPLETED') {
          await tx
            .update(travelers)
            .set({ status: 'COMPLETED', updatedAt: now })
            .where(eq(travelers.id, traveler.id));
          travelerCompleted = true;
        }

        let serializedItemUpdated = false;
        if (serializedItem && serializedItem.status === 'ACTIVE') {
          await tx
            .update(p2SerializedItems)
            .set({
              status: allStepsCompleted ? 'COMPLETED' : serializedItem.status,
              completedAt: allStepsCompleted ? now : serializedItem.completedAt,
              updatedAt: now,
            })
            .where(eq(p2SerializedItems.id, serializedItem.id));

          await tx.insert(p2SerializedItemEvents).values({
            serializedItemId: serializedItem.id,
            barcode: serializedItem.barcode,
            eventType: 'NOTE',
            fromDepartment: serializedItem.currentDepartment,
            toDepartment: allStepsCompleted ? 'COMPLETED' : serializedItem.currentDepartment,
            fromStageIndex: serializedItem.currentStageIndex ?? null,
            toStageIndex: allStepsCompleted ? null : serializedItem.currentStageIndex ?? null,
            performedBy: parsed.approver,
            notes: parsed.reason,
            metadata: {
              travelerId: traveler.id,
              travelerNumber: traveler.travelerNumber,
              action: 'LEGACY_ROC_ROUTING_BACKFILL_APPLIED',
            },
          });
          serializedItemUpdated = true;
        }

        await tx.insert(travelerEvents).values({
          travelerId: traveler.id,
          actor: parsed.approver,
          actorName: parsed.approver,
          action: 'LEGACY_ROC_ROUTING_BACKFILL_APPLIED',
          details: {
            reason: parsed.reason,
            approvedAt: now.toISOString(),
            beforeTravelerStatus,
            afterTravelerStatus: travelerCompleted ? 'COMPLETED' : beforeTravelerStatus,
            travelerCompleted,
            serializedItemUpdated,
            stepCount: stepResults.length,
            stepIds: stepResults.map((step) => step.stepId),
          },
        });

        await recordAuditEvent({
          eventType: 'LEGACY_ROC_ROUTING_BACKFILL_APPLIED',
          subjectType: 'traveler',
          subjectId: traveler.id,
          sourceService: 'travelers.legacyRocBackfill',
          actor: { username: parsed.approver, role: 'supervisor' },
          occurredAt: now,
          reason: parsed.reason,
          entityType: 'traveler',
          entityId: traveler.id,
          payload: {
            travelerId: traveler.id,
            travelerNumber: traveler.travelerNumber,
            serialNumber: traveler.serialNumber ?? null,
            beforeTravelerStatus,
            afterTravelerStatus: travelerCompleted ? 'COMPLETED' : beforeTravelerStatus,
            travelerCompleted,
            serializedItemId: serializedItem?.id ?? null,
            serializedItemUpdated,
            stepResults,
          },
          meta: {
            travelerId: traveler.id,
            travelerNumber: traveler.travelerNumber,
            serialNumber: traveler.serialNumber ?? null,
          },
        }, tx);

        return {
          travelerId: traveler.id,
          travelerNumber: traveler.travelerNumber,
          serialNumber: traveler.serialNumber,
          status: 'applied',
          travelerCompleted,
          serializedItemUpdated,
          stepCount: stepResults.length,
        };
      });

      results.push(result);
    }

    res.json({
      mode: 'apply',
      writesPerformed: true,
      approver: parsed.approver,
      reason: parsed.reason,
      restoreRequiredTravelerNumber: LEGACY_ROC_CANCELED_TRAVELER_NUMBER,
      summary: {
        requested: requestedTravelerIds.length,
        applied: results.filter((result) => result.status === 'applied').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
      },
      results,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', issues: error.issues });
    }
    console.error('Error applying legacy ROC traveler backfill:', error);
    res.status(500).json({ error: 'Failed to apply legacy ROC traveler backfill', message: error.message });
  }
});

router.post('/legacy-roc-backfill/restore-canceled', requirePermission('work_orders.override_charges'), async (req: Request, res: Response) => {
  try {
    const parsed = legacyRocRestoreSchema.parse(req.body ?? {});
    const now = new Date();

    const [traveler] = await db
      .select()
      .from(travelers)
      .where(eq(travelers.travelerNumber, LEGACY_ROC_CANCELED_TRAVELER_NUMBER))
      .limit(1);

    if (!traveler) {
      return res.status(404).json({
        error: 'TRAVELER_NOT_FOUND',
        message: `${LEGACY_ROC_CANCELED_TRAVELER_NUMBER} was not found.`,
      });
    }

    const normalizedSerial = normalizeLegacyRocValue(traveler.serialNumber);
    const inScope = [...LEGACY_ROC_BACKFILL_DEFAULT_SERIALS].map(normalizeLegacyRocValue).includes(normalizedSerial);
    if (!inScope) {
      return res.status(400).json({
        error: 'TRAVELER_NOT_IN_LEGACY_ROC_SCOPE',
        message: `${LEGACY_ROC_CANCELED_TRAVELER_NUMBER} is not linked to the approved ROC serial scope.`,
      });
    }

    if (String(traveler.status).toUpperCase() !== 'CANCELED' && String(traveler.status).toUpperCase() !== 'CANCELLED') {
      return res.json({
        mode: 'restore_canceled',
        writesPerformed: false,
        status: 'skipped',
        travelerId: traveler.id,
        travelerNumber: traveler.travelerNumber,
        message: `Traveler is already ${traveler.status}; no restore was needed.`,
      });
    }

    const result = await db.transaction(async (tx) => {
      const [updatedTraveler] = await tx
        .update(travelers)
        .set({
          status: 'IN_PROGRESS',
          updatedAt: now,
        })
        .where(eq(travelers.id, traveler.id))
        .returning();

      await tx.insert(travelerEvents).values({
        travelerId: traveler.id,
        actor: parsed.approver,
        actorName: parsed.approver,
        action: 'LEGACY_ROC_CANCELED_TRAVELER_RESTORED',
        details: {
          reason: parsed.reason,
          restoredAt: now.toISOString(),
          beforeTravelerStatus: traveler.status,
          afterTravelerStatus: 'IN_PROGRESS',
          serialNumber: traveler.serialNumber ?? null,
        },
      });

      await recordAuditEvent({
        eventType: 'LEGACY_ROC_CANCELED_TRAVELER_RESTORED',
        subjectType: 'traveler',
        subjectId: traveler.id,
        sourceService: 'travelers.legacyRocBackfill',
        actor: { username: parsed.approver, role: 'supervisor' },
        occurredAt: now,
        reason: parsed.reason,
        entityType: 'traveler',
        entityId: traveler.id,
        payload: {
          travelerId: traveler.id,
          travelerNumber: traveler.travelerNumber,
          serialNumber: traveler.serialNumber ?? null,
          beforeTravelerStatus: traveler.status,
          afterTravelerStatus: 'IN_PROGRESS',
        },
        meta: {
          travelerId: traveler.id,
          travelerNumber: traveler.travelerNumber,
          serialNumber: traveler.serialNumber ?? null,
        },
      }, tx);

      return updatedTraveler;
    });

    res.json({
      mode: 'restore_canceled',
      writesPerformed: true,
      status: 'restored',
      traveler: result,
      approver: parsed.approver,
      reason: parsed.reason,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', issues: error.issues });
    }
    console.error('Error restoring legacy ROC canceled traveler:', error);
    res.status(500).json({ error: 'Failed to restore legacy ROC canceled traveler', message: error.message });
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
        .select({ id: productionWorkOrders.id })
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
        .select({ id: productionWorkOrders.id })
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
        .select({ id: productionWorkOrders.id })
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

/**
 * Shared helper: promote a DRAFT traveler to IN_PROGRESS.
 *
 * Runs the kit-release and WAD-release gates exactly as `POST /:id/start` does,
 * updates the traveler status, emits the STATUS_CHANGED traveler event, logs the
 * TRAVELER_STARTED audit event, and auto-transitions the linked WAD from
 * RELEASED → IN_PROGRESS.
 *
 * Returns either { ok: true, traveler } on success, or { ok: false, status, body }
 * containing the exact response shape the standalone /start endpoint would have
 * returned, so callers can forward it directly to the client.
 */
async function promoteTravelerToInProgress(
  traveler: NonNullable<Awaited<ReturnType<typeof storage.getTraveler>>>,
  actorName: string,
  actorUser?: { employeeId?: number; id?: number; username?: string }
): Promise<
  | { ok: true; traveler: NonNullable<Awaited<ReturnType<typeof storage.getTraveler>>> }
  | { ok: false; status: number; body: any }
> {
  const id = traveler.id;
  const v2ExecutionGate = traveler.projectId
    ? await getTravelerProductionExecutionGate(id)
    : null;
  if (v2ExecutionGate && !v2ExecutionGate.allowed) {
    return {
      ok: false,
      status: 409,
      body: {
        error: v2ExecutionGate.code,
        message: v2ExecutionGate.reason,
      },
    };
  }

  // Kit release gate: if traveler is linked to a KIT queue item, it must be RELEASED.
  if (traveler.inventoryItemId) {
    const numericItemId = parseInt(traveler.inventoryItemId, 10);
    if (!isNaN(numericItemId)) {
      const baseConditions = and(
        eq(manufacturingQueue.inventoryItemId, numericItemId),
        eq(manufacturingQueue.queueType, 'KIT')
      );

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
        return {
          ok: false,
          status: 400,
          body: {
            error: 'Kit not released — release the linked kit queue item before starting this traveler',
            kitQueueItemId: linkedKitItem.id,
            kitStatus: linkedKitItem.status,
          },
        };
      }
    }
  }

  // WAD gate: traveler's linked production work order must be RELEASED or IN_PROGRESS.
  if (traveler.productionWorkOrderId) {
    const [wad] = await db
      .select({ id: productionWorkOrders.id, status: productionWorkOrders.status })
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, traveler.productionWorkOrderId))
      .limit(1);
    if (!wad) {
      return {
        ok: false,
        status: 404,
        body: {
          error: 'Linked work order not found — cannot start traveler without a valid WAD',
          workOrderId: traveler.productionWorkOrderId,
        },
      };
    }
    const wadGate = await evaluateWadReleaseGate(traveler.productionWorkOrderId);
    if (!wadGate.allowed) {
      return {
        ok: false,
        status: 403,
        body: {
          error: 'Work order not released to floor',
          workOrderId: traveler.productionWorkOrderId,
          workOrderStatus: wad.status,
          reason: wadGate.reason,
        },
      };
    }
  }

  const updatedTraveler = await storage.updateTraveler(id, { status: 'IN_PROGRESS' });

  await storage.createTravelerEvent({
    travelerId: id,
    actor: actorName || 'system',
    action: 'STATUS_CHANGED',
    details: { from: 'DRAFT', to: 'IN_PROGRESS' },
  });

  auditService.logEvent({
    entityType: 'traveler',
    entityId: id,
    action: 'TRAVELER_STARTED',
    actor: {
      id: actorUser?.employeeId ?? actorUser?.id ?? undefined,
      username: actorName || actorUser?.username || 'system',
    },
    meta: {
      workOrderId: traveler.productionWorkOrderId ?? undefined,
      partNumber: traveler.partNumber ?? undefined,
      travelerNumber: traveler.travelerNumber ?? undefined,
    },
  }).catch(err => console.warn('[Audit] TRAVELER_STARTED log failed:', err?.message));

  // Auto-transition the WAD from RELEASED → IN_PROGRESS on first traveler start
  if (traveler.productionWorkOrderId) {
    const [wad] = await db
      .select({ id: productionWorkOrders.id, status: productionWorkOrders.status })
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, traveler.productionWorkOrderId))
      .limit(1);
    if (wad && wad.status === 'RELEASED') {
      await storage.updateWorkOrderStatus(wad.id, 'IN_PROGRESS');
      console.log(`[Travelers] WAD ${wad.id} transitioned to IN_PROGRESS on first traveler start`);
    }
  }

  return { ok: true, traveler: updatedTraveler };
}

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

    const startActorUser = (req as any).user;
    const result = await promoteTravelerToInProgress(
      traveler,
      startedBy || startActorUser?.username || 'system',
      startActorUser
    );
    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    return res.json(result.traveler);
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

    if (traveler.status === 'COMPLETED') {
      return res.json(traveler);
    }

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

    // Task #257: belt-and-suspenders. If the per-step sync missed the
    // matching p2_serialized_items row (unknown dept, lookup miss, etc.)
    // force-advance it to COMPLETED now that the traveler is done.
    await forceCompleteP2SerializedItemForTraveler(traveler, completedBy || 'system');

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

// Reactivate canceled traveler
router.post('/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reactivatedBy } = req.body;

    const traveler = await storage.getTraveler(id);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    if (traveler.status !== 'CANCELED') {
      return res.status(400).json({
        error: 'Only canceled travelers can be reactivated',
        currentStatus: traveler.status,
      });
    }

    const events = await storage.getTravelerEvents(id);
    const cancellationEvent = events.find((event) => {
      const details = event.details as any;
      return details?.to === 'CANCELED' && typeof details?.from === 'string';
    });
    const previousStatus = (cancellationEvent?.details as any)?.from;
    const allowedTargetStatuses = new Set(['DRAFT', 'IN_PROGRESS', 'BLOCKED']);
    const nextStatus = allowedTargetStatuses.has(previousStatus) ? previousStatus : 'DRAFT';

    const updatedTraveler = await storage.updateTraveler(id, { status: nextStatus });

    await storage.createTravelerEvent({
      travelerId: id,
      actor: reactivatedBy || 'system',
      action: 'STATUS_CHANGED',
      details: { from: 'CANCELED', to: nextStatus, restoredFrom: previousStatus || null },
    });

    res.json(updatedTraveler);
  } catch (error: any) {
    console.error('Error reactivating traveler:', error);
    res.status(500).json({ error: 'Failed to reactivate traveler', message: error.message });
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
    let traveler = await storage.getTraveler(travelerId);
    if (!traveler) return res.status(404).json({ error: 'Traveler not found' });

    if (traveler.status === 'DRAFT') {
      // Auto-promote DRAFT → IN_PROGRESS using the same gates as POST /:id/start.
      // Gate failures (kit not released / WAD not released) surface using the same
      // response shape the standalone /start endpoint returns today.
      const promote = await promoteTravelerToInProgress(traveler, supervisor.name, {
        employeeId: supervisor.id,
        username: supervisor.name,
      });
      if (!promote.ok) {
        return res.status(promote.status).json(promote.body);
      }
      traveler = promote.traveler;
    } else if (traveler.status !== 'IN_PROGRESS') {
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
            clinId: null,
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
    const { startedBy, badgeScan, employeeId: bodyEmployeeId, laborApprovalId } = req.body;

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

    let traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found' });
    }
    const v2ExecutionGate = traveler.projectId
      ? await getTravelerProductionExecutionGate(travelerId)
      : null;
    if (v2ExecutionGate && !v2ExecutionGate.allowed) {
      return res.status(409).json({
        error: v2ExecutionGate.code,
        message: v2ExecutionGate.reason,
      });
    }

    if (traveler.status === 'DRAFT') {
      // Auto-promote DRAFT → IN_PROGRESS so operators on the kiosk don't need
      // an admin to flip the status first. Runs the same kit-release and
      // WAD-release gates as POST /:id/start; gate failures surface using the
      // standalone /start endpoint's response shape.
      const promote = await promoteTravelerToInProgress(
        traveler,
        resolvedName,
        { employeeId: resolvedEmployeeId, username: resolvedName }
      );
      if (!promote.ok) {
        return res.status(promote.status).json(promote.body);
      }
      traveler = promote.traveler;
    } else if (traveler.status !== 'IN_PROGRESS') {
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

    const stepTasksForOperation = await storage.getTravelerTasks(stepId);
    const activeOperationName =
      stepTasksForOperation.find((t: any) => t.status === 'IN_PROGRESS')?.title ||
      stepTasksForOperation.find((t: any) => t.status === 'NOT_STARTED')?.title ||
      stepTasksForOperation[0]?.title ||
      step.departmentName ||
      null;
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
    if (!trainingGate.allowed) {
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
    // Sequence and material gates: previous step must be COMPLETED; lot/ICN must be allocated.
    // Training authorization is already confirmed above; evaluateTravelerStartGates is kept
    // for sequence + material checks only (it also runs a secondary training check that will
    // pass since we already verified training above).
    const startGate = await evaluateTravelerStartGates(travelerId, stepId, {
      employeeId: resolvedEmployeeId,
      employeeName: resolvedName,
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
    let travelerAutoPunch:
      | { action: 'clockedIn' | 'switched' | 'unchanged'; chargeCode: string | null; warning?: string }
      | null = null;
    if (traveler.productionWorkOrderId) {
      if (resolvedEmployeeId == null) {
        return res.status(400).json({
          error: 'EMPLOYEE_NOT_RESOLVED',
          message: 'A recognized employee badge or employee record is required before the traveler can change the active charge-code punch.',
        });
      }

      const contextResult = await buildChargeContextFromTraveler({
        id: traveler.id,
        travelerNumber: traveler.travelerNumber,
        productionWorkOrderId: traveler.productionWorkOrderId,
      });
      if (!contextResult.ok) {
        return res.status(400).json({
          error: contextResult.error.code,
          message: contextResult.error.message,
        });
      }

      const parsedApprovalId =
        laborApprovalId != null && !Number.isNaN(parseInt(String(laborApprovalId), 10))
          ? parseInt(String(laborApprovalId), 10)
          : null;
      const autoPunch = await executeTravelerAutoPunch({
        context: contextResult.context,
        employeeIdString: String(resolvedEmployeeId),
        parsedApprovalId,
      });
      if (!autoPunch.ok) {
        return res.status(autoPunch.status).json(autoPunch.body);
      }
      travelerAutoPunch = {
        action: autoPunch.action,
        chargeCode:
          autoPunch.chargeContext?.resolvedChargeCode ??
          autoPunch.chargeContext?.chargeCode ??
          null,
        warning: autoPunch.warning,
      };
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
      certReason: certResult.reason,
      isOverrun: budgetResult.isOverrun,
      nearlyExhausted: budgetResult.nearlyExhausted,
      overrunReason: budgetResult.overrunReason,
      projectId,
    };

    // Stamp the open punch entry for this employee with step-level traceability.
    if (resolvedEmployeeId != null) {
      const openEntry = await storage.getOpenPunchLedgerEntry(resolvedEmployeeId);
      if (openEntry) {
        await storage.updatePunchLedgerEntry(openEntry.id, {
          travelerStepId: stepId,
          chargeCodeId: 'error' in ccResult ? null : ccResult.chargeCodeId,
          operation: activeOperationName,
          certificationStatus: certResult.status,
          isOverrun: budgetResult.isOverrun,
          overrunReason: budgetResult.overrunReason,
          projectId,
        });

        // Phase D: close current allocation and open a new segment for the new traveler step.
        if (laborAllocationsEnabled && travelerAutoPunch?.action !== 'clockedIn' && travelerAutoPunch?.action !== 'switched') {
          const updatedOpenEntry = await storage.getOpenPunchLedgerEntry(resolvedEmployeeId);
          if (updatedOpenEntry) {
            allocationService.switchAllocation(updatedOpenEntry, {
              chargeCodeId: 'error' in ccResult ? null : ccResult.chargeCodeId,
              travelerId,
              travelerStepId: stepId,
              productionWorkOrderId: traveler.productionWorkOrderId ?? null,
              projectId: projectId ?? null,
              clinId: null,
              department: step.departmentName ?? null,
              operation: activeOperationName,
            }).catch((e: unknown) =>
              console.warn('[travelers/step-start] switchAllocation failed (non-fatal):', (e as Error)?.message)
            );
          }
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    res.json({ ...updatedStep, wadLaborContext, autoPunch: travelerAutoPunch });
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
    let resolvedEmployeeName: string | null = null;
    let signingEmployeeName: string = signedByName || signedBy || 'unknown';
    const lookupKey = badgeScan || signedBy;
    if (lookupKey) {
      const normalizedSignBadge = String(lookupKey).replace(/-/g, '');
      const signerByBadge = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedSignBadge}`)
        .limit(1);
      if (signerByBadge.length > 0) {
        signingEmployeeId = signerByBadge[0].id;
        signingEmployeeName = signerByBadge[0].name;
        resolvedEmployeeName = signerByBadge[0].name;
      } else {
        const signerByCode = await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(sql`LOWER(${employees.employeeCode}) = LOWER(${lookupKey})`)
          .limit(1);
        if (signerByCode.length > 0) {
          signingEmployeeId = signerByCode[0].id;
          signingEmployeeName = signerByCode[0].name;
          resolvedEmployeeName = signerByCode[0].name;
        }
      }
    }

    // Persist the human-readable employee name on the signature so the UI never
    // falls back to the raw badge UUID. Prefer the resolved employee name from
    // the badge lookup; otherwise accept a non-empty client-supplied name only
    // when it doesn't itself look like a raw badge/UUID/EMP code identifier.
    const HEX_BADGE_RE = /^[0-9a-f-]{16,}$/i;
    const EMP_CODE_RE = /^EMP\d+$/i;
    const isRawIdentifier = (v: string) =>
      HEX_BADGE_RE.test(v) || HEX_BADGE_RE.test(v.replace(/-/g, '')) || EMP_CODE_RE.test(v) || /^ADMIN_FORCE_SIGN$/i.test(v);
    const trimmedSignedByName = typeof signedByName === 'string' ? signedByName.trim() : '';
    const clientNameUsable =
      trimmedSignedByName &&
      trimmedSignedByName !== signedBy &&
      trimmedSignedByName !== badgeScan &&
      !isRawIdentifier(trimmedSignedByName);
    const signedByNameToStore = resolvedEmployeeName ?? (clientNameUsable ? trimmedSignedByName : null);

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
      signedByName: signedByNameToStore,
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
      actorName: signedByNameToStore ?? signedByName ?? null,
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

    // Pre-flight: for TRACE/TRACEABILITY tasks that include a packet barcode, validate the
    // barcode exists in cutting_built_packets (or can be resolved via the manufacturing queue
    // fallback for MFG-format barcodes) and write the allocatedToOrder link NOW — before
    // any traveler_task_fields rows are written.  Returning 422 here ensures no field data is
    // persisted when the barcode is unresolvable (AS9100 traceability defect guard).
    if (task.taskType === 'TRACE' || task.taskType === 'TRACEABILITY') {
      const preFlightFV = fieldValues || {};
      const preFlightBarcode = preFlightFV['packetBarcode'] || preFlightFV['packet_barcode'] || '';
      if (preFlightBarcode) {
        const resolution = await resolvePacketBarcode(preFlightBarcode);

        if (!resolution) {
          console.warn(`[Packet Allocation] Packet barcode "${preFlightBarcode}" not found in cutting_built_packets or manufacturing queue — rejecting task ${taskId} completion (traveler ${travelerId})`);
          return res.status(422).json({
            error: `Packet barcode "${preFlightBarcode}" was not found in the cutting packet inventory. Verify the barcode is correct and that the packet has been built at the cutting table.`,
            code: 'PACKET_BARCODE_NOT_FOUND',
            packetBarcode: preFlightBarcode,
          });
        }

        if (resolution.source === 'manufacturing_queue') {
          console.warn(`[Packet Allocation] Packet barcode "${preFlightBarcode}" resolved via manufacturing queue fallback (queue item #${resolution.queueItem?.id}) — skipping allocatedToOrder write (no cutting_built_packets row). Backfill result: ${resolution.backfillResult ?? 'not attempted'}`);
        }

        if (resolution.packetRecord && traveler.serialNumber) {
          const p2Item = await db.query.p2SerializedItems.findFirst({
            where: or(
              ilike(p2SerializedItems.serialNumber, traveler.serialNumber),
              ilike(p2SerializedItems.travelerBarcode, traveler.serialNumber),
            ),
          });

          if (p2Item) {
            const allocationTarget = p2Item.barcode || p2Item.serialNumber;
            const allocatedToThisTraveler = resolution.packetRecord.allocatedToOrder === allocationTarget;
            if (!resolution.packetRecord.allocatedToOrder || allocatedToThisTraveler || resolution.packetRecord.status === 'AVAILABLE') {
              // Phase-2 (Task #144): pin the packet to the traveler's
              // currently active routing step so downstream material draws
              // can hard-block out-of-order consumption against this packet.
              // If no active step is resolvable we leave the pin null —
              // service-layer enforcement will then require the operator
              // to scan the active step explicitly.
              const activeStep = await getActiveRoutingStep(travelerId);
              const intendedRoutingStepId = activeStep?.inProgress
                ? activeStep.step.id
                : null;
              await commitPacketToTravelerInventory({
                packet: resolution.packetRecord,
                scannedBarcode: preFlightBarcode,
                allocationTarget,
                intendedRoutingStepId,
              });
              console.log(`[Packet Allocation] Allocated cutting packet "${preFlightBarcode}" → "${allocationTarget}" (traveler ${travelerId}, intendedRoutingStepId=${intendedRoutingStepId ?? 'null'})`);
            } else {
              console.log(`[Packet Allocation] Packet "${preFlightBarcode}" already allocated to "${resolution.packetRecord.allocatedToOrder}" — skipping overwrite`);
            }
          } else {
            console.warn(`[Packet Allocation] No P2 serialized item found for serial number "${traveler.serialNumber}" (traveler ${travelerId}) — allocatedToOrder not set`);
          }
        } else if (!resolution.packetRecord) {
          console.warn(`[Packet Allocation] Traveler ${travelerId}: packet "${preFlightBarcode}" resolved from manufacturing queue — no cutting_built_packets row for allocation`);
        } else {
          console.warn(`[Packet Allocation] Traveler ${travelerId} has no serialNumber — cannot resolve P2 item for packet allocation`);
        }
      }
    }

    const fields = await storage.getTravelerTaskFields(taskId);
    if (fields.length > 0) {
      const resolvedFieldValues = fieldValues || {};
      const resolvedFieldValidations = fieldValidations || {};
      for (const field of fields) {
        let value = resolvedFieldValues[field.fieldKey];
        if (value === undefined && (task.taskType === 'TRACE' || task.taskType === 'TRACEABILITY')) {
          value = resolveTraceFieldValue(field.fieldKey, resolvedFieldValues);
        }
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
        // Note: packet existence guard and allocatedToOrder write run in the pre-flight
        // block before the field-save loop above, so we know the packet is valid here.
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
    const { travelerId, taskId, fieldId } = req.params;
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

    const [existingField] = await db
      .select()
      .from(travelerTaskFields)
      .where(eq(travelerTaskFields.id, fieldId))
      .limit(1);
    const task = await storage.getTravelerTask(taskId);
    const step = task ? await storage.getTravelerStep(task.travelerStepId) : null;

    const updatedField = await storage.updateTravelerTaskField(fieldId, updateData);

    if (task && step) {
      const legacyBackfillEvent = await db.query.travelerEvents.findFirst({
        where: and(
          eq(travelerEvents.travelerId, travelerId),
          eq(travelerEvents.action, 'LEGACY_ROC_ROUTING_STEP_BACKFILLED'),
          sql`${travelerEvents.details}->>'stepId' = ${step.id}`
        ),
      });

      if (legacyBackfillEvent) {
        const actor = recordedBy || 'unknown';
        await storage.createTravelerEvent({
          travelerId,
          actor,
          actorName: actor,
          action: 'LEGACY_ROC_BACKFILL_FIELD_RECORDED',
          details: {
            stepId: step.id,
            stepNumber: step.stepNumber,
            departmentName: step.departmentName,
            taskId,
            taskTitle: task.title,
            fieldId,
            fieldKey: updatedField.fieldKey,
            fieldLabel: updatedField.fieldLabel,
            previousValue: existingField?.value ?? null,
            recordedValue: value ?? null,
            recordedAt: updateData.recordedAt.toISOString(),
            reason: 'Collected traveler data entered after supervised legacy ROC routing backfill.',
          },
        });

        await recordAuditEvent({
          eventType: 'LEGACY_ROC_BACKFILL_FIELD_RECORDED',
          subjectType: 'traveler_task_field',
          subjectId: fieldId,
          sourceService: 'travelers.legacyRocBackfill',
          actor: { username: actor, role: null },
          occurredAt: updateData.recordedAt,
          reason: 'Collected traveler data entered after supervised legacy ROC routing backfill.',
          entityType: 'traveler',
          entityId: travelerId,
          payload: {
            travelerId,
            travelerNumber: traveler.travelerNumber,
            serialNumber: traveler.serialNumber ?? null,
            stepId: step.id,
            stepNumber: step.stepNumber,
            departmentName: step.departmentName,
            taskId,
            taskTitle: task.title,
            fieldId,
            fieldKey: updatedField.fieldKey,
            fieldLabel: updatedField.fieldLabel,
            previousValue: existingField?.value ?? null,
            recordedValue: value ?? null,
          },
          meta: {
            travelerId,
            travelerNumber: traveler.travelerNumber,
            serialNumber: traveler.serialNumber ?? null,
          },
        });
      }
    }

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

    if (!stepId || !reason || !signedBy) {
      return res.status(400).json({ error: 'stepId, reason, and signedBy are required' });
    }

    // Resolve the human-readable employee name from the badge/code so the stored
    // signature shows the operator's name instead of a raw badge UUID. Falls
    // back to the supplied signedByName if no employee record is matched.
    let resolvedForceSignName: string | null = null;
    const forceSignLookup = String(signedBy);
    if (forceSignLookup) {
      const normalizedForceBadge = forceSignLookup.replace(/-/g, '');
      const forceSignerByBadge = await db
        .select({ name: employees.name })
        .from(employees)
        .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedForceBadge}`)
        .limit(1);
      if (forceSignerByBadge.length > 0) {
        resolvedForceSignName = forceSignerByBadge[0].name;
      } else {
        const forceSignerByCode = await db
          .select({ name: employees.name })
          .from(employees)
          .where(sql`LOWER(${employees.employeeCode}) = LOWER(${forceSignLookup})`)
          .limit(1);
        if (forceSignerByCode.length > 0) {
          resolvedForceSignName = forceSignerByCode[0].name;
        }
      }
    }
    const FORCE_HEX_RE = /^[0-9a-f-]{16,}$/i;
    const FORCE_EMP_RE = /^EMP\d+$/i;
    const forceIsRawIdentifier = (v: string) =>
      FORCE_HEX_RE.test(v) || FORCE_HEX_RE.test(v.replace(/-/g, '')) || FORCE_EMP_RE.test(v);
    const trimmedForceName = typeof signedByName === 'string' ? signedByName.trim() : '';
    const forceClientNameUsable =
      trimmedForceName && trimmedForceName !== signedBy && !forceIsRawIdentifier(trimmedForceName);
    const forceSignedByNameToStore =
      resolvedForceSignName ?? (forceClientNameUsable ? trimmedForceName : null);

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
      signedByName: forceSignedByNameToStore,
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

// Edit the off-system completion link/notes for a traveler that was marked
// completed off-system from the P2 Production Queue. Only travelers whose
// `workOrderId` was stamped with the `Off-system: …` prefix (or that already
// have an `offSystemCompletionLink`) are eligible — see Task #106.
const offSystemLinkSchema = z.object({
  offSystemCompletionLink: z.string().max(8192).nullable(),
  updatedBy: z.string().optional(),
});

router.patch('/:id/off-system-link', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = offSystemLinkSchema.parse(req.body);

    const [existing] = await db.select().from(travelers).where(eq(travelers.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Traveler not found' });
    }

    const isOffSystem =
      existing.offSystemCompletionLink !== null && existing.offSystemCompletionLink !== undefined
        ? true
        : (existing.workOrderId ?? '').startsWith('Off-system');

    // When clearing the link/notes, preserve the off-system marker by writing
    // an empty string (sentinel) rather than null — so the row remains
    // identifiable as an off-system completion even when the workOrderId is
    // a real (non-off-system) value.
    const trimmed = parsed.offSystemCompletionLink?.trim() ?? '';
    const newValue = trimmed.length > 0 ? trimmed : (isOffSystem ? '' : null);

    if (!isOffSystem) {
      return res.status(400).json({
        error: 'Traveler is not an off-system completion — link cannot be edited',
      });
    }

    const previousValue = existing.offSystemCompletionLink ?? null;

    const [updated] = await db.update(travelers)
      .set({
        offSystemCompletionLink: newValue,
        updatedAt: new Date(),
      })
      .where(eq(travelers.id, id))
      .returning();

    const actorName = parsed.updatedBy || (req as any).user?.username || 'system';

    await db.insert(auditEvents).values({
      entityType: 'traveler',
      entityId: id,
      action: 'OFF_SYSTEM_LINK_EDITED',
      actorName,
      reason: 'Off-system completion link edited from Traveler Management',
      fieldsChanged: {
        offSystemCompletionLink: { before: previousValue, after: newValue },
      },
      meta: {
        travelerId: id,
        travelerNumber: existing.travelerNumber,
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', issues: error.issues });
    }
    console.error('Error editing off-system completion link:', error);
    res.status(500).json({ error: 'Failed to update off-system link', message: error.message });
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
