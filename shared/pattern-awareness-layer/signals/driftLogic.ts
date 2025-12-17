import { isSuppressed, suppress } from './suppressionStore';

export interface StepInstance {
  startedAt: string | Date;
  completedAt: string | Date;
}

export type DriftConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DriftResult {
  isDrifting: boolean;
  stepId: string;
  driftCount: number;
  recentDurations: number[];
  baselineAvg: number;
  threshold: number;
  confidence: DriftConfidence;
  message: string;
}

export function detectDrift(stepId: string, instances: StepInstance[]): DriftResult | null {
  if (instances.length < 15) return null;

  const durations = instances
    .map(d => new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime())
    .filter(d => d > 0);

  if (durations.length < 15) return null;

  const recent = durations.slice(-5);
  const baselineSet = durations.slice(-15, -5);
  const baselineAvg = baselineSet.reduce((sum, val) => sum + val, 0) / baselineSet.length;
  const threshold = baselineAvg * 1.25;

  const driftCount = recent.filter(d => d > threshold).length;

  if (driftCount >= 3) {
    if (isSuppressed(stepId)) {
      return null;
    }

    let confidence: DriftConfidence = 'LOW';
    if (driftCount === 4) confidence = 'MEDIUM';
    if (driftCount === 5) confidence = 'HIGH';

    console.log(`\n[Drift Detected] Step: ${stepId}`);
    console.log(`  🔍 Baseline Avg: ${(baselineAvg / 1000).toFixed(2)} sec (window: 10)`);
    console.log(`  🔍 Threshold (+25%): ${(threshold / 1000).toFixed(2)} sec`);
    console.log(`  🕒 Recent Durations (sec): [${recent.map(d => (d / 1000).toFixed(2)).join(', ')}]`);
    console.log(`  📊 Steps above threshold: ${driftCount} of 5`);
    console.log(`  🎯 Confidence: ${confidence}`);
    console.log(`  📎 Insight suppressed for next 7 days unless resolved.\n`);

    suppress(stepId);

    return {
      isDrifting: true,
      stepId,
      driftCount,
      recentDurations: recent,
      baselineAvg,
      threshold,
      confidence,
      message: 'This step has been taking longer recently.'
    };
  }

  return null;
}
