/**
 * Routing-Step Service — Phase 2 of Task #144.
 *
 * Single source of truth for "what is the active routing step on this
 * traveler right now?" The active step is derived from the routing
 * definition (`travelerSteps` ordered by `stepNumber`) plus the completed-
 * step history. Material draws, packet binding, and the operator scan UI
 * all consult this helper so they cannot disagree on what the active
 * step is.
 *
 * Active step rules (in order):
 *   1. The lowest-numbered step whose status is IN_PROGRESS / STARTED.
 *   2. Otherwise, the lowest-numbered step whose status is NOT_STARTED
 *      AND every prior step is COMPLETED. (i.e. the step that becomes
 *      eligible the moment the prior step is signed off.)
 *   3. Otherwise, no active step (traveler is fully complete or blocked).
 *
 * Per-request caching is provided via `withRoutingStepCache(fn)` so a
 * single HTTP request that asks "what's the active step?" multiple times
 * pays for one DB round-trip, not N.
 */

import { storage } from '../../storage';
import type { TravelerStep } from '../../schema';

const ACTIVE_STATUSES = new Set(['IN_PROGRESS', 'STARTED']);
const COMPLETED_STATUSES = new Set(['COMPLETED', 'SKIPPED']);

export interface ActiveRoutingStep {
  step: TravelerStep;
  /** True when the step is currently IN_PROGRESS / STARTED. */
  inProgress: boolean;
  /**
   * True when the step is NOT_STARTED but every prior step is COMPLETED —
   * i.e. it is the next step that may be started. Material draws are NOT
   * permitted against an `eligibleNotStarted` step (the operator must
   * `start` it first); the field exists so the gate layer can render a
   * specific blocker telling the operator to start the step.
   */
  eligibleNotStarted: boolean;
}

type Loader = (travelerId: string) => Promise<TravelerStep[]>;

let stepLoader: Loader = (travelerId) => storage.getTravelerSteps(travelerId);

/**
 * Test-only seam — lets unit tests inject a deterministic set of steps
 * without standing up the storage / DB layer. Production code never calls
 * this. Returns the previous loader so a test can restore it.
 */
export function __setTravelerStepLoaderForTests(loader: Loader): Loader {
  const prev = stepLoader;
  stepLoader = loader;
  return prev;
}

/**
 * Compute the active routing step for the given traveler.
 *
 * Returns `null` when the traveler has no in-progress step AND no
 * eligible-next step (e.g. every step is complete, or every step is
 * blocked behind an unfinished prerequisite).
 */
export async function getActiveRoutingStep(
  travelerId: string,
  cache?: Map<string, ActiveRoutingStep | null>,
): Promise<ActiveRoutingStep | null> {
  if (!travelerId) return null;
  if (cache?.has(travelerId)) return cache.get(travelerId) ?? null;

  const steps = (await stepLoader(travelerId)).slice().sort(
    (a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0),
  );

  let result: ActiveRoutingStep | null = null;
  const inProgress = steps.find((s) =>
    ACTIVE_STATUSES.has(String(s.status).toUpperCase()),
  );
  if (inProgress) {
    result = { step: inProgress, inProgress: true, eligibleNotStarted: false };
  } else {
    let allPriorComplete = true;
    for (const s of steps) {
      const status = String(s.status).toUpperCase();
      if (status === 'NOT_STARTED' && allPriorComplete) {
        result = { step: s, inProgress: false, eligibleNotStarted: true };
        break;
      }
      if (!COMPLETED_STATUSES.has(status)) {
        allPriorComplete = false;
        break;
      }
    }
  }

  cache?.set(travelerId, result);
  return result;
}

/**
 * Returns true when the supplied `stepId` matches the traveler's active
 * (in-progress) routing step. Returns false if the active step is
 * eligible-but-not-started, completed, or absent.
 */
export async function isActiveStep(
  travelerId: string,
  stepId: string,
  cache?: Map<string, ActiveRoutingStep | null>,
): Promise<boolean> {
  const active = await getActiveRoutingStep(travelerId, cache);
  return Boolean(active?.inProgress && active.step.id === stepId);
}

/**
 * Convenience wrapper: provide a fresh per-request cache to a handler so
 * any number of `getActiveRoutingStep` calls inside it collapse to a
 * single DB read per traveler.
 */
export function makeRoutingStepCache(): Map<string, ActiveRoutingStep | null> {
  return new Map();
}
