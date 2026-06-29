import { describe, expect, it } from 'vitest';
import {
  buildBatchLaborEntryValues,
  canLoadBatchForStation,
  completedAndScrappedEqualsBatchQty,
  completedAndScrappedWithinBatchQty,
  computeBatchRollup,
  isBatchBarcodeUniqueConflict,
  shouldCompleteStepFromBatches,
  validateBatchQuantityLimit,
} from '../src/lib/cncOperationBatches';

describe('CNC operation batch rules', () => {
  it('prevents active operation batch quantities from exceeding the step limit', () => {
    expect(validateBatchQuantityLimit(8, 3, 10)).toMatchObject({
      allowed: false,
      availableQty: 2,
      requestedQty: 3,
      limitQty: 10,
    });
    expect(validateBatchQuantityLimit(8, 2, 10).allowed).toBe(true);
  });

  it('computes dashboard rollups while excluding cancelled batches from availability', () => {
    expect(computeBatchRollup(20, [
      { batchQty: 6, qtyCompleted: 2, qtyScrapped: 1, status: 'in_progress' },
      { batchQty: 4, qtyCompleted: 4, qtyScrapped: 0, status: 'completed' },
      { batchQty: 5, qtyCompleted: 0, qtyScrapped: 0, status: 'cancelled' },
    ])).toEqual({
      totalStepQty: 20,
      batchedQty: 10,
      availableToBatchQty: 10,
      inProgressQty: 3,
      completedQty: 6,
      scrappedQty: 1,
      remainingQty: 13,
    });
  });

  it('recognizes barcode and batch-code uniqueness violations', () => {
    expect(isBatchBarcodeUniqueConflict({
      code: '23505',
      constraint: 'cnc_operation_batches_barcode_idx',
      detail: 'Key (barcode_value)=(OPB-10045-20-001) already exists.',
    })).toBe(true);
    expect(isBatchBarcodeUniqueConflict({ code: '23505', constraint: 'users_email_key' })).toBe(false);
  });

  it('blocks invalid station scans for terminal or held batches', () => {
    expect(canLoadBatchForStation({
      status: 'completed',
      batchCode: 'OPB-10045-20-001',
      employeeId: 7,
    })).toMatchObject({ allowed: false, status: 422 });
    expect(canLoadBatchForStation({
      status: 'hold',
      batchCode: 'OPB-10045-20-001',
      employeeId: 7,
    })).toMatchObject({ allowed: false, status: 422 });
  });

  it('allows manager override for assigned-technician mismatch but blocks operators', () => {
    const base = {
      status: 'assigned',
      batchCode: 'OPB-10045-20-001',
      assignedEmployeeId: 11,
      employeeId: 7,
    };
    expect(canLoadBatchForStation(base)).toMatchObject({ allowed: false, status: 403 });
    expect(canLoadBatchForStation({ ...base, managerOverride: true })).toMatchObject({ allowed: true });
  });

  it('marks batch and step completion only when completed plus scrapped exactly equals batch qty', () => {
    expect(completedAndScrappedWithinBatchQty(10, 8, 2)).toBe(true);
    expect(completedAndScrappedEqualsBatchQty(10, 8, 2)).toBe(true);
    expect(completedAndScrappedWithinBatchQty(10, 9, 2)).toBe(false);
    expect(shouldCompleteStepFromBatches([
      { batchQty: 5, qtyCompleted: 4, qtyScrapped: 1, status: 'completed' },
      { batchQty: 5, qtyCompleted: 5, qtyScrapped: 0, status: 'completed' },
      { batchQty: 5, qtyCompleted: 0, qtyScrapped: 0, status: 'cancelled' },
    ])).toBe(true);
  });

  it('builds a labor entry linked to employee, work order, traveler step, batch, and machine', () => {
    const clockIn = new Date('2026-06-25T13:00:00.000Z');
    expect(buildBatchLaborEntryValues({
      employeeId: 7,
      workOrderId: '11111111-1111-1111-1111-111111111111',
      travelerId: '22222222-2222-2222-2222-222222222222',
      travelerStepId: 'step-20',
      operationBatchId: 42,
      department: 'CNC',
      operation: 'CNC Op 20: Rough Mill',
      machineId: 3,
      machineName: 'VF-2',
      clockIn,
    })).toMatchObject({
      employee_id: '7',
      production_work_order_id: '11111111-1111-1111-1111-111111111111',
      traveler_id: '22222222-2222-2222-2222-222222222222',
      traveler_step_id: 'step-20',
      operation_batch_id: 42,
      machine_id: 3,
      machine_name: 'VF-2',
      department: 'CNC',
      operation: 'CNC Op 20: Rough Mill',
    });
  });
});
