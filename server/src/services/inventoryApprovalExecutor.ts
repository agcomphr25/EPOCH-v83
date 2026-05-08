/**
 * inventoryApprovalExecutor — Task #164
 *
 * Replays high-risk inventory mutations after their approval_request has been
 * APPROVED through the generic escalation engine. Wired into the
 * /api/approvals/:id/approve route handler so that approval and execution
 * happen as a single user action from the inbox.
 *
 * Each handler is responsible for:
 *   1. Re-validating the original payload against current state (the lot
 *      may have moved since the request was opened).
 *   2. Applying the storage mutation that the route originally would have
 *      applied immediately.
 *   3. Writing an inventoryTransactionLedger entry that links the approval
 *      via `approvalId` so the financial audit chain is complete.
 *
 * Handlers are intentionally defensive: if the precondition no longer holds
 * (e.g. lot already CONSUMED), the executor throws and the caller surfaces
 * the error. The approval row remains APPROVED so the operator can see why
 * execution failed in the inbox history.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { storage } from '../../storage';
import { materialLots } from '../../schema';
import type { ApprovalRequest } from '../../schema';
import { recordInventoryLedgerEntry } from './inventoryTransactionLedgerService';

export type InventoryApprovalRequestType =
  | 'INV_MANUAL_ADJUSTMENT'
  | 'INV_NEGATIVE_INVENTORY'
  | 'INV_ALLOCATION_OVERRIDE'
  | 'INV_EXPIRED_USE'
  | 'INV_QUARANTINE_RELEASE';

const INVENTORY_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'INV_MANUAL_ADJUSTMENT',
  'INV_NEGATIVE_INVENTORY',
  'INV_ALLOCATION_OVERRIDE',
  'INV_EXPIRED_USE',
  'INV_QUARANTINE_RELEASE',
]);

export function isInventoryApprovalRequestType(t: string): t is InventoryApprovalRequestType {
  return INVENTORY_REQUEST_TYPES.has(t);
}

export interface ExecutorActor {
  userId?: number | null;
  displayName: string;
}

export interface ExecutorResult {
  ok: true;
  requestType: InventoryApprovalRequestType;
  ledgerEntryId: string | null;
  detail?: Record<string, unknown>;
}

export class InventoryExecutorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'InventoryExecutorError';
  }
}

/**
 * Execute the inventory mutation associated with an approved request.
 * Returns null when the request type is not an inventory request (caller
 * should treat as a no-op).
 */
export async function executeInventoryApproval(params: {
  request: ApprovalRequest;
  approver: ExecutorActor;
}): Promise<ExecutorResult | null> {
  const { request, approver } = params;
  if (!isInventoryApprovalRequestType(request.requestType)) return null;

  const payload = (request.requestPayload ?? {}) as Record<string, any>;

  switch (request.requestType as InventoryApprovalRequestType) {
    case 'INV_MANUAL_ADJUSTMENT':
    case 'INV_NEGATIVE_INVENTORY':
      return executeAdjust(request, payload, approver);
    case 'INV_QUARANTINE_RELEASE':
      return executeQuarantineRelease(request, payload, approver);
    case 'INV_EXPIRED_USE':
    case 'INV_ALLOCATION_OVERRIDE':
      return executeConsumeWithApproval(request, payload, approver);
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function executeAdjust(
  request: ApprovalRequest,
  payload: Record<string, any>,
  approver: ExecutorActor,
): Promise<ExecutorResult> {
  const lotId = payload.lotId ?? request.subjectId;
  if (!lotId) throw new InventoryExecutorError('INVALID_PAYLOAD', 'lotId missing from approval payload');

  const delta = Number(payload.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new InventoryExecutorError('INVALID_PAYLOAD', 'delta must be a non-zero number');
  }

  const lot = await storage.getMaterialLot(lotId);
  if (!lot) throw new InventoryExecutorError('LOT_NOT_FOUND', `Material lot ${lotId} no longer exists`);

  const remaining = parseFloat(lot.remainingQty);
  const projected = remaining + delta;
  const allowNegative = !!payload.allowNegative || request.requestType === 'INV_NEGATIVE_INVENTORY';
  if (projected < 0 && !allowNegative) {
    throw new InventoryExecutorError(
      'NEGATIVE_QTY',
      `Adjustment of ${delta} would drive remainingQty to ${projected} (below zero)`,
    );
  }

  const result = await storage.adjustMaterialLot(lotId, {
    delta,
    reasonCode: payload.reasonCode ?? request.resolutionReasonCode ?? 'APPROVED_ADJUSTMENT',
    notes: composeNotes(payload.notes, request, approver),
    performedBy: payload.performedBy ?? request.requestedByDisplayName,
    allowNegative,
  });

  const ledger = await safeLedger({
    transactionType: 'ADJUST',
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: lot.materialPartNumber,
    lotId,
    quantityDelta: delta,
    quantityBefore: remaining,
    quantityAfter: projected,
    unitOfMeasure: lot.unitOfMeasure,
    statusBefore: lot.status,
    statusAfter: lot.status,
    performedByUserId: request.requestedByUserId,
    performedByDisplayName: request.requestedByDisplayName,
    approvedByUserId: approver.userId ?? null,
    approvedByDisplayName: approver.displayName,
    approvalId: request.id,
    reasonCode: payload.reasonCode ?? request.resolutionReasonCode ?? null,
    notes: request.resolutionNotes ?? payload.notes ?? null,
    sourceModule: 'inventory-approval-executor',
    sourceRecordId: request.id,
    metadata: {
      approvalRequestId: request.id,
      requestType: request.requestType,
      allowNegative,
    },
  });

  return {
    ok: true,
    requestType: request.requestType as InventoryApprovalRequestType,
    ledgerEntryId: ledger,
    detail: { lot: result.lot, transaction: result.transaction },
  };
}

async function executeQuarantineRelease(
  request: ApprovalRequest,
  payload: Record<string, any>,
  approver: ExecutorActor,
): Promise<ExecutorResult> {
  const lotId = payload.lotId ?? request.subjectId;
  if (!lotId) throw new InventoryExecutorError('INVALID_PAYLOAD', 'lotId missing from approval payload');

  const lot = await storage.getMaterialLot(lotId);
  if (!lot) throw new InventoryExecutorError('LOT_NOT_FOUND', `Material lot ${lotId} no longer exists`);

  if (lot.status !== 'QUARANTINE') {
    throw new InventoryExecutorError(
      'INVALID_STATE',
      `Lot ${lot.internalControlNumber} is ${lot.status}, expected QUARANTINE`,
    );
  }

  const newStatus: string = payload.newStatus === 'RELEASED' ? 'ACCEPTED' : (payload.newStatus ?? 'ACCEPTED');
  if (!['ACCEPTED'].includes(newStatus)) {
    throw new InventoryExecutorError('INVALID_STATE', `Unsupported release target status ${newStatus}`);
  }

  const updateData: Record<string, any> = {
    status: newStatus,
    acceptedBy: approver.displayName,
    acceptedAt: new Date(),
  };
  const updated = await storage.updateMaterialLot(lotId, updateData);

  await storage.createMaterialLotTransaction({
    materialLotId: lotId,
    internalControlNumber: lot.internalControlNumber,
    transactionType: newStatus as any,
    qtyBefore: lot.remainingQty,
    qtyAfter: lot.remainingQty,
    qtyChange: '0',
    performedBy: approver.displayName,
    reason: payload.reasonCode ?? request.resolutionReasonCode ?? 'QUARANTINE_RELEASE',
    notes: composeNotes(payload.notes, request, approver),
  } as any);

  const ledger = await safeLedger({
    transactionType: 'STATUS_CHANGE',
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: lot.materialPartNumber,
    lotId,
    quantityDelta: 0,
    quantityBefore: parseFloat(lot.remainingQty),
    quantityAfter: parseFloat(lot.remainingQty),
    unitOfMeasure: lot.unitOfMeasure,
    statusBefore: lot.status,
    statusAfter: newStatus,
    performedByUserId: request.requestedByUserId,
    performedByDisplayName: request.requestedByDisplayName,
    approvedByUserId: approver.userId ?? null,
    approvedByDisplayName: approver.displayName,
    approvalId: request.id,
    reasonCode: payload.reasonCode ?? request.resolutionReasonCode ?? 'QUARANTINE_RELEASE',
    notes: request.resolutionNotes ?? payload.notes ?? null,
    sourceModule: 'inventory-approval-executor',
    sourceRecordId: request.id,
    metadata: { approvalRequestId: request.id, requestType: request.requestType, newStatus },
  });

  return {
    ok: true,
    requestType: 'INV_QUARANTINE_RELEASE',
    ledgerEntryId: ledger,
    detail: { lot: updated },
  };
}

/**
 * Records the approval ledger entry for an EXPIRED-use or ALLOCATION-override
 * consume. The actual qty draw still happens on the /consume route once the
 * operator re-submits with the approvalRequestId in hand — the executor's job
 * is to mark the approval consumed and book a non-quantity ledger entry that
 * traces the authorization. This mirrors the existing material-issue override
 * flow (Task #144) where the ledger entry written by /consume references the
 * approval but the mutation itself is gated separately.
 */
async function executeConsumeWithApproval(
  request: ApprovalRequest,
  payload: Record<string, any>,
  approver: ExecutorActor,
): Promise<ExecutorResult> {
  const lotId = payload.lotId ?? request.subjectId;
  if (!lotId) throw new InventoryExecutorError('INVALID_PAYLOAD', 'lotId missing from approval payload');

  const [lot] = await db.select().from(materialLots).where(eq(materialLots.id, lotId)).limit(1);
  if (!lot) throw new InventoryExecutorError('LOT_NOT_FOUND', `Material lot ${lotId} no longer exists`);

  const ledger = await safeLedger({
    transactionType: 'STATUS_CHANGE',
    inventoryItemId: lot.inventoryItemId,
    agPartNumber: lot.materialPartNumber,
    lotId,
    quantityDelta: 0,
    quantityBefore: parseFloat(lot.remainingQty),
    quantityAfter: parseFloat(lot.remainingQty),
    unitOfMeasure: lot.unitOfMeasure,
    statusBefore: lot.status,
    statusAfter: lot.status,
    performedByUserId: request.requestedByUserId,
    performedByDisplayName: request.requestedByDisplayName,
    approvedByUserId: approver.userId ?? null,
    approvedByDisplayName: approver.displayName,
    approvalId: request.id,
    reasonCode: payload.reasonCode ?? request.resolutionReasonCode ?? request.requestType,
    notes: composeNotes(payload.notes, request, approver),
    sourceModule: 'inventory-approval-executor',
    sourceRecordId: request.id,
    metadata: {
      approvalRequestId: request.id,
      requestType: request.requestType,
      authorizes: request.requestType === 'INV_EXPIRED_USE' ? 'consume past expiration' : 'consume against allocation',
      qtyAuthorized: payload.qtyUsed ?? null,
      travelerId: payload.travelerId ?? null,
      travelerStepId: payload.travelerStepId ?? null,
    },
  });

  return {
    ok: true,
    requestType: request.requestType as InventoryApprovalRequestType,
    ledgerEntryId: ledger,
    detail: {
      message:
        'Approval recorded. Operator may now re-submit the consume request with this approvalRequestId to complete the draw.',
      approvalRequestId: request.id,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function composeNotes(
  payloadNotes: string | undefined | null,
  request: ApprovalRequest,
  approver: ExecutorActor,
): string {
  const parts: string[] = [];
  if (payloadNotes) parts.push(payloadNotes);
  parts.push(`Approved via ${request.requestType} #${request.id} by ${approver.displayName}.`);
  if (request.resolutionNotes) parts.push(`Approver notes: ${request.resolutionNotes}`);
  return parts.join(' ');
}

async function safeLedger(input: Parameters<typeof recordInventoryLedgerEntry>[0]): Promise<string | null> {
  try {
    const row = await recordInventoryLedgerEntry(input);
    return row.id;
  } catch (err: any) {
    // Ledger writes are best-effort: an invalid inventoryItemId or numeric
    // mismatch should not block the operator's primary action. The error is
    // logged so it can be reconciled by the auditor.
    console.error('[inventoryApprovalExecutor] ledger write failed:', err?.message ?? err);
    return null;
  }
}
