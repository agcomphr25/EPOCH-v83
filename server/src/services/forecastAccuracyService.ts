import { pool } from '../../db';
import { auditUpdateOrders } from './orderAuditWrapper';
import { normalizeToTuesday } from '@shared/utils/dateNormalization';

export interface ForecastAccuracyMetrics {
  totalCompleted: number;
  totalWithForecasts: number;
  avgErrorDays: number;
  medianErrorDays: number;
  avgAbsErrorDays: number;
  withinOneDayPct: number;
  withinThreeDaysPct: number;
  withinFiveDaysPct: number;
  overestimatedPct: number;
  underestimatedPct: number;
  lastCalculated: string;
}

export async function stampForecastOnOrders(): Promise<number> {
  try {
    const { runSimulation } = await import('./productionSimulator');
    const snapshot = await runSimulation();

    let stamped = 0;
    for (const [orderId, result] of snapshot.results) {
      if (!result.projectedCompletion) continue;
      try {
        const forecastDate = normalizeToTuesday(new Date(result.projectedCompletion));
        // Pre-check: only stamp orders that meet all original WHERE conditions
        // Compare against the normalized date so idempotency holds after the first write
        const eligibleRows = await pool.query(
          `SELECT order_id FROM all_orders
           WHERE order_id = $1
             AND actual_completion_date IS NULL
             AND shipped_date IS NULL
             AND (forecast_completion_date IS NULL OR forecast_completion_date != $2)
             AND status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')`,
          [orderId, forecastDate]
        ) as any[];
        if (eligibleRows.length > 0) {
          await auditUpdateOrders({
            db: pool,
            orderIds: [orderId],
            changes: { forecast_completion_date: forecastDate },
            source: 'FORECAST_STAMP',
            user: null,
            reason: 'Nightly forecast stamp',
            ip: null,
            userAgent: null,
          });
          stamped++;
        }
      } catch {
      }
    }

    if (stamped > 0) {
      console.log(`[ForecastAccuracy] Stamped forecast dates on ${stamped} orders`);
    }
    return stamped;
  } catch (err) {
    console.error('[ForecastAccuracy] Failed to stamp forecasts:', err);
    return 0;
  }
}

export async function recordActualCompletion(orderId: string): Promise<void> {
  try {
    const now = new Date();
    // Pre-check: skip if already completed; fetch forecast_completion_date to compute error in JS
    const existingRows = await pool.query(
      `SELECT forecast_completion_date FROM all_orders
       WHERE order_id = $1 AND actual_completion_date IS NULL`,
      [orderId]
    ) as any[];
    if (existingRows.length > 0) {
      const forecastDate: Date | null = existingRows[0].forecast_completion_date ?? null;
      // Replicate postgres: ROUND(EXTRACT(EPOCH FROM (now - forecast)) / 86400.0, 1)
      const forecastErrorDays = forecastDate
        ? Math.round(((now.getTime() - new Date(forecastDate).getTime()) / 86400000) * 10) / 10
        : null;
      const updatedRows = await auditUpdateOrders({
        db: pool,
        orderIds: [orderId],
        changes: { actual_completion_date: now, forecast_error_days: forecastErrorDays },
        source: 'FORECAST_COMPLETION',
        user: null,
        reason: 'Actual completion recorded',
        ip: null,
        userAgent: null,
      });
      if (updatedRows[0]?.forecast_error_days != null) {
        console.log(
          `[ForecastAccuracy] Order ${orderId}: error = ${updatedRows[0].forecast_error_days} days ` +
          `(forecast: ${forecastDate?.toISOString()?.slice(0, 10)}, actual: ${now.toISOString().slice(0, 10)})`
        );
      }
    }
  } catch (err) {
    console.error(`[ForecastAccuracy] Failed to record actual completion for ${orderId}:`, err);
  }
}

export async function getForecastAccuracy(): Promise<ForecastAccuracyMetrics> {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_completed,
      COUNT(forecast_error_days)::int AS total_with_forecasts,
      ROUND(AVG(forecast_error_days)::numeric, 1) AS avg_error,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY forecast_error_days)::numeric, 1) AS median_error,
      ROUND(AVG(ABS(forecast_error_days))::numeric, 1) AS avg_abs_error,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(forecast_error_days) <= 1) / NULLIF(COUNT(forecast_error_days), 0), 1) AS within_1,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(forecast_error_days) <= 3) / NULLIF(COUNT(forecast_error_days), 0), 1) AS within_3,
      ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(forecast_error_days) <= 5) / NULLIF(COUNT(forecast_error_days), 0), 1) AS within_5,
      ROUND(100.0 * COUNT(*) FILTER (WHERE forecast_error_days > 0) / NULLIF(COUNT(forecast_error_days), 0), 1) AS late_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE forecast_error_days < 0) / NULLIF(COUNT(forecast_error_days), 0), 1) AS early_pct
    FROM all_orders
    WHERE actual_completion_date IS NOT NULL
  `);
  const rows = Array.isArray(result) ? result : (result?.rows ?? []);
  const r = rows[0] || {};

  return {
    totalCompleted: r.total_completed || 0,
    totalWithForecasts: r.total_with_forecasts || 0,
    avgErrorDays: parseFloat(r.avg_error) || 0,
    medianErrorDays: parseFloat(r.median_error) || 0,
    avgAbsErrorDays: parseFloat(r.avg_abs_error) || 0,
    withinOneDayPct: parseFloat(r.within_1) || 0,
    withinThreeDaysPct: parseFloat(r.within_3) || 0,
    withinFiveDaysPct: parseFloat(r.within_5) || 0,
    overestimatedPct: parseFloat(r.early_pct) || 0,
    underestimatedPct: parseFloat(r.late_pct) || 0,
    lastCalculated: new Date().toISOString(),
  };
}
