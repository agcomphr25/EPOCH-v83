/**
 * OrderActivityService — canonical write service for all audited order mutations.
 *
 * CONTRACT:
 *   - Every public function executes the allOrders UPDATE and the
 *     order_activity_events INSERT inside a single DB transaction.
 *   - If either write fails the transaction rolls back; no silent logging.
 *   - Callers receive structured errors — never partially-committed state.
 *
 * Existing shadow tables (admin_audit_log, badge_scan_audit_log,
 * order_department_transitions) are NOT touched here. They keep their own
 * write paths for backward compatibility.  New canonical audit goes only into
 * order_activity_events.
 */

import { db } from '../../db';
import { allOrders, orderActivityEvents, orderDepartmentTransitions, InsertOrderActivityEvent } from '../../schema';
import { eq, and, isNull } from 'drizzle-orm';
import { computeFieldDiff } from '../../../shared/auditedOrderFields';
import {
  validateStatusTransition,
  validateDepartmentTransition,
  TransitionOverride,
} from './orderTransitionValidator';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface OrderActor {
  actorId?: number | null;
  actorDisplayName?: string | null;
  actorType?: 'user' | 'employee' | 'system' | 'offline_replay';
}

export interface EventMeta {
  source?: string;
  sourceRoute?: string;
  correlationId?: string;
  reasonCode?: string;
  reasonText?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
}

// Row type returned by drizzle allOrders select
type OrderRow = typeof allOrders.$inferSelect;

// ── Internal helper ───────────────────────────────────────────────────────────

function buildEventPayload(
  orderId: string,
  eventType: string,
  eventCategory: string,
  actor: OrderActor,
  meta: EventMeta,
  before: OrderRow | Record<string, unknown>,
  after: OrderRow | Record<string, unknown>,
  extra: {
    statusFrom?: string | null;
    statusTo?: string | null;
    departmentFrom?: string | null;
    departmentTo?: string | null;
  } = {}
): InsertOrderActivityEvent {
  const fieldDiff = computeFieldDiff(
    before as Record<string, unknown>,
    after as Record<string, unknown>
  );

  return {
    orderId,
    eventType,
    eventCategory,
    occurredAt: new Date(),
    actorId: actor.actorId ?? null,
    actorType: actor.actorType ?? 'system',
    actorDisplayName: actor.actorDisplayName ?? null,
    source: meta.source ?? 'server',
    sourceRoute: meta.sourceRoute ?? null,
    correlationId: meta.correlationId ?? null,
    reasonCode: meta.reasonCode ?? null,
    reasonText: meta.reasonText ?? null,
    beforeSnapshot: before as InsertOrderActivityEvent['beforeSnapshot'],
    afterSnapshot: after as InsertOrderActivityEvent['afterSnapshot'],
    fieldDiff: fieldDiff as InsertOrderActivityEvent['fieldDiff'],
    statusFrom: extra.statusFrom ?? null,
    statusTo: extra.statusTo ?? null,
    departmentFrom: extra.departmentFrom ?? null,
    departmentTo: extra.departmentTo ?? null,
    relatedEntityType: meta.relatedEntityType ?? null,
    relatedEntityId: meta.relatedEntityId ?? null,
    metadata: (meta.metadata ?? null) as InsertOrderActivityEvent['metadata'],
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Transition an order to a new status.
 * Validates the transition via the state machine unless override is provided.
 */
export async function transitionOrderStatus(
  orderId: string,
  toStatus: string,
  actor: OrderActor,
  meta: EventMeta = {},
  override?: TransitionOverride
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found`);
    }

    validateStatusTransition(before.status, toStatus, override);

    const [after] = await tx
      .update(allOrders)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to update order ${orderId} status`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'STATUS_TRANSITION',
        'production',
        actor,
        meta,
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: toStatus,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Move an order to a new department (and optionally a new status).
 * Validates the department transition via the state machine unless override is provided.
 */
export async function moveOrderDepartment(
  orderId: string,
  toDepartment: string,
  actor: OrderActor,
  meta: EventMeta = {},
  options: {
    toStatus?: string;
    completionTimestamps?: Record<string, Date>;
    override?: TransitionOverride;
  } = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found`);
    }

    validateDepartmentTransition(
      before.currentDepartment,
      toDepartment,
      options.override
    );

    const updatePayload: Record<string, unknown> = {
      currentDepartment: toDepartment,
      updatedAt: new Date(),
      ...options.completionTimestamps,
    };

    if (options.toStatus) {
      updatePayload.status = options.toStatus;
    }

    const [after] = await tx
      .update(allOrders)
      .set(updatePayload)
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to move order ${orderId} to department ${toDepartment}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'DEPARTMENT_MOVE',
        'production',
        actor,
        meta,
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: toDepartment,
        }
      )
    );
  });
}

/**
 * Apply a patch to audited order fields (generic field update).
 */
export async function applyOrderFieldPatch(
  orderId: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found`);
    }

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to patch order ${orderId}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'FIELD_PATCH',
        'production',
        actor,
        meta,
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Apply a patch to spec/build fields.
 */
export async function applyOrderSpecPatch(
  orderId: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found`);
    }

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to apply spec patch to order ${orderId}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'SPEC_PATCH',
        'spec',
        actor,
        meta,
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Record an admin override — used by the single-field and bulk-update admin routes.
 * Always writes a canonical event row in addition to the existing admin_audit_log.
 */
export async function applyAdminOverride(
  orderId: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {},
  override?: TransitionOverride
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Validate any status/department changes within the patch
    if (patch.status && patch.status !== before.status) {
      validateStatusTransition(before.status, patch.status as string, override);
    }
    if (patch.currentDepartment && patch.currentDepartment !== before.currentDepartment) {
      validateDepartmentTransition(before.currentDepartment, patch.currentDepartment as string, override);
    }

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to apply admin override to order ${orderId}`);
    }

    const overrideMeta: EventMeta = {
      ...meta,
      reasonText: meta.reasonText ?? override?.overrideReason ?? null ?? undefined,
    };

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'ADMIN_OVERRIDE',
        'admin',
        { ...actor, actorType: actor.actorType ?? 'user' },
        { ...overrideMeta, source: overrideMeta.source ?? 'admin' },
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Record a badge scan department transition.
 * Validates the department transition, then executes update + audit event atomically.
 */
export async function recordBadgeScanTransition(
  orderId: string,
  fromDepartment: string,
  toDepartment: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found for badge scan transition`);
    }

    // Badge scans always represent a valid floor-level department progression.
    // Call the validator with the actual from/to so illegal regressions are caught.
    validateDepartmentTransition(fromDepartment, toDepartment);

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to update order ${orderId} via badge scan`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'BADGE_SCAN_TRANSITION',
        'production',
        { ...actor, actorType: actor.actorType ?? 'employee' },
        { ...meta, source: meta.source ?? 'badge_scan' },
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: fromDepartment,
          departmentTo: toDepartment,
        }
      )
    );
  });
}

/**
 * Record a shipping update (tracking, mark-shipped, delivery confirmation).
 * Validates any status/department changes embedded in the patch.
 */
export async function recordShippingUpdate(
  orderId: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found for shipping update`);
    }

    // Validate any embedded status/department changes in the patch
    if (patch.status && patch.status !== before.status) {
      validateStatusTransition(before.status, patch.status as string);
    }
    if (patch.currentDepartment && patch.currentDepartment !== before.currentDepartment) {
      validateDepartmentTransition(before.currentDepartment, patch.currentDepartment as string);
    }

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to apply shipping update to order ${orderId}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'SHIPPING_UPDATE',
        'shipping',
        { ...actor, actorType: actor.actorType ?? 'system' },
        { ...meta, source: meta.source ?? 'shipping' },
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Record an NCR repair transition — moves order to repair department, changes status.
 * Validates the department transition before executing.
 * Requires a relatedEntityId (NCR record id) for traceability.
 */
export async function recordNcrRepairTransition(
  orderId: string,
  repairDepartment: string,
  ncrId: number | string,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found for NCR repair transition`);
    }

    // NCR repairs are always backward moves (re-entry for repair) — they come with
    // an implicit override since they represent a legitimate quality flow.
    const ncrOverride: TransitionOverride = {
      overrideReason: `NCR repair re-entry: NCR #${ncrId}`,
      actor: {
        actorId: actor.actorId ?? null,
        actorDisplayName: actor.actorDisplayName ?? null,
        actorType: actor.actorType ?? 'user',
      },
    };

    validateDepartmentTransition(before.currentDepartment, repairDepartment, ncrOverride);
    validateStatusTransition(before.status, 'IN_PROGRESS', ncrOverride);

    const [after] = await tx
      .update(allOrders)
      .set({
        currentDepartment: repairDepartment,
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
      })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to apply NCR repair transition to order ${orderId}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'NCR_REPAIR_TRANSITION',
        'production',
        { ...actor, actorType: actor.actorType ?? 'user' },
        {
          ...meta,
          source: meta.source ?? 'ncr',
          reasonCode: meta.reasonCode ?? 'NCR_REPAIR',
          reasonText: meta.reasonText ?? `NCR repair: moved to ${repairDepartment}`,
          relatedEntityType: 'ncr_record',
          relatedEntityId: String(ncrId),
        },
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: 'IN_PROGRESS',
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: repairDepartment,
        }
      )
    );

    const openTransition = await tx.select()
      .from(orderDepartmentTransitions)
      .where(and(
        eq(orderDepartmentTransitions.entityId, orderId),
        isNull(orderDepartmentTransitions.exitedAt)
      ))
      .limit(1);

    if (openTransition.length > 0) {
      const exitedAt = new Date();
      const durationMinutes = Math.round(
        (exitedAt.getTime() - new Date(openTransition[0].enteredAt).getTime()) / (1000 * 60)
      );
      await tx.update(orderDepartmentTransitions)
        .set({
          exitedAt,
          durationMinutes,
          exitedByUserId: actor.actorId ?? null,
          exitReason: 'ncr_repair',
        })
        .where(eq(orderDepartmentTransitions.id, openTransition[0].id));
    }

    await tx.insert(orderDepartmentTransitions).values({
      entityType: 'p1_order',
      entityId: orderId,
      department: repairDepartment,
      cycleNumber: openTransition[0]?.cycleNumber ?? 1,
      enteredAt: new Date(),
      enteredByUserId: actor.actorId ?? null,
    });
  });
}

/**
 * Record a payment state transition (isPaid, paymentType, paymentAmount, etc.).
 */
export async function recordPaymentStateTransition(
  orderId: string,
  patch: Record<string, unknown>,
  actor: OrderActor,
  meta: EventMeta = {}
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!before) {
      throw new Error(`Order ${orderId} not found for payment transition`);
    }

    const [after] = await tx
      .update(allOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(allOrders.orderId, orderId))
      .returning();

    if (!after) {
      throw new Error(`Failed to apply payment state transition to order ${orderId}`);
    }

    await tx.insert(orderActivityEvents).values(
      buildEventPayload(
        orderId,
        'PAYMENT_STATE_TRANSITION',
        'finance',
        { ...actor, actorType: actor.actorType ?? 'user' },
        { ...meta, source: meta.source ?? 'server' },
        before,
        after,
        {
          statusFrom: before.status ?? null,
          statusTo: after.status ?? null,
          departmentFrom: before.currentDepartment ?? null,
          departmentTo: after.currentDepartment ?? null,
        }
      )
    );
  });
}

/**
 * Write an ORDER_CREATED event for a newly inserted order row.
 * This must be called within the same transaction as the allOrders insert.
 * The transaction context (tx) is passed by the caller so both writes
 * commit or roll back together.
 *
 * Validates the initial status and department assignments through the state
 * machine, treating null as the "before" state for a brand-new order.
 * (null → any status is always legal since there is no prior state to violate.)
 */
export async function recordOrderCreatedEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  insertedOrder: OrderRow,
  actor: OrderActor,
  meta: EventMeta
): Promise<void> {
  // Validate initial status and department — null → X is always legal,
  // but we run through the validator to make state machine intent explicit
  // and catch any future configuration that restricts first-assignment.
  if (insertedOrder.status) {
    validateStatusTransition(null, insertedOrder.status);
  }
  if (insertedOrder.currentDepartment) {
    validateDepartmentTransition(null, insertedOrder.currentDepartment);
  }

  const fieldDiff = computeFieldDiff({}, insertedOrder as unknown as Record<string, unknown>);

  await tx.insert(orderActivityEvents).values({
    orderId: insertedOrder.orderId,
    eventType: 'ORDER_CREATED',
    eventCategory: 'production',
    occurredAt: new Date(),
    actorId: actor.actorId ?? null,
    actorType: actor.actorType ?? 'system',
    actorDisplayName: actor.actorDisplayName ?? null,
    source: meta.source ?? 'server',
    sourceRoute: meta.sourceRoute ?? null,
    correlationId: meta.correlationId ?? null,
    reasonCode: meta.reasonCode ?? null,
    reasonText: meta.reasonText ?? null,
    beforeSnapshot: {} as InsertOrderActivityEvent['beforeSnapshot'],
    afterSnapshot: insertedOrder as unknown as InsertOrderActivityEvent['afterSnapshot'],
    fieldDiff: fieldDiff as InsertOrderActivityEvent['fieldDiff'],
    statusFrom: null,
    statusTo: insertedOrder.status ?? null,
    departmentFrom: null,
    departmentTo: insertedOrder.currentDepartment ?? null,
    relatedEntityType: meta.relatedEntityType ?? null,
    relatedEntityId: meta.relatedEntityId ?? null,
    metadata: (meta.metadata ?? null) as InsertOrderActivityEvent['metadata'],
  });
}
