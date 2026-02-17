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

interface ExpectedDepartmentResult {
  orderId: string;
  actualDepartment: string | null;
  expectedDepartment: string;
  expectedStart: string;
  expectedFinish: string;
  status: 'early' | 'on_track' | 'late';
}

interface DashboardForecastItem {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'early' | 'on_track' | 'late';
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

function determineStatus(actualDepartment: string, expectedDepartment: string): 'early' | 'on_track' | 'late' {
  const actualIndex = DEPARTMENT_SEQUENCE.indexOf(actualDepartment);
  const expectedIndex = DEPARTMENT_SEQUENCE.indexOf(expectedDepartment);

  if (actualIndex >= 0 && expectedIndex >= 0) {
    if (actualIndex > expectedIndex) return 'early';
    if (actualIndex < expectedIndex) return 'late';
    return 'on_track';
  }
  return actualDepartment !== expectedDepartment ? 'late' : 'on_track';
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

async function getDepartmentBacklogs(): Promise<Record<string, number>> {
  const result = await pgPool.query(
    `SELECT current_department, COUNT(*) as cnt
     FROM all_orders
     WHERE is_cancelled = false
       AND shipping_completed_at IS NULL
       AND current_department IS NOT NULL
     GROUP BY current_department`
  );
  const backlogs: Record<string, number> = {};
  for (const row of result.rows) {
    backlogs[row.current_department] = parseInt(row.cnt, 10);
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

export async function getExpectedDepartment(orderId: string): Promise<ExpectedDepartmentResult | null> {
  const forecast = await simulateOrderForecast(orderId);
  if (!forecast) return null;

  const orderResult = await pgPool.query(
    'SELECT current_department FROM all_orders WHERE order_id = $1',
    [orderId]
  );
  const actualDepartment = orderResult.rows[0]?.current_department || null;

  const expectedDepartment = findExpectedDepartment(forecast.departmentTimeline);

  const entry = forecast.departmentTimeline.find(e => e.department === expectedDepartment);
  const today = new Date().toISOString().split('T')[0];

  const status = actualDepartment
    ? determineStatus(actualDepartment, expectedDepartment)
    : 'on_track';

  return {
    orderId,
    actualDepartment,
    expectedDepartment,
    expectedStart: entry?.expectedStart || today,
    expectedFinish: entry?.expectedFinish || today,
    status,
  };
}

export async function generateDashboardForecast(): Promise<DashboardForecastItem[]> {
  const activeOrders = await pgPool.query(
    `SELECT order_id, model_id, current_department, order_date
     FROM all_orders
     WHERE is_cancelled = false
       AND shipping_completed_at IS NULL
       AND current_department IS NOT NULL
       AND current_department NOT IN ('Fulfilled', 'Shipped', 'Completed')
     ORDER BY created_at ASC
     LIMIT 500`
  );

  const departmentDefaults = await getDepartmentDefaults();
  const backlogs = await getDepartmentBacklogs();

  const results: DashboardForecastItem[] = [];

  for (const order of activeOrders.rows) {
    const multiplier = await getModelMultiplier(order.model_id);
    const currentDept = order.current_department || 'P1 Production Queue';

    const { timeline, estimatedShipDate } = buildTimeline(
      currentDept, order.order_date, multiplier, departmentDefaults, backlogs
    );

    const expectedDepartment = findExpectedDepartment(timeline);
    const status = determineStatus(currentDept, expectedDepartment);

    results.push({
      orderId: order.order_id,
      model: order.model_id,
      actualDepartment: currentDept,
      expectedDepartment,
      estimatedShipDate,
      status,
    });
  }

  return results;
}
