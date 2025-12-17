import type { BaselineSummary } from './baselineEngine';

export interface DeltaResult {
  isDeviated: boolean;
  currentSummary: {
    mean: number;
    count: number;
  };
}

export function detectDelta(
  baseline: BaselineSummary,
  currentValues: number[],
  threshold = 2
): DeltaResult {
  const currentMean =
    currentValues.reduce((sum, v) => sum + v, 0) / (currentValues.length || 1);

  const deviation = Math.abs(currentMean - baseline.mean);
  const stdDev = Math.sqrt(baseline.variance);

  const isDeviated = stdDev > 0 && deviation > threshold * stdDev;

  return {
    isDeviated,
    currentSummary: {
      mean: currentMean,
      count: currentValues.length,
    },
  };
}
