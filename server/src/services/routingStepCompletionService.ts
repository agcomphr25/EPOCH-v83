/**
 * Atomic routing-step completion (Task #144 Step 5).
 *
 * Completing a routing step has three required side effects that MUST
 * happen in one transaction:
 *
 *   1. Mark the step COMPLETED with `completedAt` / `completedBy`.
 *   2. Verify every required signoff (operator + inspector when the step
 *      mandates one) is present, OR an authorized force-sign override is
 *      attached.
 *   3. Promote the next NOT_STARTED step (if any) so the
 *      `getActiveRoutingStep` helper returns it on the very next call.
 *      "Promote" here means leave it as NOT_STARTED — the operator still
 *      has to start it — but the previous step is now COMPLETED, so the
 *      eligibility rule (`every prior step COMPLETED`) is satisfied.
 *
 * Doing all three under a single `db.transaction` guarantees that if
 * the signoff check fails, the step is NOT marked complete; conversely
 * if the step update fails, no half-promoted next step is left dangling.
 *
 * This helper is consumed by the existing traveler routes (start/sign /
 * force-sign) — those routes already write a TravelerSignature; this
 * service is the single place that enforces the COMPLETED transition is
 * atomic with the signoff verification.
 */

import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../db';
import { travelerSignatures, travelerSteps, travelerTasks } from '../../schema';
import type { TravelerStep } from '../../schema';

export type RoutingStepCompletionFailureCode =
  | 'STEP_NOT_FOUND'
  | 'STEP_NOT_IN_PROGRESS'
  | 'MISSING_OPERATOR_SIGNOFF'
  | 'MISSING_INSPECTOR_SIGNOFF'
  | 'WRONG_TRAVELER';

export interface RoutingStepCompletionRequest {
  travelerId: string;
  stepId: string;
  /** User id of the operator who completed the step. Stamped on the row. */
  completedByUserId: number;
  /** Display name stamped on the step row + on the audit event. */
  completedByDisplayName: string;
  /**
   * When true, skip the inspector-signoff requirement. Reserved for
   * supervisor / admin force-sign flows that record their own evidence.
   */
  bypassInspectorSignoff?: boolean;
}

export type RoutingStepCompletionResult =
  | { ok: true; step: TravelerStep; nextEligibleStepId: string | null }
  | { ok: false; code: RoutingStepCompletionFailureCode; message: string };

/**
 * Run the atomic completion. The function is idempotent w.r.t. an
 * already-COMPLETED step: a second call returns `ok: false` with code
 * `STEP_NOT_IN_PROGRESS` rather than corrupting the row.
 */
export async function completeRoutingStep(
  req: RoutingStepCompletionRequest,
): Promise<RoutingStepCompletionResult> {
  return db.transaction(async (tx) => {
    const [step] = await tx
      .select()
      .from(travelerSteps)
      .where(eq(travelerSteps.id, req.stepId))
      .for('update');
    if (!step) {
      return {
        ok: false as const,
        code: 'STEP_NOT_FOUND',
        message: `Routing step ${req.stepId} not found.`,
      };
    }
    if (step.travelerId !== req.travelerId) {
      return {
        ok: false as const,
        code: 'WRONG_TRAVELER',
        message: `Step ${req.stepId} belongs to a different traveler.`,
      };
    }
    const status = String(step.status).toUpperCase();
    if (status !== 'IN_PROGRESS' && status !== 'STARTED') {
      return {
        ok: false as const,
        code: 'STEP_NOT_IN_PROGRESS',
        message: `Step is ${step.status}; only IN_PROGRESS / STARTED steps may be completed.`,
      };
    }

    // Verify required signoffs. Operator signoff is always required.
    // Inspector signoff is required when the step has any required
    // `traveler_tasks` row with `requires_signature = true` AND
    // `signature_role = 'INSPECTOR'` (or task type 'QC' / 'INSPECTION').
    // We derive this from the schema rather than a per-step flag because
    // `traveler_steps` itself has no qcRequired column — `traveler_tasks`
    // is the source of truth for what the step requires.
    const sigs = await tx
      .select()
      .from(travelerSignatures)
      .where(eq(travelerSignatures.travelerStepId, req.stepId));
    const hasOperatorSignoff = sigs.some((s) =>
      ['COMPLETED', 'OPERATOR', 'PERFORMED_BY'].includes(String(s.meaning).toUpperCase()),
    );
    if (!hasOperatorSignoff) {
      return {
        ok: false as const,
        code: 'MISSING_OPERATOR_SIGNOFF',
        message: 'Step cannot be completed without an operator signoff.',
      };
    }

    // Block completion when any required task on the step is not yet
    // COMPLETED. This implicitly enforces inspector / QC signoffs because
    // those are modelled as required `traveler_tasks` rows.
    const incompleteRequiredTasks = await tx
      .select({
        id: travelerTasks.id,
        taskType: travelerTasks.taskType,
        signatureRole: travelerTasks.signatureRole,
        requiresSignature: travelerTasks.requiresSignature,
      })
      .from(travelerTasks)
      .where(
        and(
          eq(travelerTasks.travelerStepId, req.stepId),
          eq(travelerTasks.required, true),
          ne(travelerTasks.status, 'COMPLETED'),
        ),
      );
    if (incompleteRequiredTasks.length > 0 && !req.bypassInspectorSignoff) {
      const inspector = incompleteRequiredTasks.find(
        (t) =>
          (t.requiresSignature && String(t.signatureRole ?? '').toUpperCase() === 'INSPECTOR') ||
          ['QC', 'INSPECTION'].includes(String(t.taskType).toUpperCase()),
      );
      if (inspector) {
        return {
          ok: false as const,
          code: 'MISSING_INSPECTOR_SIGNOFF',
          message:
            `Step requires inspector / QC signoff (incomplete task ${inspector.id}) ` +
            'before completion.',
        };
      }
      return {
        ok: false as const,
        code: 'MISSING_OPERATOR_SIGNOFF',
        message:
          `Step has ${incompleteRequiredTasks.length} required task(s) not yet ` +
          'COMPLETED; finish them before completing the step.',
      };
    }

    const [updated] = await tx
      .update(travelerSteps)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: req.completedByDisplayName,
      })
      .where(
        and(
          eq(travelerSteps.id, req.stepId),
          eq(travelerSteps.travelerId, req.travelerId),
        ),
      )
      .returning();

    // Find the next eligible step on the traveler — the lowest-numbered
    // step that is still NOT_STARTED. We do NOT auto-start it; the
    // operator must scan-to-start. Returning the id lets the caller
    // surface "next step ready" to the UI without an extra round-trip.
    const remaining = await tx
      .select({ id: travelerSteps.id, stepNumber: travelerSteps.stepNumber, status: travelerSteps.status })
      .from(travelerSteps)
      .where(eq(travelerSteps.travelerId, req.travelerId));
    const nextEligible = remaining
      .filter((s) => String(s.status).toUpperCase() === 'NOT_STARTED')
      .sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0))[0];

    return {
      ok: true as const,
      step: updated,
      nextEligibleStepId: nextEligible?.id ?? null,
    };
  });
}
