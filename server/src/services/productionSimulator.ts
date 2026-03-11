import { pool } from '../../db';
import { PIPELINE_STAGES } from './pipelineValidationService';

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

const DEFAULT_CAPACITY: Record<string, { stations: number; efficiency: number }> = {
  'P1 Production Queue': { stations: 10, efficiency: 1.0 },
  'Layup/Plugging': { stations: 4, efficiency: 0.85 },
  'Barcode': { stations: 2, efficiency: 0.95 },
  'CNC': { stations: 2, efficiency: 0.90 },
  'Gunsmith': { stations: 2, efficiency: 0.85 },
  'Finish': { stations: 3, efficiency: 0.85 },
  'Finish QC': { stations: 2, efficiency: 0.95 },
  'Paint': { stations: 2, efficiency: 0.85 },
  'Shipping QC': { stations: 2, efficiency: 0.95 },
  'Shipping': { stations: 2, efficiency: 0.90 },
};

interface SimOrder {
  orderId: string;
  currentDepartment: string;
  pipeline: string[];
  pipelineIndex: number;
  isFlattop: boolean;
  modelId: string | null;
  features: any;
  dueDate: string | null;
}

interface StationState {
  busy: boolean;
  freeAt: number;
  orderId: string | null;
}

interface DepartmentState {
  name: string;
  stations: StationState[];
  efficiency: number;
  queue: SimOrder[];
}

interface SimEvent {
  time: number;
  department: string;
  stationIndex: number;
  orderId: string;
  type: 'completion';
}

export interface DepartmentForecastEntry {
  department: string;
  estimatedArrival: string;
  estimatedCompletion: string;
  queuePosition: number;
  waitDays: number;
  processingDays: number;
}

export interface SimulationOrderResult {
  orderId: string;
  currentDepartment: string;
  projectedCompletion: string;
  remainingDays: number;
  riskStatus: 'ON_TRACK' | 'AT_RISK' | 'LATE';
  dueDate: string | null;
  departmentTimeline: DepartmentForecastEntry[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SimulationSnapshot {
  results: Map<string, SimulationOrderResult>;
  generatedAt: string;
  orderCount: number;
  simulationDurationMs: number;
}

let simulationCache: { snapshot: SimulationSnapshot; cachedAt: number } | null = null;
const SIMULATION_CACHE_TTL = 300_000;

function getSkipRules(order: { isFlattop?: boolean; features?: any; modelId?: string | null }): Set<string> {
  const skips = new Set<string>();
  if (order.isFlattop) {
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
  if (order.modelId && noStockValues.includes(order.modelId.toLowerCase())) {
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

function getEffectivePipeline(order: { isFlattop?: boolean; features?: any; modelId?: string | null }): string[] {
  const skips = getSkipRules(order);
  return (PIPELINE_STAGES as readonly string[]).filter((stage) => !skips.has(stage)) as string[];
}

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

async function loadCapacity(): Promise<Record<string, { stations: number; efficiency: number }>> {
  try {
    const result = await pool.query(
      `SELECT department, stations, avg_parallel_efficiency FROM department_capacity`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const capacity: Record<string, { stations: number; efficiency: number }> = { ...DEFAULT_CAPACITY };
    for (const row of rows) {
      capacity[row.department] = {
        stations: parseInt(row.stations, 10) || 1,
        efficiency: parseFloat(row.avg_parallel_efficiency) || 0.85,
      };
    }
    return capacity;
  } catch (err) {
    console.error('[DES] Failed to load capacity, using defaults:', err);
    return { ...DEFAULT_CAPACITY };
  }
}

async function loadCycleTimes(): Promise<Record<string, number>> {
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
      if (!isNaN(val) && val > 0) times[row.department] = val;
    }
    return times;
  } catch (err) {
    console.error('[DES] Failed to load cycle times, using fallbacks:', err);
    return { ...FALLBACK_CYCLE_DAYS };
  }
}

async function loadActiveOrders(): Promise<SimOrder[]> {
  const result = await pool.query(
    `SELECT
      o.order_id, o.current_department, o.due_date,
      o.is_flattop, o.model_id, o.features, o.urgency
    FROM all_orders o
    WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
      AND o.current_department IS NOT NULL
      AND o.scrap_date IS NULL
      AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
    ORDER BY
      CASE o.urgency
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      o.due_date ASC NULLS LAST`
  );
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);

  return rows.map((row: any) => {
    const order = {
      isFlattop: row.is_flattop || false,
      modelId: row.model_id || null,
      features: row.features || {},
    };
    const pipeline = getEffectivePipeline(order);
    const pipelineIndex = pipeline.indexOf(row.current_department);

    return {
      orderId: row.order_id,
      currentDepartment: row.current_department,
      pipeline,
      pipelineIndex: pipelineIndex >= 0 ? pipelineIndex : 0,
      isFlattop: order.isFlattop,
      modelId: order.modelId,
      features: order.features,
      dueDate: row.due_date,
    };
  });
}

export async function runSimulation(): Promise<SimulationSnapshot> {
  if (simulationCache && Date.now() - simulationCache.cachedAt < SIMULATION_CACHE_TTL) {
    return simulationCache.snapshot;
  }

  const startTime = Date.now();
  const [activeOrders, capacity, cycleTimes] = await Promise.all([
    loadActiveOrders(),
    loadCapacity(),
    loadCycleTimes(),
  ]);

  const deptStates: Record<string, DepartmentState> = {};
  for (const stage of PIPELINE_STAGES) {
    const cap = capacity[stage] || { stations: 1, efficiency: 0.85 };
    deptStates[stage] = {
      name: stage,
      stations: Array.from({ length: cap.stations }, () => ({
        busy: false,
        freeAt: 0,
        orderId: null,
      })),
      efficiency: cap.efficiency,
      queue: [],
    };
  }

  const orderTimelines: Map<string, DepartmentForecastEntry[]> = new Map();
  const orderCompletionTime: Map<string, number> = new Map();
  const orderDeptArrival: Map<string, number> = new Map();

  const originalDepartment: Map<string, string> = new Map();

  for (const order of activeOrders) {
    orderTimelines.set(order.orderId, []);
    originalDepartment.set(order.orderId, order.currentDepartment);
    const dept = deptStates[order.currentDepartment];
    if (dept) {
      dept.queue.push(order);
      orderDeptArrival.set(`${order.orderId}:${order.currentDepartment}`, 0);
    }
  }

  const eventQueue: SimEvent[] = [];

  function insertEvent(event: SimEvent) {
    let lo = 0;
    let hi = eventQueue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (eventQueue[mid].time <= event.time) lo = mid + 1;
      else hi = mid;
    }
    eventQueue.splice(lo, 0, event);
  }

  function tryAssignOrders(dept: DepartmentState, currentTime: number) {
    for (let i = 0; i < dept.stations.length; i++) {
      const station = dept.stations[i];
      if (station.busy && station.freeAt <= currentTime) {
        station.busy = false;
        station.orderId = null;
      }
      if (!station.busy && dept.queue.length > 0) {
        const order = dept.queue.shift()!;
        const baseDays = cycleTimes[dept.name] ?? FALLBACK_CYCLE_DAYS[dept.name] ?? 2;
        const processingDays = baseDays / dept.efficiency;
        const completionTime = currentTime + processingDays;

        station.busy = true;
        station.freeAt = completionTime;
        station.orderId = order.orderId;

        const arrivalTime = orderDeptArrival.get(`${order.orderId}:${dept.name}`) ?? currentTime;
        const waitDays = Math.max(0, currentTime - arrivalTime);
        const queuePos = dept.queue.length + 1;

        const timeline = orderTimelines.get(order.orderId) || [];
        const baseDate = new Date();
        timeline.push({
          department: dept.name,
          estimatedArrival: addBusinessDays(baseDate, Math.max(0, arrivalTime)).toISOString(),
          estimatedCompletion: addBusinessDays(baseDate, Math.max(0, completionTime)).toISOString(),
          queuePosition: queuePos,
          waitDays: Math.round(waitDays * 10) / 10,
          processingDays: Math.round(processingDays * 10) / 10,
        });
        orderTimelines.set(order.orderId, timeline);

        insertEvent({
          time: completionTime,
          department: dept.name,
          stationIndex: i,
          orderId: order.orderId,
          type: 'completion',
        });
      }
    }
  }

  for (const stage of PIPELINE_STAGES) {
    const dept = deptStates[stage];
    tryAssignOrders(dept, 0);
  }

  let iterations = 0;
  const MAX_ITERATIONS = 50000;

  while (eventQueue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const event = eventQueue.shift()!;
    const dept = deptStates[event.department];

    const station = dept.stations[event.stationIndex];
    if (station) {
      station.busy = false;
      station.orderId = null;
    }

    const order = activeOrders.find(o => o.orderId === event.orderId);
    if (order) {
      const nextIdx = order.pipeline.indexOf(event.department) + 1;
      if (nextIdx < order.pipeline.length) {
        const nextDeptName = order.pipeline[nextIdx];
        const nextDept = deptStates[nextDeptName];
        if (nextDept) {
          order.currentDepartment = nextDeptName;
          order.pipelineIndex = nextIdx;
          orderDeptArrival.set(`${order.orderId}:${nextDeptName}`, event.time);
          nextDept.queue.push(order);
          tryAssignOrders(nextDept, event.time);
        }
      } else {
        orderCompletionTime.set(order.orderId, event.time);
      }
    }

    tryAssignOrders(dept, event.time);
  }

  const results = new Map<string, SimulationOrderResult>();

  for (const order of activeOrders) {
    const completionDays = orderCompletionTime.get(order.orderId);
    const timeline = orderTimelines.get(order.orderId) || [];

    let projectedCompletion: Date;
    let remainingDays: number;

    if (completionDays !== undefined) {
      projectedCompletion = addBusinessDays(new Date(), Math.ceil(completionDays));
      remainingDays = Math.round(completionDays * 10) / 10;
    } else {
      const lastEntry = timeline[timeline.length - 1];
      if (lastEntry) {
        projectedCompletion = new Date(lastEntry.estimatedCompletion);
        remainingDays = Math.round(
          (projectedCompletion.getTime() - Date.now()) / (1000 * 60 * 60 * 24) * 10
        ) / 10;
      } else {
        const remaining = order.pipeline.slice(order.pipelineIndex);
        remainingDays = remaining.reduce(
          (sum, s) => sum + (cycleTimes[s] ?? FALLBACK_CYCLE_DAYS[s] ?? 2),
          0
        );
        projectedCompletion = addBusinessDays(new Date(), Math.ceil(remainingDays));
      }
    }

    let riskStatus: 'ON_TRACK' | 'AT_RISK' | 'LATE' = 'ON_TRACK';
    if (order.dueDate) {
      const due = new Date(order.dueDate);
      if (!isNaN(due.getTime())) {
        const diffDays = (due.getTime() - projectedCompletion.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0) riskStatus = 'LATE';
        else if (diffDays < 3) riskStatus = 'AT_RISK';
      }
    }

    const totalOrders = activeOrders.length;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
    if (totalOrders > 300) confidence = 'LOW';
    else if (totalOrders > 150) confidence = 'MEDIUM';

    results.set(order.orderId, {
      orderId: order.orderId,
      currentDepartment: originalDepartment.get(order.orderId) || order.currentDepartment,
      projectedCompletion: projectedCompletion.toISOString(),
      remainingDays: Math.max(0, remainingDays),
      riskStatus,
      dueDate: order.dueDate,
      departmentTimeline: timeline,
      confidence,
    });
  }

  const snapshot: SimulationSnapshot = {
    results,
    generatedAt: new Date().toISOString(),
    orderCount: activeOrders.length,
    simulationDurationMs: Date.now() - startTime,
  };

  simulationCache = { snapshot, cachedAt: Date.now() };
  return snapshot;
}

export async function simulateFactoryCompletion(orderId: string): Promise<SimulationOrderResult | null> {
  const snapshot = await runSimulation();
  return snapshot.results.get(orderId) || null;
}

export async function simulateNewOrderDES(params: {
  model_id?: string | null;
  is_flattop?: boolean;
  features?: any;
}): Promise<{
  projectedCompletion: string;
  suggestedDueDate: string;
  estimatedCycleDays: number;
  backlogDelayDays: number;
  totalBusinessDays: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  pipelineStages: string[];
  departmentTimeline: DepartmentForecastEntry[];
}> {
  const order = {
    isFlattop: params.is_flattop || false,
    modelId: params.model_id || null,
    features: params.features || {},
  };
  const pipeline = getEffectivePipeline(order);
  const [capacity, cycleTimes] = await Promise.all([loadCapacity(), loadCycleTimes()]);

  const snapshot = await runSimulation();

  let cumulativeTime = 0;
  let totalCycleDays = 0;
  let totalWaitDays = 0;
  const timeline: DepartmentForecastEntry[] = [];
  const baseDate = new Date();

  for (const stage of pipeline) {
    const cap = capacity[stage] || { stations: 1, efficiency: 0.85 };
    const baseDays = cycleTimes[stage] ?? FALLBACK_CYCLE_DAYS[stage] ?? 2;
    const processingDays = baseDays / cap.efficiency;

    let queueLength = 0;
    for (const [, result] of snapshot.results) {
      if (result.departmentTimeline.some(t => t.department === stage)) {
        queueLength++;
      }
    }

    const waitDays = Math.max(0, (queueLength / cap.stations) * processingDays * 0.3);
    const arrivalTime = cumulativeTime;
    const startTime = arrivalTime + waitDays;
    const completionTime = startTime + processingDays;

    timeline.push({
      department: stage,
      estimatedArrival: addBusinessDays(baseDate, Math.ceil(arrivalTime)).toISOString(),
      estimatedCompletion: addBusinessDays(baseDate, Math.ceil(completionTime)).toISOString(),
      queuePosition: queueLength + 1,
      waitDays: Math.round(waitDays * 10) / 10,
      processingDays: Math.round(processingDays * 10) / 10,
    });

    totalCycleDays += processingDays;
    totalWaitDays += waitDays;
    cumulativeTime = completionTime;
  }

  const totalBusinessDays = Math.ceil(cumulativeTime);
  const projectedCompletion = addBusinessDays(baseDate, totalBusinessDays);
  const bufferDays = 5;
  const suggestedDueDate = addBusinessDays(baseDate, totalBusinessDays + bufferDays);

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  if (snapshot.orderCount > 300) confidence = 'LOW';
  else if (snapshot.orderCount > 150) confidence = 'MEDIUM';

  return {
    projectedCompletion: projectedCompletion.toISOString(),
    suggestedDueDate: suggestedDueDate.toISOString(),
    estimatedCycleDays: Math.round(totalCycleDays * 10) / 10,
    backlogDelayDays: Math.round(totalWaitDays * 10) / 10,
    totalBusinessDays,
    confidence,
    pipelineStages: pipeline,
    departmentTimeline: timeline,
  };
}

export function invalidateSimulationCache() {
  simulationCache = null;
}
