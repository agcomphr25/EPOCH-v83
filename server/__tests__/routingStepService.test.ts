/**
 * Unit tests for the active-routing-step helper (Task #144 Step 1).
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  __setTravelerStepLoaderForTests,
  getActiveRoutingStep,
  isActiveStep,
  makeRoutingStepCache,
} from '../src/services/routingStepService';
import type { TravelerStep } from '../schema';

function step(
  id: string,
  stepNumber: number,
  status: string,
  travelerId = 't1',
): TravelerStep {
  return {
    id,
    travelerId,
    stepNumber,
    status,
    departmentName: 'X',
    operationName: null,
    notes: null,
    completedAt: null,
    completedBy: null,
    requiresOperatorSignoff: false,
    requiresInspectorSignoff: false,
    qcRequired: false,
  } as unknown as TravelerStep;
}

let prevLoader: ReturnType<typeof __setTravelerStepLoaderForTests> | null = null;

afterEach(() => {
  if (prevLoader) __setTravelerStepLoaderForTests(prevLoader);
  prevLoader = null;
});

function withSteps(steps: TravelerStep[]) {
  prevLoader = __setTravelerStepLoaderForTests(async () => steps);
}

describe('getActiveRoutingStep', () => {
  it('returns the IN_PROGRESS step when one exists', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'IN_PROGRESS'),
      step('s3', 3, 'NOT_STARTED'),
    ]);
    const active = await getActiveRoutingStep('t1');
    expect(active?.step.id).toBe('s2');
    expect(active?.inProgress).toBe(true);
  });

  it('returns the eligible NOT_STARTED step when no step is in progress', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'NOT_STARTED'),
      step('s3', 3, 'NOT_STARTED'),
    ]);
    const active = await getActiveRoutingStep('t1');
    expect(active?.step.id).toBe('s2');
    expect(active?.inProgress).toBe(false);
    expect(active?.eligibleNotStarted).toBe(true);
  });

  it('returns null when every step is COMPLETED', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'COMPLETED'),
    ]);
    expect(await getActiveRoutingStep('t1')).toBeNull();
  });

  it('does NOT return a NOT_STARTED step when an earlier step is still pending', async () => {
    withSteps([
      step('s1', 1, 'NOT_STARTED'),
      step('s2', 2, 'NOT_STARTED'),
    ]);
    // First step is eligible-not-started — we return it, not s2.
    const active = await getActiveRoutingStep('t1');
    expect(active?.step.id).toBe('s1');
  });

  it('blocks promotion past a paused (HOLD) step', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'HOLD'),
      step('s3', 3, 'NOT_STARTED'),
    ]);
    // s2 is neither in-progress nor completed → s3 is NOT eligible.
    expect(await getActiveRoutingStep('t1')).toBeNull();
  });

  it('honours the per-request cache', async () => {
    let calls = 0;
    prevLoader = __setTravelerStepLoaderForTests(async () => {
      calls++;
      return [step('s1', 1, 'IN_PROGRESS')];
    });
    const cache = makeRoutingStepCache();
    await getActiveRoutingStep('t1', cache);
    await getActiveRoutingStep('t1', cache);
    await getActiveRoutingStep('t1', cache);
    expect(calls).toBe(1);
  });
});

describe('isActiveStep', () => {
  it('returns true only for the in-progress step id', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'IN_PROGRESS'),
    ]);
    expect(await isActiveStep('t1', 's2')).toBe(true);
    expect(await isActiveStep('t1', 's1')).toBe(false);
  });

  it('returns false for an eligible-but-not-started step', async () => {
    withSteps([
      step('s1', 1, 'COMPLETED'),
      step('s2', 2, 'NOT_STARTED'),
    ]);
    expect(await isActiveStep('t1', 's2')).toBe(false);
  });
});
