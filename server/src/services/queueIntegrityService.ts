import { pool } from '../../db';
import { DEPARTMENTS } from '../constants/departments';

interface HistoryEntry {
  time: string;
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
}

interface IntegrityStatus {
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  affectedDepartments: string[];
  lastCheckTime: string | null;
  history: HistoryEntry[];
}

const HISTORY_LIMIT = 20;
const checkHistory: HistoryEntry[] = [];

let currentStatus: IntegrityStatus = {
  healthy: true,
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  affectedDepartments: [],
  lastCheckTime: null,
  history: [],
};

export function getQueueIntegrityStatus(): IntegrityStatus {
  return { ...currentStatus, history: [...checkHistory] };
}

async function safeQ(sql: string, params: any[] = []): Promise<any[]> {
  try {
    const rows = (await pool.query(sql, params)) as any[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function runIntegrityCheck(): Promise<void> {
  try {
    const [deptResults, orphanRow, invalidRow] = await Promise.all([
      Promise.all(
        DEPARTMENTS.map(async (dept) => {
          const [expectedRows, actualAllOrders, actualProdOrders] = await Promise.all([
            safeQ(
              `SELECT order_id FROM all_orders
               WHERE current_department = $1
                 AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
                 AND scrap_date IS NULL
                 AND (is_cancelled IS NULL OR is_cancelled = false)`,
              [dept]
            ),
            safeQ(
              `SELECT order_id FROM all_orders
               WHERE current_department = $1
                 AND status NOT IN ('SCRAPPED','CANCELLED')
                 AND scrap_date IS NULL`,
              [dept]
            ),
            safeQ(
              `SELECT order_id FROM production_orders WHERE current_department = $1`,
              [dept]
            ),
          ]);

          const expectedSet = new Set<string>([
            ...expectedRows.map((r: any) => String(r.order_id)),
            ...actualProdOrders.map((r: any) => String(r.order_id)),
          ]);
          const actualSet = new Set<string>([
            ...actualAllOrders.map((r: any) => String(r.order_id)),
            ...actualProdOrders.map((r: any) => String(r.order_id)),
          ]);

          const missingCount = [...expectedSet].filter((id) => !actualSet.has(id)).length;
          const unexpectedCount = [...actualSet].filter((id) => !expectedSet.has(id)).length;

          let severity: 'CRITICAL' | 'WARNING' | 'OK' = 'OK';
          if (missingCount > 0) severity = 'CRITICAL';
          else if (unexpectedCount > 0) severity = 'WARNING';

          return { department: dept, severity };
        })
      ),

      safeQ(
        `SELECT COUNT(*) AS count FROM all_orders
         WHERE current_department IS NULL
           AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
           AND scrap_date IS NULL
           AND (is_cancelled IS NULL OR is_cancelled = false)`
      ),

      safeQ(
        `SELECT COUNT(*) AS count FROM all_orders
         WHERE current_department IS NOT NULL
           AND current_department NOT IN (${DEPARTMENTS.map((_, i) => `$${i + 1}`).join(',')})
           AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
           AND scrap_date IS NULL
           AND (is_cancelled IS NULL OR is_cancelled = false)`,
        [...DEPARTMENTS]
      ),
    ]);

    const orphanedCount = parseInt(orphanRow[0]?.count ?? '0', 10);
    const invalidCount = parseInt(invalidRow[0]?.count ?? '0', 10);

    const criticalDepts = deptResults.filter((d) => d.severity === 'CRITICAL').map((d) => d.department);
    const warningDepts = deptResults.filter((d) => d.severity === 'WARNING').map((d) => d.department);

    const criticalCount = criticalDepts.length + (orphanedCount > 0 ? 1 : 0);
    const warningCount = warningDepts.length;
    const infoCount = invalidCount > 0 ? 1 : 0;

    const now = new Date().toISOString();

    currentStatus = {
      healthy: criticalCount === 0,
      criticalCount,
      warningCount,
      infoCount,
      affectedDepartments: [...criticalDepts, ...warningDepts],
      lastCheckTime: now,
      history: checkHistory,
    };

    // Prepend to rolling history (newest first), capped at HISTORY_LIMIT
    checkHistory.unshift({ time: now, healthy: criticalCount === 0, criticalCount, warningCount });
    if (checkHistory.length > HISTORY_LIMIT) checkHistory.length = HISTORY_LIMIT;
  } catch (error) {
    console.error('[QueueIntegrityService] Background check failed:', error);
  }
}

export function startQueueIntegrityService(): void {
  runIntegrityCheck().catch(() => {});
  setInterval(() => runIntegrityCheck().catch(() => {}), 5 * 60 * 1000);
  console.log('🔍 Queue integrity background check started (every 5 minutes)');
}
