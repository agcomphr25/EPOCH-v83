import { describe, expect, it } from 'vitest';
import { isRoutingConnectedOvenCureRun } from '../lib/timerTraceability';

describe('isRoutingConnectedOvenCureRun', () => {
  it.each(['Oven Cure', 'OVEN/CURE', 'Curing', 'Oven 1']) (
    'recognizes routed cure department %s',
    (departmentName) => {
      expect(isRoutingConnectedOvenCureRun({ departmentName, travelerId: 'traveler-1' })).toBe(true);
    },
  );

  it('does not infer cure traceability without a traveler connection', () => {
    expect(isRoutingConnectedOvenCureRun({ departmentName: 'Oven Cure' })).toBe(false);
  });

  it('recognizes the active P2 traveler task passed by the traveler timer', () => {
    expect(isRoutingConnectedOvenCureRun({
      departmentName: 'Oven/Cure',
      travelerTaskId: 'work-task-1',
    })).toBe(true);
  });

  it('does not turn unrelated routed departments into cure logs', () => {
    expect(isRoutingConnectedOvenCureRun({ departmentName: 'Layup', travelerStepId: 'step-1' })).toBe(false);
  });
});
