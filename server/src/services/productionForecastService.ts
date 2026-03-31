import { pool } from '../../db';
import { PIPELINE_STAGES } from './pipelineValidationService';
import type { PipelineStage } from './pipelineValidationService';
import { runSimulation, simulateFactoryCompletion, simulateNewOrderDES } from './productionSimulator';
import type { SimulationOrderResult, DepartmentForecastEntry } from './productionSimulator';
import { normalizeToTuesday } from '@shared/utils/dateNormalization';

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = Math.ceil(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return result;
}

const FALLBACK_CYCLE_DAYS: Record<string, number> = {
  'P1 Production Queue': 3,
  'Layup/Plugging': 4,
  'Barcode': 1,
  'CNC': 2,
  'Gunsmith': 2,
  'Finish': 5,
  'Finish QC': 1,
  'Paint': 2,
  'Shipping QC': 1,
  'Shipping': 1,
};

function getSkipRules(order: { is_flattop?: boolean; features?: any; model_id?: string | null }): Set<string> {
  const skips = new Set<string>();

  if (order.is_flattop) {
    skips.add('CNC');
    skips.add('Gunsmith');
  }

  let features: any = {};
  try {
    if (typeof order.features === 'string') features = JSON.parse(order.features);
    else if (order.features) features = order.features;
  } catch (_) {}

  const railAccessory = features?.rail_accessory;
  const hasNoRail = Array.isArray(railAccessory)
    ? railAccessory.includes('no_rail')
    : typeof railAccessory === 'string' && railAccessory.includes('no_rail');
  if (hasNoRail) skips.add('Gunsmith');

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

function getEffectivePipeline(order: { is_flattop?: boolean; features?: any; model_id?: string | null }): string[] {
  const skips = getSkipRules(order);
  return PIPELINE_STAGES.filter((stage) => !skips.has(stage)) as unknown as string[];
}

export type RiskStatus = 'ON_TRACK' | 'AT_RISK' | 'LATE';

export interface OrderForecast {
  orderId: string;
  orderNumber: string;
  customerName: string;
  currentDepartment: string;
  dueDate: string | null;
  projectedCompletion: string;
  remainingDays: number;
  riskStatus: RiskStatus;
  remainingStages: string[];
  departmentTimeline?: DepartmentForecastEntry[];
  simulationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ForecastSummary {
  totalForecasted: number;
  onTrack: number;
  atRisk: number;
  late: number;
  orders: OrderForecast[];
  generatedAt: string;
}

let cycleTimeCache: { data: Record<string, number>; cachedAt: number } | null = null;
const CYCLE_CACHE_TTL = 900_000;

async function loadCycleTimes(): Promise<Record<string, number>> {
  if (cycleTimeCache && Date.now() - cycleTimeCache.cachedAt < CYCLE_CACHE_TTL) {
    return cycleTimeCache.data;
  }

  try {
    const result = await pool.query(
      `SELECT department, ROUND(AVG(days)::numeric, 1) AS avg_days FROM (
        SELECT 'Layup/Plugging' AS department,
          EXTRACT(EPOCH FROM (cnc_completed_at - COALESCE(layup_completed_at, plugging_completed_at))) / 86400.0 AS days
        FROM all_orders
        WHERE COALESCE(layup_completed_at, plugging_completed_at) IS NOT NULL AND cnc_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND cnc_completed_at > COALESCE(layup_completed_at, plugging_completed_at)

        UNION ALL SELECT 'CNC',
          EXTRACT(EPOCH FROM (COALESCE(gunsmith_completed_at, finish_completed_at) - cnc_completed_at)) / 86400.0
        FROM all_orders
        WHERE cnc_completed_at IS NOT NULL AND COALESCE(gunsmith_completed_at, finish_completed_at) IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND COALESCE(gunsmith_completed_at, finish_completed_at) > cnc_completed_at

        UNION ALL SELECT 'Gunsmith',
          EXTRACT(EPOCH FROM (finish_completed_at - gunsmith_completed_at)) / 86400.0
        FROM all_orders
        WHERE gunsmith_completed_at IS NOT NULL AND finish_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND finish_completed_at > gunsmith_completed_at

        UNION ALL SELECT 'Finish',
          EXTRACT(EPOCH FROM (qc_completed_at - finish_completed_at)) / 86400.0
        FROM all_orders
        WHERE finish_completed_at IS NOT NULL AND qc_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND qc_completed_at > finish_completed_at

        UNION ALL SELECT 'Finish QC',
          EXTRACT(EPOCH FROM (paint_completed_at - qc_completed_at)) / 86400.0
        FROM all_orders
        WHERE qc_completed_at IS NOT NULL AND paint_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND paint_completed_at > qc_completed_at

        UNION ALL SELECT 'Paint',
          EXTRACT(EPOCH FROM (shipping_completed_at - paint_completed_at)) / 86400.0
        FROM all_orders
        WHERE paint_completed_at IS NOT NULL AND shipping_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')
          AND shipping_completed_at > paint_completed_at
      ) AS stage_durations GROUP BY department`
    );

    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const times: Record<string, number> = { ...FALLBACK_CYCLE_DAYS };
    for (const row of rows) {
      const val = parseFloat(row.avg_days);
      if (!isNaN(val) && val > 0) {
        times[row.department] = val;
      }
    }

    cycleTimeCache = { data: times, cachedAt: Date.now() };
    return times;
  } catch (err) {
    console.error('[ProductionForecast] Failed to load cycle times, using fallbacks:', err);
    return { ...FALLBACK_CYCLE_DAYS };
  }
}

let modelCycleTimeCache: { data: Record<string, Record<string, number>>; cachedAt: number } | null = null;
const MODEL_CYCLE_CACHE_TTL = 900_000;

async function loadModelCycleTimes(): Promise<Record<string, Record<string, number>>> {
  if (modelCycleTimeCache && Date.now() - modelCycleTimeCache.cachedAt < MODEL_CYCLE_CACHE_TTL) {
    return modelCycleTimeCache.data;
  }

  try {
    const result = await pool.query(
      `SELECT model_id, department, avg_duration_minutes, sample_size
       FROM model_department_stats
       WHERE sample_size >= 5`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const modelTimes: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!modelTimes[row.model_id]) modelTimes[row.model_id] = {};
      const avgDays = parseFloat(row.avg_duration_minutes) / (60 * 24);
      if (!isNaN(avgDays) && avgDays > 0) {
        modelTimes[row.model_id][row.department] = Math.round(avgDays * 10) / 10;
      }
    }
    modelCycleTimeCache = { data: modelTimes, cachedAt: Date.now() };
    return modelTimes;
  } catch (err) {
    return {};
  }
}

async function getCycleTimesForModel(modelId: string | null): Promise<{ times: Record<string, number>; modelSpecific: boolean; modelDepartments: string[] }> {
  const baseTimes = await loadCycleTimes();
  if (!modelId) return { times: baseTimes, modelSpecific: false, modelDepartments: [] };

  const allModelTimes = await loadModelCycleTimes();
  const modelTimes = allModelTimes[modelId];
  if (!modelTimes || Object.keys(modelTimes).length === 0) {
    return { times: baseTimes, modelSpecific: false, modelDepartments: [] };
  }

  const merged = { ...baseTimes };
  const modelDepartments: string[] = [];
  for (const [dept, days] of Object.entries(modelTimes)) {
    merged[dept] = days;
    modelDepartments.push(dept);
  }
  return { times: merged, modelSpecific: true, modelDepartments };
}

let queueWeightCache: { data: Record<string, number>; cachedAt: number } | null = null;
const QUEUE_WEIGHT_CACHE_TTL = 900_000;

async function loadQueueWeights(): Promise<Record<string, number>> {
  if (queueWeightCache && Date.now() - queueWeightCache.cachedAt < QUEUE_WEIGHT_CACHE_TTL) {
    return queueWeightCache.data;
  }

  try {
    const result = await pool.query('SELECT model_id, queue_weight FROM model_queue_weights');
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const weights: Record<string, number> = {};
    for (const row of rows) {
      weights[row.model_id] = parseFloat(row.queue_weight) || 1.0;
    }
    queueWeightCache = { data: weights, cachedAt: Date.now() };
    return weights;
  } catch (err) {
    return {};
  }
}

function getRemainingStages(
  currentDepartment: string,
  order: { is_flattop?: boolean; features?: any; model_id?: string | null }
): string[] {
  const effective = getEffectivePipeline(order);
  const idx = effective.indexOf(currentDepartment);
  if (idx === -1) return [];
  return effective.slice(idx);
}

function classifyRisk(projectedCompletion: Date, dueDate: string | null): RiskStatus {
  if (!dueDate) return 'ON_TRACK';

  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return 'ON_TRACK';

  const diffMs = due.getTime() - projectedCompletion.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'LATE';
  if (diffDays < 3) return 'AT_RISK';
  return 'ON_TRACK';
}

export async function forecastOrder(
  orderId: string
): Promise<OrderForecast | null> {
  const result = await pool.query(
    `SELECT
      o.order_id, o.current_department, o.due_date, o.status,
      o.is_flattop, o.model_id, o.features,
      COALESCE(c.name, 'Unknown') AS customer_name
    FROM all_orders o
    LEFT JOIN customers c ON c.id::text = o.customer_id
    WHERE o.order_id = $1
    LIMIT 1`,
    [orderId]
  );
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  const order = rows[0];
  if (!order || !order.current_department) return null;

  const terminalStatuses = ['FULFILLED', 'CANCELLED', 'SCRAPPED'];
  if (order.status && terminalStatuses.includes(order.status)) return null;

  const { times: cycleTimes } = await getCycleTimesForModel(order.model_id);
  const remaining = getRemainingStages(order.current_department, order);
  if (remaining.length === 0) return null;

  try {
    const simResult = await simulateFactoryCompletion(orderId);
    if (simResult) {
      return {
        orderId: order.order_id,
        orderNumber: order.order_id,
        customerName: order.customer_name,
        currentDepartment: order.current_department,
        dueDate: order.due_date,
        projectedCompletion: simResult.projectedCompletion,
        remainingDays: simResult.remainingDays,
        riskStatus: simResult.riskStatus,
        remainingStages: remaining,
        departmentTimeline: simResult.departmentTimeline,
        simulationConfidence: simResult.confidence,
      };
    }
  } catch (simErr) {
    console.warn('[ProductionForecast] DES simulation failed, falling back:', simErr);
  }

  const remainingDays = remaining.reduce(
    (sum, stage) => sum + (cycleTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2),
    0
  );

  const projectedCompletion = new Date(Date.now() + remainingDays * 86400_000);
  const riskStatus = classifyRisk(projectedCompletion, order.due_date);

  return {
    orderId: order.order_id,
    orderNumber: order.order_id,
    customerName: order.customer_name,
    currentDepartment: order.current_department,
    dueDate: order.due_date,
    projectedCompletion: projectedCompletion.toISOString(),
    remainingDays: Math.round(remainingDays * 10) / 10,
    riskStatus,
    remainingStages: remaining,
  };
}

let backlogCache: { data: Record<string, number>; cachedAt: number } | null = null;
const BACKLOG_CACHE_TTL = 900_000;

async function loadBacklogs(): Promise<Record<string, number>> {
  if (backlogCache && Date.now() - backlogCache.cachedAt < BACKLOG_CACHE_TTL) {
    return backlogCache.data;
  }

  try {
    const result = await pool.query(
      `SELECT o.current_department,
              SUM(COALESCE(w.queue_weight, 1.0))::numeric AS weighted_count
       FROM all_orders o
       LEFT JOIN model_queue_weights w ON o.model_id = w.model_id
       WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
         AND o.current_department IS NOT NULL
       GROUP BY o.current_department`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const backlogs: Record<string, number> = {};
    for (const row of rows) {
      backlogs[row.current_department] = parseFloat(row.weighted_count) || 0;
    }
    backlogCache = { data: backlogs, cachedAt: Date.now() };
    return backlogs;
  } catch (err) {
    console.error('[ProductionForecast] Failed to load backlogs:', err);
    return {};
  }
}

export type SimulationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface NewOrderSimulation {
  projectedCompletion: string;
  suggestedDueDate: string;
  estimatedCycleDays: number;
  backlogDelayDays: number;
  totalBusinessDays: number;
  confidence: SimulationConfidence;
  pipelineStages: string[];
  stageDurations: { stage: string; days: number }[];
  isAdjustable: boolean;
  modelSpecific: boolean;
  modelReasons: string[];
}

export async function simulateNewOrder(params: {
  model_id?: string | null;
  is_flattop?: boolean;
  features?: any;
}): Promise<NewOrderSimulation> {
  const order = {
    is_flattop: params.is_flattop || false,
    features: params.features || {},
    model_id: params.model_id || null,
  };

  const pipeline = getEffectivePipeline(order);
  const { times: cycleTimes, modelSpecific, modelDepartments } = await getCycleTimesForModel(order.model_id);
  const baseTimes = await loadCycleTimes();
  const backlogs = await loadBacklogs();

  let totalCycleDays = 0;
  let totalBacklogDelay = 0;
  const stageDurations: { stage: string; days: number }[] = [];
  const modelReasons: string[] = [];

  for (const stage of pipeline) {
    const avgDays = cycleTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2;
    totalCycleDays += avgDays;

    const weightedAhead = backlogs[stage] ?? 0;
    const backlogFactor = Math.min(weightedAhead / 50, 2.0);
    const backlogDelay = avgDays * backlogFactor;
    totalBacklogDelay += backlogDelay;

    stageDurations.push({ stage, days: Math.round((avgDays + backlogDelay) * 10) / 10 });

    if (modelSpecific && modelDepartments.includes(stage)) {
      const baseAvg = baseTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2;
      const diff = avgDays - baseAvg;
      if (Math.abs(diff) >= 0.5) {
        const direction = diff > 0 ? 'longer' : 'shorter';
        modelReasons.push(`${stage}: ${avgDays.toFixed(1)} days avg (${Math.abs(diff).toFixed(1)} days ${direction} than overall avg)`);
      }
    }

    if (weightedAhead > 0) {
      const roundedAhead = Math.round(weightedAhead * 10) / 10;
      modelReasons.push(`${stage}: ${roundedAhead} weighted orders ahead in queue`);
    }
  }

  const isAdjustable = !!(params.model_id && params.model_id.toLowerCase().includes('adj'));
  const adjustableExtraDays = (!modelSpecific && isAdjustable) ? 10 : 0;
  if (adjustableExtraDays > 0) {
    modelReasons.push('Adjustable model: +2 weeks added (no model-specific history available)');
  }

  const estimatedCycleDays = totalCycleDays + totalBacklogDelay + adjustableExtraDays;
  const totalBusinessDays = Math.ceil(estimatedCycleDays);
  const projectedCompletion = addBusinessDays(new Date(), totalBusinessDays);

  const bufferDays = 5;
  const suggestedDueDate = normalizeToTuesday(addBusinessDays(new Date(), totalBusinessDays + bufferDays));

  let confidence: SimulationConfidence = 'HIGH';
  const totalBacklog = Object.values(backlogs).reduce((s, v) => s + v, 0);
  if (totalBacklog > 300) confidence = 'LOW';
  else if (totalBacklog > 150) confidence = 'MEDIUM';
  if (modelSpecific) {
    if (confidence === 'MEDIUM') confidence = 'HIGH';
  }

  return {
    projectedCompletion: projectedCompletion.toISOString(),
    suggestedDueDate: suggestedDueDate.toISOString(),
    estimatedCycleDays: Math.round(estimatedCycleDays * 10) / 10,
    backlogDelayDays: Math.round(totalBacklogDelay * 10) / 10,
    totalBusinessDays,
    confidence,
    pipelineStages: pipeline,
    stageDurations,
    isAdjustable,
    modelSpecific,
    modelReasons,
  };
}

export async function forecastActiveOrders(): Promise<ForecastSummary & { simulationDurationMs?: number }> {
  try {
    const snapshot = await runSimulation();

    const nameResult = await pool.query(
      `SELECT o.order_id, COALESCE(c.name, 'Unknown') AS customer_name, o.due_date,
              o.current_department, o.is_flattop, o.model_id, o.features
       FROM all_orders o
       LEFT JOIN customers c ON c.id::text = o.customer_id
       WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
         AND o.current_department IS NOT NULL
         AND o.scrap_date IS NULL
         AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
       ORDER BY o.due_date ASC NULLS LAST
       LIMIT 500`
    );
    const rows = Array.isArray(nameResult) ? nameResult : (nameResult?.rows ?? []);
    const nameMap = new Map<string, { customerName: string; dueDate: string | null; currentDepartment: string; is_flattop: boolean; model_id: string | null; features: any }>();
    for (const row of rows) {
      nameMap.set(row.order_id, {
        customerName: row.customer_name,
        dueDate: row.due_date,
        currentDepartment: row.current_department,
        is_flattop: row.is_flattop,
        model_id: row.model_id,
        features: row.features,
      });
    }

    const orders: OrderForecast[] = [];
    let onTrack = 0;
    let atRisk = 0;
    let late = 0;

    for (const [orderId, simResult] of snapshot.results) {
      const info = nameMap.get(orderId);
      if (!info) continue;

      const remaining = getRemainingStages(info.currentDepartment, {
        is_flattop: info.is_flattop,
        model_id: info.model_id,
        features: info.features,
      });

      if (simResult.riskStatus === 'ON_TRACK') onTrack++;
      else if (simResult.riskStatus === 'AT_RISK') atRisk++;
      else late++;

      orders.push({
        orderId,
        orderNumber: orderId,
        customerName: info.customerName,
        currentDepartment: simResult.currentDepartment,
        dueDate: simResult.dueDate,
        projectedCompletion: simResult.projectedCompletion,
        remainingDays: simResult.remainingDays,
        riskStatus: simResult.riskStatus,
        remainingStages: remaining,
        departmentTimeline: simResult.departmentTimeline,
        simulationConfidence: simResult.confidence,
      });
    }

    try {
      const { stampForecastOnOrders } = await import('./forecastAccuracyService');
      stampForecastOnOrders().catch(() => {});
    } catch {}

    return {
      totalForecasted: orders.length,
      onTrack,
      atRisk,
      late,
      orders,
      generatedAt: snapshot.generatedAt,
      simulationDurationMs: snapshot.simulationDurationMs,
    };
  } catch (err) {
    console.warn('[ProductionForecast] DES simulation failed for active orders, using legacy:', err);
    return forecastActiveOrdersLegacy();
  }
}

async function forecastActiveOrdersLegacy(): Promise<ForecastSummary> {
  const result = await pool.query(
    `SELECT
      o.order_id, o.current_department, o.due_date,
      o.is_flattop, o.model_id, o.features,
      COALESCE(c.name, 'Unknown') AS customer_name
    FROM all_orders o
    LEFT JOIN customers c ON c.id::text = o.customer_id
    WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
      AND o.current_department IS NOT NULL
      AND o.scrap_date IS NULL
      AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
    ORDER BY o.due_date ASC NULLS LAST
    LIMIT 500`
  );

  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  const baseTimes = await loadCycleTimes();
  const allModelTimes = await loadModelCycleTimes();

  const orders: OrderForecast[] = [];
  let onTrack = 0;
  let atRisk = 0;
  let late = 0;

  for (const row of rows) {
    const remaining = getRemainingStages(row.current_department, row);
    if (remaining.length === 0) continue;

    const modelTimes = row.model_id ? allModelTimes[row.model_id] : null;
    const cycleTimes = modelTimes ? { ...baseTimes, ...modelTimes } : baseTimes;

    const remainingDays = remaining.reduce(
      (sum, stage) => sum + (cycleTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2),
      0
    );

    const projectedCompletion = new Date(Date.now() + remainingDays * 86400_000);
    const riskStatus = classifyRisk(projectedCompletion, row.due_date);

    if (riskStatus === 'ON_TRACK') onTrack++;
    else if (riskStatus === 'AT_RISK') atRisk++;
    else late++;

    orders.push({
      orderId: row.order_id,
      orderNumber: row.order_id,
      customerName: row.customer_name,
      currentDepartment: row.current_department,
      dueDate: row.due_date,
      projectedCompletion: projectedCompletion.toISOString(),
      remainingDays: Math.round(remainingDays * 10) / 10,
      riskStatus,
      remainingStages: remaining,
    });
  }

  return {
    totalForecasted: orders.length,
    onTrack,
    atRisk,
    late,
    orders,
    generatedAt: new Date().toISOString(),
  };
}
