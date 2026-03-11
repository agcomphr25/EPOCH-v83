import { pool } from '../../db';
import { PIPELINE_STAGES } from './pipelineValidationService';
import type { PipelineStage } from './pipelineValidationService';

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
const CYCLE_CACHE_TTL = 300_000;

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

  const cycleTimes = await loadCycleTimes();
  const remaining = getRemainingStages(order.current_department, order);
  if (remaining.length === 0) return null;

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
const BACKLOG_CACHE_TTL = 300_000;

async function loadBacklogs(): Promise<Record<string, number>> {
  if (backlogCache && Date.now() - backlogCache.cachedAt < BACKLOG_CACHE_TTL) {
    return backlogCache.data;
  }

  try {
    const result = await pool.query(
      `SELECT current_department, COUNT(*)::int AS cnt
       FROM all_orders
       WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
         AND current_department IS NOT NULL
       GROUP BY current_department`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const backlogs: Record<string, number> = {};
    for (const row of rows) {
      backlogs[row.current_department] = parseInt(row.cnt, 10) || 0;
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
  const cycleTimes = await loadCycleTimes();
  const backlogs = await loadBacklogs();

  let totalCycleDays = 0;
  let totalBacklogDelay = 0;
  const stageDurations: { stage: string; days: number }[] = [];

  for (const stage of pipeline) {
    const avgDays = cycleTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2;
    totalCycleDays += avgDays;

    const ordersAhead = backlogs[stage] ?? 0;
    const backlogFactor = Math.min(ordersAhead / 50, 2.0);
    const backlogDelay = avgDays * backlogFactor;
    totalBacklogDelay += backlogDelay;

    stageDurations.push({ stage, days: Math.round((avgDays + backlogDelay) * 10) / 10 });
  }

  const isAdjustable = !!(params.model_id && params.model_id.toLowerCase().includes('adj'));
  const adjustableExtraDays = isAdjustable ? 10 : 0;

  const estimatedCycleDays = totalCycleDays + totalBacklogDelay + adjustableExtraDays;
  const totalBusinessDays = Math.ceil(estimatedCycleDays);
  const projectedCompletion = addBusinessDays(new Date(), totalBusinessDays);

  const bufferDays = 5;
  const suggestedDueDate = addBusinessDays(new Date(), totalBusinessDays + bufferDays);

  let confidence: SimulationConfidence = 'HIGH';
  const totalBacklog = Object.values(backlogs).reduce((s, v) => s + v, 0);
  if (totalBacklog > 300) confidence = 'LOW';
  else if (totalBacklog > 150) confidence = 'MEDIUM';

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
  };
}

export async function forecastActiveOrders(): Promise<ForecastSummary> {
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
  const cycleTimes = await loadCycleTimes();

  const orders: OrderForecast[] = [];
  let onTrack = 0;
  let atRisk = 0;
  let late = 0;

  for (const row of rows) {
    const remaining = getRemainingStages(row.current_department, row);
    if (remaining.length === 0) continue;

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
