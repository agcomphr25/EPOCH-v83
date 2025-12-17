export interface StepInstance {
  startedAt: string | Date;
  completedAt: string | Date;
}

export interface DriftResult {
  isDrifting: boolean;
  stepId: string;
  driftCount: number;
  recent: number[];
  baselineAvg: number;
  recentAvg: number;
  message: string | null;
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
  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;

  let driftCount = 0;
  for (const dur of recent) {
    if (dur > baselineAvg * 1.25) driftCount++;
  }

  if (driftCount >= 3) {
    console.log(`[Drift Detected] Step: ${stepId}`);
    console.log(`  Baseline Avg: ${(baselineAvg / 1000).toFixed(2)} sec`);
    console.log(`  Recent Durations: [${recent.map(d => (d / 1000).toFixed(2)).join(', ')}] sec`);
    console.log(`  Above threshold: ${driftCount} of 5\n`);

    return {
      isDrifting: true,
      stepId,
      driftCount,
      recent,
      baselineAvg,
      recentAvg,
      message: 'This step has been taking longer recently.'
    };
  }

  return null;
}
