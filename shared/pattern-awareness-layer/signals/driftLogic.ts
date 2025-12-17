export interface StepInstance {
  startedAt: string | Date;
  completedAt: string | Date;
}

export interface DriftResult {
  isDrifting: boolean;
  message: string | null;
  subtext: string | null;
  stats?: {
    baselineAvg: number;
    recentAvg: number;
    driftCount: number;
    threshold: number;
  };
}

export function detectDrift(instances: StepInstance[]): DriftResult {
  if (instances.length < 15) {
    return { isDrifting: false, message: null, subtext: null };
  }

  const durations = instances
    .map(d => new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime())
    .filter(d => d > 0);

  if (durations.length < 15) {
    return { isDrifting: false, message: null, subtext: null };
  }

  const recent = durations.slice(-5);
  const baselineSet = durations.slice(-15, -5);

  const baselineAvg = baselineSet.reduce((sum, val) => sum + val, 0) / baselineSet.length;
  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;

  let driftCount = 0;
  for (const dur of recent) {
    if (dur > baselineAvg * 1.25) driftCount++;
  }

  const isDrifting = driftCount >= 3;

  return {
    isDrifting,
    message: isDrifting ? 'This step has been taking longer recently.' : null,
    subtext: isDrifting ? 'Compared to its recent baseline.' : null,
    stats: {
      baselineAvg,
      recentAvg,
      driftCount,
      threshold: 3
    }
  };
}
