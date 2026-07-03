import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { allOrders, p1FulfillmentAttempts } from '../../schema';

export const P1_FULFILLMENT_STEPS = [
  'READINESS',
  'UPS_LABEL',
  'SHIPMENT_RECORD',
  'FULFILLMENT_UPDATE',
  'ACCOUNTING_HANDOFF',
  'CUSTOMER_NOTIFICATION',
] as const;

export type P1FulfillmentStep = typeof P1_FULFILLMENT_STEPS[number];

type DbExecutor = typeof db | any;

export type FulfillmentActor = {
  id?: number | null;
  username?: string | null;
};

type AttemptMetadata = Record<string, unknown>;

function mergeMetadata(existing: unknown, patch?: AttemptMetadata): AttemptMetadata {
  return {
    ...((existing as AttemptMetadata | null) ?? {}),
    ...(patch ?? {}),
  };
}

export async function startP1FulfillmentAttempt(input: {
  orderId: string;
  source: string;
  sourceRoute?: string | null;
  actor?: FulfillmentActor | null;
  metadata?: AttemptMetadata;
  tx?: DbExecutor;
}) {
  const tx = input.tx ?? db;
  const [attempt] = await tx
    .insert(p1FulfillmentAttempts)
    .values({
      orderId: input.orderId,
      status: 'IN_PROGRESS',
      currentStep: 'READINESS',
      source: input.source,
      sourceRoute: input.sourceRoute ?? null,
      actorUserId: input.actor?.id ?? null,
      actorDisplayName: input.actor?.username ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  return attempt;
}

export async function recordP1FulfillmentStep(input: {
  attemptId: string;
  step: P1FulfillmentStep;
  metadata?: AttemptMetadata;
  trackingNumber?: string | null;
  shipmentRecordId?: string | null;
  journalEntryId?: number | null;
  notificationStatus?: string | null;
  tx?: DbExecutor;
}) {
  const tx = input.tx ?? db;
  const [current] = await tx
    .select()
    .from(p1FulfillmentAttempts)
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .limit(1);

  if (!current) {
    throw new Error(`P1 fulfillment attempt ${input.attemptId} not found`);
  }

  const [attempt] = await tx
    .update(p1FulfillmentAttempts)
    .set({
      status: 'IN_PROGRESS',
      currentStep: input.step,
      trackingNumber: input.trackingNumber ?? current.trackingNumber,
      shipmentRecordId: input.shipmentRecordId ?? current.shipmentRecordId,
      journalEntryId: input.journalEntryId ?? current.journalEntryId,
      notificationStatus: input.notificationStatus ?? current.notificationStatus,
      metadata: mergeMetadata(current.metadata, input.metadata),
      updatedAt: new Date(),
    })
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .returning();

  return attempt;
}

export async function completeP1FulfillmentAttempt(input: {
  attemptId: string;
  metadata?: AttemptMetadata;
  trackingNumber?: string | null;
  shipmentRecordId?: string | null;
  journalEntryId?: number | null;
  notificationStatus?: string | null;
  tx?: DbExecutor;
}) {
  const tx = input.tx ?? db;
  const [current] = await tx
    .select()
    .from(p1FulfillmentAttempts)
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .limit(1);

  if (!current) {
    throw new Error(`P1 fulfillment attempt ${input.attemptId} not found`);
  }

  const [attempt] = await tx
    .update(p1FulfillmentAttempts)
    .set({
      status: 'COMPLETED',
      currentStep: 'CUSTOMER_NOTIFICATION',
      failedStep: null,
      failureCode: null,
      failureMessage: null,
      remediationHint: null,
      trackingNumber: input.trackingNumber ?? current.trackingNumber,
      shipmentRecordId: input.shipmentRecordId ?? current.shipmentRecordId,
      journalEntryId: input.journalEntryId ?? current.journalEntryId,
      notificationStatus: input.notificationStatus ?? current.notificationStatus,
      metadata: mergeMetadata(current.metadata, input.metadata),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .returning();

  return attempt;
}

export async function failP1FulfillmentAttempt(input: {
  attemptId: string;
  failedStep: P1FulfillmentStep;
  failureCode: string;
  failureMessage: string;
  remediationHint: string;
  metadata?: AttemptMetadata;
  tx?: DbExecutor;
}) {
  const tx = input.tx ?? db;
  const [current] = await tx
    .select()
    .from(p1FulfillmentAttempts)
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .limit(1);

  if (!current) {
    throw new Error(`P1 fulfillment attempt ${input.attemptId} not found`);
  }

  const [attempt] = await tx
    .update(p1FulfillmentAttempts)
    .set({
      status: 'EXCEPTION',
      currentStep: input.failedStep,
      failedStep: input.failedStep,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      remediationHint: input.remediationHint,
      metadata: mergeMetadata(current.metadata, input.metadata),
      updatedAt: new Date(),
    })
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .returning();

  return attempt;
}

export async function cancelP1FulfillmentException(input: {
  attemptId: string;
  reason: string;
  actor?: FulfillmentActor | null;
  tx?: DbExecutor;
}) {
  const tx = input.tx ?? db;
  const [current] = await tx
    .select()
    .from(p1FulfillmentAttempts)
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .limit(1);

  if (!current) {
    throw new Error(`P1 fulfillment attempt ${input.attemptId} not found`);
  }

  const [attempt] = await tx
    .update(p1FulfillmentAttempts)
    .set({
      status: 'CANCELLED',
      metadata: mergeMetadata(current.metadata, {
        cancelledReason: input.reason,
        cancelledBy: input.actor?.username ?? null,
      }),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(p1FulfillmentAttempts.id, input.attemptId))
    .returning();

  return attempt;
}

export async function listOpenP1FulfillmentExceptions(limit = 100) {
  return db
    .select({
      attemptId: p1FulfillmentAttempts.id,
      orderId: p1FulfillmentAttempts.orderId,
      attemptStatus: p1FulfillmentAttempts.status,
      currentStep: p1FulfillmentAttempts.currentStep,
      failedStep: p1FulfillmentAttempts.failedStep,
      failureCode: p1FulfillmentAttempts.failureCode,
      failureMessage: p1FulfillmentAttempts.failureMessage,
      remediationHint: p1FulfillmentAttempts.remediationHint,
      trackingNumber: p1FulfillmentAttempts.trackingNumber,
      shipmentRecordId: p1FulfillmentAttempts.shipmentRecordId,
      notificationStatus: p1FulfillmentAttempts.notificationStatus,
      source: p1FulfillmentAttempts.source,
      sourceRoute: p1FulfillmentAttempts.sourceRoute,
      actorDisplayName: p1FulfillmentAttempts.actorDisplayName,
      startedAt: p1FulfillmentAttempts.startedAt,
      updatedAt: p1FulfillmentAttempts.updatedAt,
      orderStatus: allOrders.status,
      currentDepartment: allOrders.currentDepartment,
      shippedDate: allOrders.shippedDate,
      customerId: allOrders.customerId,
      customerPO: allOrders.customerPO,
    })
    .from(p1FulfillmentAttempts)
    .leftJoin(allOrders, eq(allOrders.orderId, p1FulfillmentAttempts.orderId))
    .where(eq(p1FulfillmentAttempts.status, 'EXCEPTION'))
    .orderBy(desc(p1FulfillmentAttempts.updatedAt))
    .limit(limit);
}

export async function listP1FulfillmentControlGaps(limit = 100) {
  return db
    .select({
      orderId: allOrders.orderId,
      orderStatus: allOrders.status,
      currentDepartment: allOrders.currentDepartment,
      shippedDate: allOrders.shippedDate,
      trackingNumber: allOrders.trackingNumber,
      shippingLabelGenerated: allOrders.shippingLabelGenerated,
    })
    .from(allOrders)
    .where(
      and(
        ne(allOrders.orderSource, 'PO_RELEASE'),
        sql`(
          (${allOrders.trackingNumber} IS NOT NULL AND ${allOrders.shippedDate} IS NULL)
          OR (${allOrders.shippedDate} IS NOT NULL AND COALESCE(${allOrders.status}, '') NOT IN ('FULFILLED', 'COMPLETED'))
          OR (${allOrders.currentDepartment} = 'Fulfilled' AND ${allOrders.shippedDate} IS NULL)
        )`,
      ),
    )
    .orderBy(desc(allOrders.updatedAt))
    .limit(limit);
}
