import { pgPool } from '../db';

const DEPARTMENT_SEQUENCE = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Shipping QC',
  'Shipping',
];

interface DepartmentTimeline {
  department: string;
  expectedStart: string;
  expectedFinish: string;
}

interface OrderForecast {
  orderId: string;
  model: string | null;
  estimatedShipDate: string;
  departmentTimeline: DepartmentTimeline[];
}

interface BackwardForecast {
  orderId: string;
  model: string | null;
  estimatedShipDate: string;
  departmentTimeline: DepartmentTimeline[];
  simulationType: 'backward' | 'forward_fallback';
}

interface ExpectedDepartmentResult {
  orderId: string;
  actualDepartment: string | null;
  expectedDepartment: string;
  expectedStart: string;
  expectedFinish: string;
  status: 'on_track' | 'off_track';
}

interface DashboardForecastItem {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'on_track' | 'off_track';
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return result;
}

function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return result;
}

function getStartDate(orderDate: Date | string | null): Date {
  const now = new Date();
  if (!orderDate) return now;
  const d = new Date(orderDate);
  return d < now ? now : d;
}

function buildTimeline(
  currentDepartment: string,
  orderDate: Date | string | null,
  multiplier: number,
  departmentDefaults: Record<string, number>,
  backlogs: Record<string, number>,
): { timeline: DepartmentTimeline[]; estimatedShipDate: string } {
  const currentDeptIndex = DEPARTMENT_SEQUENCE.indexOf(currentDepartment);
  const startIndex = currentDeptIndex >= 0 ? currentDeptIndex : 0;

  let startDate = getStartDate(orderDate);
  const timeline: DepartmentTimeline[] = [];

  for (let i = startIndex; i < DEPARTMENT_SEQUENCE.length; i++) {
    const dept = DEPARTMENT_SEQUENCE[i];
    const avgDays = departmentDefaults[dept] ?? 2;
    const backlogCount = backlogs[dept] ?? 0;

    const backlogDelayDays = Math.ceil(backlogCount * avgDays);
    const processingDays = Math.ceil(avgDays * multiplier);

    const deptStart = addBusinessDays(startDate, backlogDelayDays);
    const deptFinish = addBusinessDays(deptStart, processingDays);

    timeline.push({
      department: dept,
      expectedStart: deptStart.toISOString().split('T')[0],
      expectedFinish: deptFinish.toISOString().split('T')[0],
    });

    startDate = deptFinish;
  }

  const estimatedShipDate = timeline.length > 0
    ? timeline[timeline.length - 1].expectedFinish
    : new Date().toISOString().split('T')[0];

  return { timeline, estimatedShipDate };
}

function buildBackwardTimeline(
  dueDate: Date,
  multiplier: number,
  departmentDefaults: Record<string, number>,
): DepartmentTimeline[] {
  let endDate = new Date(dueDate);
  const reversedTimeline: DepartmentTimeline[] = [];

  for (let i = DEPARTMENT_SEQUENCE.length - 1; i >= 0; i--) {
    const dept = DEPARTMENT_SEQUENCE[i];
    const avgDays = departmentDefaults[dept] ?? 1;
    const durationDays = Math.max(1, Math.ceil(avgDays * multiplier));

    const deptFinish = new Date(endDate);
    const deptStart = subtractBusinessDays(deptFinish, durationDays);

    reversedTimeline.push({
      department: dept,
      expectedStart: deptStart.toISOString().split('T')[0],
      expectedFinish: deptFinish.toISOString().split('T')[0],
    });

    endDate = deptStart;
  }

  return reversedTimeline.reverse();
}

function findExpectedDepartment(timeline: DepartmentTimeline[]): string {
  const today = new Date().toISOString().split('T')[0];
  if (timeline.length === 0) return 'P1 Production Queue';

  for (const entry of timeline) {
    if (today >= entry.expectedStart && today <= entry.expectedFinish) {
      return entry.department;
    }
    if (today < entry.expectedStart) {
      return entry.department;
    }
  }
  return timeline[timeline.length - 1].department;
}

function determineTimeBasedStatus(
  expectedStart: string,
  expectedFinish: string,
): 'on_track' | 'off_track' {
  const today = new Date().toISOString().split('T')[0];
  if (today >= expectedStart && today <= expectedFinish) return 'on_track';
  return 'off_track';
}

async function getDepartmentDefaults(): Promise<Record<string, number>> {
  const rows = await pgPool.query('SELECT department_name, avg_days FROM department_forecast_defaults');
  const defaults: Record<string, number> = {};
  for (const row of rows.rows) {
    defaults[row.department_name] = row.avg_days;
  }
  return defaults;
}

async function getModelMultiplier(modelId: string | null): Promise<number> {
  if (!modelId) return 1.0;
  const result = await pgPool.query(
    'SELECT multiplier FROM model_forecast_multiplier WHERE model_id = $1',
    [modelId]
  );
  if (result.rows.length > 0 && result.rows[0].multiplier != null) {
    return result.rows[0].multiplier;
  }
  return 1.0;
}

const POST_PRODUCTION_DEPARTMENTS = [
  'Shipping Management', 'Shipping Manager', 'Fulfilled', 'Shipped', 'Completed',
  'Sales', 'Awaiting Customer Signature',
];

async function getDepartmentBacklogs(): Promise<Record<string, number>> {
  const result = await pgPool.query(
    `SELECT current_department, COUNT(*) as cnt
     FROM all_orders
     WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
       AND current_department IS NOT NULL
     GROUP BY current_department`
  );
  const backlogs: Record<string, number> = {};
  for (const row of result.rows) {
    if (!POST_PRODUCTION_DEPARTMENTS.includes(row.current_department)) {
      backlogs[row.current_department] = parseInt(row.cnt, 10);
    }
  }
  return backlogs;
}

export async function simulateOrderForecast(orderId: string): Promise<OrderForecast | null> {
  const orderResult = await pgPool.query(
    `SELECT order_id, model_id, current_department, order_date
     FROM all_orders
     WHERE order_id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];
  const departmentDefaults = await getDepartmentDefaults();
  const multiplier = await getModelMultiplier(order.model_id);
  const backlogs = await getDepartmentBacklogs();

  const currentDept = order.current_department || 'P1 Production Queue';
  const { timeline, estimatedShipDate } = buildTimeline(
    currentDept, order.order_date, multiplier, departmentDefaults, backlogs
  );

  return {
    orderId: order.order_id,
    model: order.model_id,
    estimatedShipDate,
    departmentTimeline: timeline,
  };
}

export async function simulateBackwardFromDueDate(order: {
  order_id: string;
  model_id: string | null;
  current_department: string | null;
  order_date: string | null;
  due_date: string | null;
}): Promise<BackwardForecast | null> {
  if (!order.due_date) {
    const departmentDefaults = await getDepartmentDefaults();
    const multiplier = await getModelMultiplier(order.model_id);
    const backlogs = await getDepartmentBacklogs();
    const currentDept = order.current_department || 'P1 Production Queue';
    const { timeline, estimatedShipDate } = buildTimeline(
      currentDept, order.order_date, multiplier, departmentDefaults, backlogs
    );
    return {
      orderId: order.order_id,
      model: order.model_id,
      estimatedShipDate,
      departmentTimeline: timeline,
      simulationType: 'forward_fallback',
    };
  }

  const departmentDefaults = await getDepartmentDefaults();
  const multiplier = await getModelMultiplier(order.model_id);
  const dueDate = new Date(order.due_date);

  const timeline = buildBackwardTimeline(dueDate, multiplier, departmentDefaults);

  if (process.env.NODE_ENV === 'development' && !_backwardDebugLogged) {
    _backwardDebugLogged = true;
    console.log('[Backward Sim Debug]', {
      orderId: order.order_id,
      due_date: order.due_date,
      departmentTimeline: timeline,
    });
  }

  return {
    orderId: order.order_id,
    model: order.model_id,
    estimatedShipDate: dueDate.toISOString().split('T')[0],
    departmentTimeline: timeline,
    simulationType: 'backward',
  };
}

let _backwardDebugLogged = false;

export async function getExpectedDepartment(orderId: string): Promise<ExpectedDepartmentResult | null> {
  const orderResult = await pgPool.query(
    `SELECT order_id, model_id, current_department, order_date, due_date
     FROM all_orders
     WHERE order_id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) return null;
  const order = orderResult.rows[0];

  const forecast = await simulateBackwardFromDueDate(order);
  if (!forecast) return null;

  const actualDepartment = order.current_department || null;
  const expectedDepartment = findExpectedDepartment(forecast.departmentTimeline);
  const entry = forecast.departmentTimeline.find(e => e.department === expectedDepartment);
  const today = new Date().toISOString().split('T')[0];

  const expStart = entry?.expectedStart || today;
  const expFinish = entry?.expectedFinish || today;
  const status = determineTimeBasedStatus(expStart, expFinish);

  return {
    orderId,
    actualDepartment,
    expectedDepartment,
    expectedStart: expStart,
    expectedFinish: expFinish,
    status,
  };
}

export interface WeeklyForecastItem {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'on_track' | 'off_track';
  departmentTimeline: DepartmentTimeline[];
}

export async function generateWeeklyForecast(weekStart: Date, weekEnd: Date): Promise<WeeklyForecastItem[]> {
  const activeOrders = await pgPool.query(
    `SELECT order_id, model_id, current_department, order_date, due_date
     FROM all_orders
     WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
       AND current_department IS NOT NULL
       AND current_department NOT IN ('Shipping Management', 'Shipping Manager', 'Fulfilled', 'Shipped', 'Completed', 'Sales', 'Awaiting Customer Signature')
     ORDER BY created_at ASC`
  );

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const results: WeeklyForecastItem[] = [];

  for (const order of activeOrders.rows) {
    const forecast = await simulateBackwardFromDueDate(order);
    if (!forecast) continue;

    const timeline = forecast.departmentTimeline;

    const overlaps = timeline.some(entry => {
      return (
        (entry.expectedStart >= weekStartStr && entry.expectedStart <= weekEndStr) ||
        (entry.expectedFinish >= weekStartStr && entry.expectedFinish <= weekEndStr) ||
        (entry.expectedStart <= weekStartStr && entry.expectedFinish >= weekEndStr)
      );
    });

    if (overlaps) {
      const currentDept = order.current_department || 'P1 Production Queue';
      const expectedDepartment = findExpectedDepartment(timeline);
      const entry = timeline.find(e => e.department === expectedDepartment);
      const today = new Date().toISOString().split('T')[0];
      const status = determineTimeBasedStatus(
        entry?.expectedStart || today,
        entry?.expectedFinish || today,
      );

      results.push({
        orderId: order.order_id,
        model: order.model_id,
        actualDepartment: currentDept,
        expectedDepartment,
        estimatedShipDate: forecast.estimatedShipDate,
        status,
        departmentTimeline: timeline,
      });
    }
  }

  return results;
}

export async function generateDashboardForecast(): Promise<DashboardForecastItem[]> {
  const activeOrders = await pgPool.query(
    `SELECT order_id, model_id, current_department, order_date, due_date
     FROM all_orders
     WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
       AND current_department IS NOT NULL
       AND current_department NOT IN ('Shipping Management', 'Shipping Manager', 'Fulfilled', 'Shipped', 'Completed', 'Sales', 'Awaiting Customer Signature')
     ORDER BY created_at ASC
     LIMIT 500`
  );

  const results: DashboardForecastItem[] = [];

  for (const order of activeOrders.rows) {
    const forecast = await simulateBackwardFromDueDate(order);
    if (!forecast) continue;

    const currentDept = order.current_department || 'P1 Production Queue';
    const expectedDepartment = findExpectedDepartment(forecast.departmentTimeline);
    const entry = forecast.departmentTimeline.find(e => e.department === expectedDepartment);
    const today = new Date().toISOString().split('T')[0];
    const status = determineTimeBasedStatus(
      entry?.expectedStart || today,
      entry?.expectedFinish || today,
    );

    results.push({
      orderId: order.order_id,
      model: order.model_id,
      actualDepartment: currentDept,
      expectedDepartment,
      estimatedShipDate: forecast.estimatedShipDate,
      status,
    });
  }

  return results;
}
