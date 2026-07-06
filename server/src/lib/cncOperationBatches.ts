export type OperationBatchStatus = 'queued' | 'assigned' | 'in_progress' | 'paused' | 'hold' | 'completed' | 'cancelled' | string;

export type BatchQuantityRow = {
  batchQty: number;
  qtyCompleted: number;
  qtyScrapped: number;
  status: OperationBatchStatus;
};

export type BatchRollup = {
  totalStepQty: number;
  batchedQty: number;
  availableToBatchQty: number;
  inProgressQty: number;
  completedQty: number;
  scrappedQty: number;
  remainingQty: number;
};

export function computeBatchRollup(totalStepQty: number, batches: BatchQuantityRow[]): BatchRollup {
  const activeBatches = batches.filter((batch) => batch.status !== 'cancelled');
  const batchedQty = activeBatches.reduce((sum, batch) => sum + Number(batch.batchQty ?? 0), 0);
  const inProgressQty = activeBatches
    .filter((batch) => batch.status === 'in_progress' || batch.status === 'paused')
    .reduce((sum, batch) => sum + Math.max(Number(batch.batchQty ?? 0) - Number(batch.qtyCompleted ?? 0) - Number(batch.qtyScrapped ?? 0), 0), 0);
  const completedQty = activeBatches.reduce((sum, batch) => sum + Number(batch.qtyCompleted ?? 0), 0);
  const scrappedQty = activeBatches.reduce((sum, batch) => sum + Number(batch.qtyScrapped ?? 0), 0);

  return {
    totalStepQty,
    batchedQty,
    availableToBatchQty: Math.max(totalStepQty - batchedQty, 0),
    inProgressQty,
    completedQty,
    scrappedQty,
    remainingQty: Math.max(totalStepQty - completedQty - scrappedQty, 0),
  };
}

export function validateBatchQuantityLimit(existingActiveQty: number, requestedQty: number, limitQty: number) {
  const availableQty = Math.max(limitQty - existingActiveQty, 0);
  return {
    allowed: requestedQty <= availableQty,
    availableQty,
    requestedQty,
    limitQty,
  };
}

export function isBatchBarcodeUniqueConflict(error: { code?: string; constraint?: string; detail?: string; message?: string } | null | undefined): boolean {
  if (error?.code !== '23505') return false;
  const text = `${error.constraint ?? ''} ${error.detail ?? ''} ${error.message ?? ''}`.toLowerCase();
  return text.includes('cnc_operation_batches') || text.includes('batch_code') || text.includes('barcode_value');
}

export function completedAndScrappedEqualsBatchQty(batchQty: number, qtyCompleted: number, qtyScrapped: number): boolean {
  return qtyCompleted + qtyScrapped === batchQty;
}

export function completedAndScrappedWithinBatchQty(batchQty: number, qtyCompleted: number, qtyScrapped: number): boolean {
  return qtyCompleted + qtyScrapped <= batchQty;
}

export function canLoadBatchForStation(args: {
  status: OperationBatchStatus;
  batchCode: string;
  assignedEmployeeId?: number | null;
  employeeId: number;
  managerOverride?: boolean;
  allowPaused?: boolean;
  allowHold?: boolean;
}) {
  if (args.status === 'completed' || args.status === 'cancelled' || (!args.allowHold && args.status === 'hold')) {
    return {
      allowed: false,
      status: 422,
      reason: `Batch ${args.batchCode} is ${args.status} and cannot be loaded for production`,
    };
  }
  if (!args.allowPaused && args.status === 'paused') {
    return {
      allowed: false,
      status: 422,
      reason: `Batch ${args.batchCode} is paused. Resume it before recording production.`,
    };
  }
  if (args.assignedEmployeeId && Number(args.assignedEmployeeId) !== Number(args.employeeId) && !args.managerOverride) {
    return {
      allowed: false,
      status: 403,
      reason: `Batch ${args.batchCode} is assigned to another technician`,
    };
  }
  return { allowed: true, status: 200, reason: null };
}

export function shouldCompleteStepFromBatches(batches: BatchQuantityRow[]): boolean {
  const activeBatches = batches.filter((batch) => batch.status !== 'cancelled');
  return activeBatches.length > 0 && activeBatches.every((batch) =>
    batch.status === 'completed' && completedAndScrappedEqualsBatchQty(
      Number(batch.batchQty ?? 0),
      Number(batch.qtyCompleted ?? 0),
      Number(batch.qtyScrapped ?? 0),
    )
  );
}

export function buildBatchLaborEntryValues(args: {
  employeeId: number | string;
  workOrderId: string;
  travelerId: string;
  travelerStepId: string;
  operationBatchId: number;
  department: string | null;
  operation: string | null;
  machineId?: number | null;
  machineName?: string | null;
  clockIn: Date;
}) {
  return {
    employee_id: String(args.employeeId),
    date: args.clockIn.toISOString().slice(0, 10),
    clock_in: args.clockIn,
    clock_out: null,
    production_work_order_id: args.workOrderId,
    traveler_id: args.travelerId,
    traveler_step_id: args.travelerStepId,
    operation_batch_id: args.operationBatchId,
    department: args.department,
    operation: args.operation,
    machine_id: args.machineId ?? null,
    machine_name: args.machineName ?? null,
    approval_status: 'PENDING_APPROVAL',
  };
}
