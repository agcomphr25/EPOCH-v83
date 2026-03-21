import { pool } from '../../db';
import { auditUpdateOrders } from './orderAuditWrapper';
import { derivePipelineStage, validatePipelineState, PIPELINE_STAGES } from './pipelineValidationService';
import type { PipelineError, ErrorType } from './pipelineValidationService';

const REPAIRABLE_ERROR_TYPES = new Set<string>(['PIPELINE_DRIFT', 'STAGE_REGRESSION']);
const BATCH_LIMIT = 200;

export interface RepairResult {
  orderId: string;
  orderNumber: string;
  oldDepartment: string;
  repairedDepartment: string;
  repairType: 'AUTO';
}

export interface BatchRepairReport {
  repairedCount: number;
  skippedCount: number;
  exceededLimit: boolean;
  results: RepairResult[];
}

async function loadOrderById(orderId: string) {
  const result = await pool.query(
    `SELECT
      id, order_id, current_department, status,
      is_flattop, model_id, features,
      layup_completed_at, plugging_completed_at,
      cnc_completed_at, finish_completed_at,
      gunsmith_completed_at, paint_completed_at,
      qc_completed_at, shipping_completed_at,
      updated_at
    FROM all_orders
    WHERE order_id = $1
    LIMIT 1`,
    [orderId]
  );
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  return rows[0] || null;
}

function classifyError(order: any, derivedStage: string): ErrorType | null {
  const currentDept = order.current_department || '';
  if (currentDept === derivedStage) return null;

  const currentIdx = PIPELINE_STAGES.indexOf(currentDept as any);
  const derivedIdx = PIPELINE_STAGES.indexOf(derivedStage as any);

  if (currentIdx === -1 || derivedIdx === -1) return 'PIPELINE_DRIFT';

  if (currentIdx < derivedIdx) {
    const gap = derivedIdx - currentIdx;
    return gap > 2 ? 'SKIPPED_STAGE' : 'STAGE_REGRESSION';
  }

  const gap = currentIdx - derivedIdx;
  return gap > 2 ? 'SKIPPED_STAGE' : 'PIPELINE_DRIFT';
}

export async function repairPipelineDrift(orderId: string, skipTypeCheck = false): Promise<RepairResult | null> {
  const order = await loadOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const oldDepartment = order.current_department || '';
  const { derivedStage } = derivePipelineStage(order);

  if (oldDepartment === derivedStage) {
    return null;
  }

  if (!skipTypeCheck) {
    const errorType = classifyError(order, derivedStage);
    if (!errorType || !REPAIRABLE_ERROR_TYPES.has(errorType)) {
      throw new Error(
        `Order ${orderId} has error type "${errorType || 'UNKNOWN'}" which requires manual review. ` +
        `Only PIPELINE_DRIFT and STAGE_REGRESSION can be auto-repaired.`
      );
    }
  }

  await auditUpdateOrders({
    db: pool,
    orderIds: [orderId],
    changes: { current_department: derivedStage },
    source: 'PIPELINE_AUTO_REPAIR',
    user: { username: 'PIPELINE_AUTO_REPAIR', role: 'SYSTEM' },
    reason: `Auto-repair: ${oldDepartment} → ${derivedStage}`,
    ip: null,
    userAgent: null,
  });

  return {
    orderId,
    orderNumber: orderId,
    oldDepartment,
    repairedDepartment: derivedStage,
    repairType: 'AUTO',
  };
}

export async function batchRepairPipelineDrift(): Promise<BatchRepairReport> {
  const report = await validatePipelineState();

  const repairableErrors = report.errors.filter(
    (e: PipelineError) => REPAIRABLE_ERROR_TYPES.has(e.errorType)
  );

  const exceededLimit = repairableErrors.length > BATCH_LIMIT;
  const toRepair = repairableErrors.slice(0, BATCH_LIMIT);

  const results: RepairResult[] = [];
  let skippedCount = 0;

  for (const error of toRepair) {
    try {
      const result = await repairPipelineDrift(error.orderId, true);
      if (result) {
        results.push(result);
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`[PipelineRepair] Failed to repair order ${error.orderId}:`, err);
      skippedCount++;
    }
  }

  if (exceededLimit) {
    console.warn(
      `⚠️ Pipeline batch repair: ${repairableErrors.length} orders need repair but limit is ${BATCH_LIMIT}. Only first ${BATCH_LIMIT} were processed.`
    );
  }

  console.log(
    `Pipeline auto-repair executed — ${results.length} orders repaired`
  );

  return {
    repairedCount: results.length,
    skippedCount: skippedCount + (repairableErrors.length - toRepair.length),
    exceededLimit,
    results,
  };
}
