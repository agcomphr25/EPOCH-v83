import { pool } from '../../db';
import { invalidateSimulationCache } from './productionSimulator';

export interface ModelDepartmentStat {
  modelId: string;
  department: string;
  avgDurationMinutes: number;
  medianDurationMinutes: number;
  p90DurationMinutes: number;
  sampleCount: number;
  stdDevMinutes: number;
  avgDays: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  lastRebuilt: string;
}

export interface DriftAnomaly {
  modelId: string;
  department: string;
  previousAvgMinutes: number;
  newAvgMinutes: number;
  driftPercent: number;
  direction: 'FASTER' | 'SLOWER';
  detectedAt: string;
}

export interface RebuildReport {
  statsUpdated: number;
  statsInserted: number;
  anomaliesDetected: DriftAnomaly[];
  modelsProcessed: number;
  departmentsProcessed: number;
  dataSource: 'transitions' | 'timestamps' | 'both';
  durationMs: number;
}

const CONFIDENCE_THRESHOLD = 5;
const DRIFT_THRESHOLD_PERCENT = 20;
const MINUTES_PER_DAY = 1440;

async function hasTransitionData(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS cnt FROM order_department_transitions
       WHERE exit_reason = 'completed' AND duration_minutes IS NOT NULL AND duration_minutes > 0
       LIMIT 1`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return parseInt(rows[0]?.cnt, 10) > 0;
  } catch {
    return false;
  }
}

async function aggregateFromTransitions(): Promise<Map<string, ModelDepartmentStat>> {
  const result = await pool.query(`
    SELECT
      ao.model_id,
      odt.department,
      ROUND(AVG(odt.duration_minutes)::numeric, 1) AS avg_min,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY odt.duration_minutes)::numeric, 1) AS median_min,
      ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY odt.duration_minutes)::numeric, 1) AS p90_min,
      ROUND(STDDEV_POP(odt.duration_minutes)::numeric, 1) AS std_dev,
      COUNT(*)::int AS sample_count
    FROM order_department_transitions odt
    JOIN all_orders ao ON ao.order_id = odt.entity_id
    WHERE odt.entity_type = 'p1_order'
      AND odt.exit_reason = 'completed'
      AND odt.duration_minutes IS NOT NULL
      AND odt.duration_minutes > 0
      AND ao.model_id IS NOT NULL
      AND ao.status NOT IN ('CANCELLED', 'SCRAPPED')
    GROUP BY ao.model_id, odt.department
  `);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  return rowsToStats(rows);
}

async function aggregateFromTimestamps(): Promise<Map<string, ModelDepartmentStat>> {
  const result = await pool.query(`
    WITH stage_durations AS (
      SELECT model_id, 'Layup/Plugging' AS department,
        EXTRACT(EPOCH FROM (cnc_completed_at - COALESCE(layup_completed_at, plugging_completed_at))) / 60.0 AS duration_min
      FROM all_orders
      WHERE COALESCE(layup_completed_at, plugging_completed_at) IS NOT NULL
        AND cnc_completed_at IS NOT NULL
        AND cnc_completed_at > COALESCE(layup_completed_at, plugging_completed_at)
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
      UNION ALL
      SELECT model_id, 'CNC',
        EXTRACT(EPOCH FROM (COALESCE(gunsmith_completed_at, finish_completed_at) - cnc_completed_at)) / 60.0
      FROM all_orders
      WHERE cnc_completed_at IS NOT NULL
        AND COALESCE(gunsmith_completed_at, finish_completed_at) IS NOT NULL
        AND COALESCE(gunsmith_completed_at, finish_completed_at) > cnc_completed_at
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
      UNION ALL
      SELECT model_id, 'Gunsmith',
        EXTRACT(EPOCH FROM (finish_completed_at - gunsmith_completed_at)) / 60.0
      FROM all_orders
      WHERE gunsmith_completed_at IS NOT NULL AND finish_completed_at IS NOT NULL
        AND finish_completed_at > gunsmith_completed_at
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
      UNION ALL
      SELECT model_id, 'Finish',
        EXTRACT(EPOCH FROM (qc_completed_at - finish_completed_at)) / 60.0
      FROM all_orders
      WHERE finish_completed_at IS NOT NULL AND qc_completed_at IS NOT NULL
        AND qc_completed_at > finish_completed_at
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
      UNION ALL
      SELECT model_id, 'Finish QC',
        EXTRACT(EPOCH FROM (paint_completed_at - qc_completed_at)) / 60.0
      FROM all_orders
      WHERE qc_completed_at IS NOT NULL AND paint_completed_at IS NOT NULL
        AND paint_completed_at > qc_completed_at
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
      UNION ALL
      SELECT model_id, 'Paint',
        EXTRACT(EPOCH FROM (shipping_completed_at - paint_completed_at)) / 60.0
      FROM all_orders
      WHERE paint_completed_at IS NOT NULL AND shipping_completed_at IS NOT NULL
        AND shipping_completed_at > paint_completed_at
        AND model_id IS NOT NULL AND status NOT IN ('CANCELLED', 'SCRAPPED')
    )
    SELECT
      model_id,
      department,
      ROUND(AVG(duration_min)::numeric, 1) AS avg_min,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_min)::numeric, 1) AS median_min,
      ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY duration_min)::numeric, 1) AS p90_min,
      ROUND(STDDEV_POP(duration_min)::numeric, 1) AS std_dev,
      COUNT(*)::int AS sample_count
    FROM stage_durations
    WHERE duration_min > 0
    GROUP BY model_id, department
  `);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  return rowsToStats(rows);
}

function rowsToStats(rows: any[]): Map<string, ModelDepartmentStat> {
  const stats = new Map<string, ModelDepartmentStat>();
  for (const row of rows) {
    const avgMin = parseFloat(row.avg_min) || 0;
    const sampleCount = parseInt(row.sample_count, 10) || 0;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (sampleCount >= 20) confidence = 'HIGH';
    else if (sampleCount >= CONFIDENCE_THRESHOLD) confidence = 'MEDIUM';

    const key = `${row.model_id}:${row.department}`;
    stats.set(key, {
      modelId: row.model_id,
      department: row.department,
      avgDurationMinutes: avgMin,
      medianDurationMinutes: parseFloat(row.median_min) || avgMin,
      p90DurationMinutes: parseFloat(row.p90_min) || avgMin,
      sampleCount,
      stdDevMinutes: parseFloat(row.std_dev) || 0,
      avgDays: Math.round((avgMin / MINUTES_PER_DAY) * 100) / 100,
      confidence,
      lastRebuilt: new Date().toISOString(),
    });
  }
  return stats;
}

async function loadPreviousStats(): Promise<Map<string, { avgDurationMinutes: number }>> {
  try {
    const result = await pool.query(
      `SELECT model_id, department, avg_duration_minutes FROM model_department_stats`
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const prev = new Map<string, { avgDurationMinutes: number }>();
    for (const row of rows) {
      prev.set(`${row.model_id}:${row.department}`, {
        avgDurationMinutes: parseFloat(row.avg_duration_minutes) || 0,
      });
    }
    return prev;
  } catch {
    return new Map();
  }
}

function detectDrift(
  previousStats: Map<string, { avgDurationMinutes: number }>,
  newStats: Map<string, ModelDepartmentStat>
): DriftAnomaly[] {
  const anomalies: DriftAnomaly[] = [];
  for (const [key, newStat] of newStats) {
    if (newStat.sampleCount < CONFIDENCE_THRESHOLD) continue;
    const prev = previousStats.get(key);
    if (!prev || prev.avgDurationMinutes <= 0) continue;

    const pctChange = ((newStat.avgDurationMinutes - prev.avgDurationMinutes) / prev.avgDurationMinutes) * 100;
    if (Math.abs(pctChange) >= DRIFT_THRESHOLD_PERCENT) {
      anomalies.push({
        modelId: newStat.modelId,
        department: newStat.department,
        previousAvgMinutes: prev.avgDurationMinutes,
        newAvgMinutes: newStat.avgDurationMinutes,
        driftPercent: Math.round(pctChange * 10) / 10,
        direction: pctChange > 0 ? 'SLOWER' : 'FASTER',
        detectedAt: new Date().toISOString(),
      });
    }
  }
  return anomalies;
}

export async function rebuildModelDepartmentStats(): Promise<RebuildReport> {
  const startTime = Date.now();
  console.log('[CycleTimeLearning] Starting model department stats rebuild...');

  const previousStats = await loadPreviousStats();

  const useTransitions = await hasTransitionData();
  let newStats: Map<string, ModelDepartmentStat>;
  let dataSource: 'transitions' | 'timestamps' | 'both';

  if (useTransitions) {
    const transitionStats = await aggregateFromTransitions();
    const timestampStats = await aggregateFromTimestamps();
    newStats = new Map([...transitionStats, ...timestampStats]);
    dataSource = transitionStats.size > 0 && timestampStats.size > 0 ? 'both' : (timestampStats.size > 0 ? 'timestamps' : 'transitions');
  } else {
    newStats = await aggregateFromTimestamps();
    dataSource = 'timestamps';
  }

  const anomalies = detectDrift(previousStats, newStats);
  if (anomalies.length > 0) {
    console.warn(`[CycleTimeLearning] ⚠️ ${anomalies.length} drift anomalies detected:`);
    for (const a of anomalies) {
      console.warn(
        `  ${a.modelId}/${a.department}: ${a.previousAvgMinutes}min → ${a.newAvgMinutes}min (${a.direction} ${Math.abs(a.driftPercent)}%)`
      );
    }
    await logAnomalies(anomalies);
  }

  let inserted = 0;
  let updated = 0;
  const models = new Set<string>();
  const departments = new Set<string>();

  for (const [, stat] of newStats) {
    models.add(stat.modelId);
    departments.add(stat.department);

    const existed = previousStats.has(`${stat.modelId}:${stat.department}`);
    await pool.query(
      `INSERT INTO model_department_stats
        (model_id, department, avg_duration_minutes, median_duration_minutes, p90_duration_minutes,
         sample_count, std_dev_minutes, avg_days, confidence, last_rebuilt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (model_id, department) DO UPDATE SET
         avg_duration_minutes = $3, median_duration_minutes = $4, p90_duration_minutes = $5,
         sample_count = $6, std_dev_minutes = $7, avg_days = $8, confidence = $9, last_rebuilt = NOW()`,
      [
        stat.modelId, stat.department, stat.avgDurationMinutes, stat.medianDurationMinutes,
        stat.p90DurationMinutes, stat.sampleCount, stat.stdDevMinutes, stat.avgDays, stat.confidence,
      ]
    );
    if (existed) updated++;
    else inserted++;
  }

  invalidateSimulationCache();

  const report: RebuildReport = {
    statsUpdated: updated,
    statsInserted: inserted,
    anomaliesDetected: anomalies,
    modelsProcessed: models.size,
    departmentsProcessed: departments.size,
    dataSource,
    durationMs: Date.now() - startTime,
  };

  console.log(
    `[CycleTimeLearning] ✅ Rebuild complete: ${inserted} inserted, ${updated} updated, ` +
    `${anomalies.length} anomalies, ${models.size} models, ${departments.size} departments, ` +
    `source=${dataSource}, ${report.durationMs}ms`
  );

  return report;
}

async function logAnomalies(anomalies: DriftAnomaly[]): Promise<void> {
  for (const a of anomalies) {
    try {
      await pool.query(
        `INSERT INTO cycle_time_drift_log
          (model_id, department, previous_avg_minutes, new_avg_minutes, drift_percent, direction, detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [a.modelId, a.department, a.previousAvgMinutes, a.newAvgMinutes, a.driftPercent, a.direction]
      );
    } catch (err) {
      console.error('[CycleTimeLearning] Failed to log anomaly:', err);
    }
  }
}

export async function getModelCycleTimes(): Promise<Record<string, Record<string, number>>> {
  try {
    const result = await pool.query(
      `SELECT model_id, department, avg_days, sample_count FROM model_department_stats
       WHERE sample_count >= $1`,
      [CONFIDENCE_THRESHOLD]
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    const byModel: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!byModel[row.model_id]) byModel[row.model_id] = {};
      byModel[row.model_id][row.department] = parseFloat(row.avg_days) || 0;
    }
    return byModel;
  } catch {
    return {};
  }
}

export async function getDriftLog(limit = 50): Promise<DriftAnomaly[]> {
  try {
    const result = await pool.query(
      `SELECT model_id, department, previous_avg_minutes, new_avg_minutes, drift_percent, direction, detected_at
       FROM cycle_time_drift_log ORDER BY detected_at DESC LIMIT $1`,
      [limit]
    );
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return rows.map((r: any) => ({
      modelId: r.model_id,
      department: r.department,
      previousAvgMinutes: parseFloat(r.previous_avg_minutes),
      newAvgMinutes: parseFloat(r.new_avg_minutes),
      driftPercent: parseFloat(r.drift_percent),
      direction: r.direction,
      detectedAt: r.detected_at,
    }));
  } catch {
    return [];
  }
}

export async function getStatsOverview(): Promise<{
  totalStats: number;
  modelCount: number;
  departmentCount: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  lastRebuilt: string | null;
  recentAnomalies: number;
}> {
  try {
    const [statsResult, anomalyResult] = await Promise.all([
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT model_id)::int AS models,
        COUNT(DISTINCT department)::int AS depts,
        COUNT(*) FILTER (WHERE confidence = 'HIGH')::int AS high,
        COUNT(*) FILTER (WHERE confidence = 'MEDIUM')::int AS medium,
        COUNT(*) FILTER (WHERE confidence = 'LOW')::int AS low,
        MAX(last_rebuilt) AS last_rebuilt
      FROM model_department_stats`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM cycle_time_drift_log WHERE detected_at > NOW() - INTERVAL '7 days'`),
    ]);
    const sRows = Array.isArray(statsResult) ? statsResult : (statsResult?.rows ?? []);
    const aRows = Array.isArray(anomalyResult) ? anomalyResult : (anomalyResult?.rows ?? []);
    const s = sRows[0] || {};
    return {
      totalStats: s.total || 0,
      modelCount: s.models || 0,
      departmentCount: s.depts || 0,
      highConfidence: s.high || 0,
      mediumConfidence: s.medium || 0,
      lowConfidence: s.low || 0,
      lastRebuilt: s.last_rebuilt || null,
      recentAnomalies: aRows[0]?.cnt || 0,
    };
  } catch {
    return {
      totalStats: 0, modelCount: 0, departmentCount: 0,
      highConfidence: 0, mediumConfidence: 0, lowConfidence: 0,
      lastRebuilt: null, recentAnomalies: 0,
    };
  }
}
