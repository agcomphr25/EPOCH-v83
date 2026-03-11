import { pgPool } from '../db';

const DEPARTMENT_STAGE_PAIRS: { department: string; startCol: string; endCol: string }[] = [
  { department: 'Layup/Plugging', startCol: 'COALESCE(layup_completed_at, plugging_completed_at)', endCol: 'cnc_completed_at' },
  { department: 'CNC', startCol: 'cnc_completed_at', endCol: 'COALESCE(gunsmith_completed_at, finish_completed_at)' },
  { department: 'Gunsmith', startCol: 'gunsmith_completed_at', endCol: 'finish_completed_at' },
  { department: 'Finish', startCol: 'finish_completed_at', endCol: 'qc_completed_at' },
  { department: 'Finish QC', startCol: 'qc_completed_at', endCol: 'paint_completed_at' },
  { department: 'Paint', startCol: 'paint_completed_at', endCol: 'shipping_completed_at' },
];

const MIN_SAMPLE_SIZE = 5;

export async function rebuildModelDepartmentStats(): Promise<{ modelsProcessed: number; rowsWritten: number }> {
  const startTime = Date.now();
  let rowsWritten = 0;
  const modelsProcessed = new Set<string>();

  try {
    const unionParts = DEPARTMENT_STAGE_PAIRS.map(({ department, startCol, endCol }) =>
      `SELECT model_id, '${department}' AS department,
        EXTRACT(EPOCH FROM (${endCol} - ${startCol})) / 60.0 AS duration_minutes
       FROM all_orders
       WHERE ${startCol} IS NOT NULL AND ${endCol} IS NOT NULL
         AND status NOT IN ('CANCELLED', 'SCRAPPED')
         AND ${endCol} > ${startCol}
         AND model_id IS NOT NULL
         AND model_id != ''`
    );

    const query = `
      WITH raw_durations AS (
        ${unionParts.join('\n        UNION ALL\n        ')}
      ),
      aggregated AS (
        SELECT
          model_id,
          department,
          AVG(duration_minutes) AS avg_dur,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_minutes) AS median_dur,
          COUNT(*) AS sample_count
        FROM raw_durations
        WHERE duration_minutes > 0
          AND duration_minutes < 43200
        GROUP BY model_id, department
        HAVING COUNT(*) >= ${MIN_SAMPLE_SIZE}
      )
      SELECT * FROM aggregated
    `;

    const result = await pgPool.query(query);
    const rows = result.rows;

    if (rows.length === 0) {
      console.log('[ModelStatsAggregator] No model-department combinations with sufficient data');
      return { modelsProcessed: 0, rowsWritten: 0 };
    }

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM model_department_stats');

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valueGroups: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const row of batch) {
          modelsProcessed.add(row.model_id);
          valueGroups.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, NOW())`);
          params.push(
            row.model_id,
            row.department,
            Math.round(parseFloat(row.avg_dur) * 10) / 10,
            Math.round(parseFloat(row.median_dur) * 10) / 10,
            parseInt(row.sample_count, 10)
          );
          paramIdx += 5;
        }

        await client.query(
          `INSERT INTO model_department_stats (model_id, department, avg_duration_minutes, median_duration_minutes, sample_size, last_updated)
           VALUES ${valueGroups.join(', ')}`,
          params
        );
        rowsWritten += batch.length;
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ModelStatsAggregator] Rebuilt stats: ${modelsProcessed.size} models, ${rowsWritten} rows in ${elapsed}ms`);
    return { modelsProcessed: modelsProcessed.size, rowsWritten };
  } catch (err) {
    console.error('[ModelStatsAggregator] Failed to rebuild stats:', err);
    return { modelsProcessed: 0, rowsWritten: 0 };
  }
}

let aggregatorInterval: ReturnType<typeof setInterval> | null = null;
const AGGREGATION_INTERVAL = 4 * 60 * 60 * 1000;

export function startModelStatsAggregator(): void {
  setTimeout(() => {
    rebuildModelDepartmentStats().catch(err =>
      console.error('[ModelStatsAggregator] Initial run failed:', err)
    );
  }, 10_000);

  aggregatorInterval = setInterval(() => {
    rebuildModelDepartmentStats().catch(err =>
      console.error('[ModelStatsAggregator] Scheduled run failed:', err)
    );
  }, AGGREGATION_INTERVAL);

  console.log('📊 Model stats aggregator scheduled (every 4 hours)');
}

export function stopModelStatsAggregator(): void {
  if (aggregatorInterval) {
    clearInterval(aggregatorInterval);
    aggregatorInterval = null;
  }
}
