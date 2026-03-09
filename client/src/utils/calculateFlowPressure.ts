export type PressureLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FlowPressureResult {
  ratio: number;
  pressureLevel: PressureLevel;
  timeToClearDays: number;
}

export function calculateFlowPressure(
  upstreamCount: number,
  downstreamCount: number
): FlowPressureResult {
  const safeDownstream = Math.max(downstreamCount, 1);
  const ratio = upstreamCount / safeDownstream;
  const timeToClearDays = Math.round(ratio * 10) / 10;

  let pressureLevel: PressureLevel;
  if (ratio < 1.2) {
    pressureLevel = 'LOW';
  } else if (ratio < 2) {
    pressureLevel = 'MEDIUM';
  } else {
    pressureLevel = 'HIGH';
  }

  return { ratio, pressureLevel, timeToClearDays };
}
