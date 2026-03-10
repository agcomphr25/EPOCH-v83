import { pool } from '../../db';

export const PIPELINE_STAGES = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ErrorType = 'PIPELINE_DRIFT' | 'STAGE_REGRESSION' | 'SKIPPED_STAGE' | 'STALLED_ORDER';

export interface PipelineError {
  orderId: string;
  orderNumber: string;
  derivedStage: string;
  derivedStageIndex: number;
  currentDepartment: string;
  currentDepartmentIndex: number;
  errorType: ErrorType;
}

export interface ValidationReport {
  totalOrdersChecked: number;
  generatedAt: string;
  errors: PipelineError[];
  summary: {
    pipelineDrift: number;
    stageRegression: number;
    skippedStages: number;
    stalledOrders: number;
  };
}

interface OrderRow {
  id: number;
  order_id: string;
  current_department: string | null;
  status: string | null;
  is_flattop: boolean;
  model_id: string | null;
  features: any;
  layup_completed_at: string | null;
  plugging_completed_at: string | null;
  cnc_completed_at: string | null;
  finish_completed_at: string | null;
  gunsmith_completed_at: string | null;
  paint_completed_at: string | null;
  qc_completed_at: string | null;
  shipping_completed_at: string | null;
  updated_at: string | null;
}

function getSkipRules(order: OrderRow): Set<string> {
  const skips = new Set<string>();

  if (order.is_flattop) {
    skips.add('CNC');
    skips.add('Gunsmith');
  }

  let features: any = {};
  try {
    if (typeof order.features === 'string') {
      features = JSON.parse(order.features);
    } else if (order.features) {
      features = order.features;
    }
  } catch (_) {}

  const railAccessory = features?.rail_accessory;
  const hasNoRail = Array.isArray(railAccessory)
    ? railAccessory.includes('no_rail')
    : typeof railAccessory === 'string' && railAccessory.includes('no_rail');

  if (hasNoRail) {
    skips.add('Gunsmith');
  }

  const noStockValues = ['no_stock', 'no stock', 'none'];
  if (order.model_id && noStockValues.includes(order.model_id.toLowerCase())) {
    skips.add('Layup/Plugging');
    skips.add('Barcode');
    skips.add('CNC');
    skips.add('Gunsmith');
    skips.add('Finish');
    skips.add('Finish QC');
    skips.add('Paint');
  }

  return skips;
}

function getEffectivePipeline(order: OrderRow): string[] {
  const skips = getSkipRules(order);
  return PIPELINE_STAGES.filter((stage) => !skips.has(stage));
}

export function derivePipelineStage(order: OrderRow): { derivedStage: string; stageIndex: number } {
  const effectivePipeline = getEffectivePipeline(order);

  const directTimestamps: Record<string, string | null> = {
    'Layup/Plugging': order.layup_completed_at || order.plugging_completed_at,
    'CNC': order.cnc_completed_at,
    'Gunsmith': order.gunsmith_completed_at,
    'Finish': order.finish_completed_at,
    'Finish QC': order.qc_completed_at,
    'Paint': order.paint_completed_at,
    'Shipping': order.shipping_completed_at,
  };

  function isStageComplete(stage: string): boolean {
    if (stage === 'P1 Production Queue') {
      return !!(order.layup_completed_at || order.plugging_completed_at ||
                order.cnc_completed_at || order.finish_completed_at ||
                order.gunsmith_completed_at || order.paint_completed_at ||
                order.qc_completed_at || order.shipping_completed_at);
    }

    if (stage === 'Barcode') {
      const nextStages = ['CNC', 'Gunsmith', 'Finish', 'Finish QC', 'Paint', 'Shipping QC', 'Shipping'];
      for (const ns of nextStages) {
        if (effectivePipeline.includes(ns) && directTimestamps[ns]) return true;
      }
      return false;
    }

    if (stage === 'Shipping QC') {
      return !!order.shipping_completed_at;
    }

    return !!directTimestamps[stage];
  }

  if (order.shipping_completed_at) {
    return { derivedStage: 'Shipping', stageIndex: PIPELINE_STAGES.indexOf('Shipping') };
  }

  for (const stage of effectivePipeline) {
    if (!isStageComplete(stage)) {
      return { derivedStage: stage, stageIndex: PIPELINE_STAGES.indexOf(stage) };
    }
  }

  return {
    derivedStage: effectivePipeline[effectivePipeline.length - 1],
    stageIndex: PIPELINE_STAGES.indexOf(effectivePipeline[effectivePipeline.length - 1]),
  };
}

export async function validatePipelineState(): Promise<ValidationReport> {
  const EXCLUDED_STATUSES = ['SCRAPPED', 'CANCELLED', 'FULFILLED'];

  const queryResult = await pool.query(
    `SELECT
      id, order_id, current_department, status,
      is_flattop, model_id, features,
      layup_completed_at, plugging_completed_at,
      cnc_completed_at, finish_completed_at,
      gunsmith_completed_at, paint_completed_at,
      qc_completed_at, shipping_completed_at,
      updated_at
    FROM all_orders
    WHERE status IS NOT NULL
      AND status NOT IN ($1, $2, $3)
      AND current_department IS NOT NULL
    ORDER BY id`,
    EXCLUDED_STATUSES
  );

  const orders: OrderRow[] = Array.isArray(queryResult) ? queryResult : (queryResult?.rows ?? []);
  const errors: PipelineError[] = [];

  for (const order of orders) {
    const { derivedStage, stageIndex: derivedIndex } = derivePipelineStage(order);
    const currentDept = order.current_department || '';
    const currentIndex = PIPELINE_STAGES.indexOf(currentDept as PipelineStage);

    if (currentIndex === -1) continue;

    if (currentDept === derivedStage) continue;

    const effectivePipeline = getEffectivePipeline(order);
    const effectiveDerivedIdx = effectivePipeline.indexOf(derivedStage);
    const effectiveCurrentIdx = effectivePipeline.indexOf(currentDept);

    if (effectiveCurrentIdx === -1) continue;

    if (effectiveCurrentIdx < effectiveDerivedIdx) {
      errors.push({
        orderId: order.order_id,
        orderNumber: order.order_id,
        derivedStage,
        derivedStageIndex: derivedIndex,
        currentDepartment: currentDept,
        currentDepartmentIndex: currentIndex,
        errorType: 'STAGE_REGRESSION',
      });
    } else if (effectiveCurrentIdx > effectiveDerivedIdx) {
      const gap = effectiveCurrentIdx - effectiveDerivedIdx;
      if (gap > 1) {
        errors.push({
          orderId: order.order_id,
          orderNumber: order.order_id,
          derivedStage,
          derivedStageIndex: derivedIndex,
          currentDepartment: currentDept,
          currentDepartmentIndex: currentIndex,
          errorType: 'SKIPPED_STAGE',
        });
      } else {
        errors.push({
          orderId: order.order_id,
          orderNumber: order.order_id,
          derivedStage,
          derivedStageIndex: derivedIndex,
          currentDepartment: currentDept,
          currentDepartmentIndex: currentIndex,
          errorType: 'PIPELINE_DRIFT',
        });
      }
    } else {
      errors.push({
        orderId: order.order_id,
        orderNumber: order.order_id,
        derivedStage,
        derivedStageIndex: derivedIndex,
        currentDepartment: currentDept,
        currentDepartmentIndex: currentIndex,
        errorType: 'PIPELINE_DRIFT',
      });
    }
  }

  const summary = {
    pipelineDrift: errors.filter((e) => e.errorType === 'PIPELINE_DRIFT').length,
    stageRegression: errors.filter((e) => e.errorType === 'STAGE_REGRESSION').length,
    skippedStages: errors.filter((e) => e.errorType === 'SKIPPED_STAGE').length,
    stalledOrders: 0,
  };

  return {
    totalOrdersChecked: orders.length,
    generatedAt: new Date().toISOString(),
    errors,
    summary,
  };
}
