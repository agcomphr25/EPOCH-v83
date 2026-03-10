import { pool } from '../../db';
import {
  getOpenInventoryShortages,
  getP2PendingBOMs,
  METRIC_FUNCTIONS,
} from './metricsService';

export interface RibbonSignal {
  id: string;
  label: string;
  value: number;
  severity: 'info' | 'warning' | 'critical';
  domain: 'company' | 'p1' | 'p2';
  route: string;
  icon?: string;
}

const DEPARTMENT_THRESHOLDS: Record<string, number> = {
  'P1 Production Queue': 7,
  'Layup/Plugging': 7,
  'Barcode': 3,
  'CNC': 5,
  'Gunsmith': 5,
  'Finish': 7,
  'Finish QC': 3,
  'Paint': 5,
  'Shipping QC': 3,
  'Shipping': 2,
};

async function getStuckOrdersCount(): Promise<number> {
  try {
    const thresholdCases = Object.entries(DEPARTMENT_THRESHOLDS)
      .map(([dept, days], i) => `WHEN current_department = $${i + 1} THEN ${days}`)
      .join(' ');
    const deptParams = Object.keys(DEPARTMENT_THRESHOLDS);

    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM all_orders o
       WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
         AND o.current_department IS NOT NULL
         AND o.scrap_date IS NULL
         AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
         AND EXTRACT(EPOCH FROM NOW() - o.updated_at) / 86400.0 > CASE ${thresholdCases} ELSE 7 END`,
      deptParams,
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error('Control Tower: stuck orders count error:', error);
    return 0;
  }
}

async function getQuotesAwaitingResponse(): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM quotes WHERE status = 'SENT'`,
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error('Control Tower: quotes awaiting count error:', error);
    return 0;
  }
}

async function safeMetric(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    console.error('Control Tower: metric fetch failed:', error);
    return 0;
  }
}

export async function getControlTowerSignals(): Promise<RibbonSignal[]> {
  const [stuckOrders, inventoryShortages, arOverdue, quotesAwaiting, p2PendingBoms] =
    await Promise.all([
      safeMetric(getStuckOrdersCount),
      safeMetric(getOpenInventoryShortages),
      safeMetric(METRIC_FUNCTIONS.ar_overdue_count),
      safeMetric(getQuotesAwaitingResponse),
      safeMetric(getP2PendingBOMs),
    ]);

  const signals: RibbonSignal[] = [];

  if (stuckOrders > 0) {
    signals.push({
      id: 'stuckOrders',
      label: 'Orders Behind Schedule',
      value: stuckOrders,
      severity: stuckOrders >= 10 ? 'critical' : 'warning',
      domain: 'company',
      route: '/production-control-center',
      icon: 'AlertTriangle',
    });
  }

  if (inventoryShortages > 0) {
    signals.push({
      id: 'inventoryShortages',
      label: 'Inventory Shortages',
      value: inventoryShortages,
      severity: inventoryShortages >= 20 ? 'critical' : 'warning',
      domain: 'company',
      route: '/inventory',
      icon: 'Package',
    });
  }

  if (arOverdue > 0) {
    signals.push({
      id: 'arOverdue',
      label: 'AR Overdue',
      value: arOverdue,
      severity: arOverdue >= 10 ? 'critical' : 'warning',
      domain: 'company',
      route: '/finance/ar-aging',
      icon: 'DollarSign',
    });
  }

  if (quotesAwaiting > 0) {
    signals.push({
      id: 'quotesAwaiting',
      label: 'Quotes Awaiting Response',
      value: quotesAwaiting,
      severity: 'info',
      domain: 'p2',
      route: '/projects',
      icon: 'FileText',
    });
  }

  if (p2PendingBoms > 0) {
    signals.push({
      id: 'p2PendingBoms',
      label: 'P2 Pending BOMs',
      value: p2PendingBoms,
      severity: p2PendingBoms >= 5 ? 'warning' : 'info',
      domain: 'p2',
      route: '/robust-bom',
      icon: 'ClipboardList',
    });
  }

  return signals;
}
