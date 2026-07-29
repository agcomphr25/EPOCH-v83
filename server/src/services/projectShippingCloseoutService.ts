import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import type { ProductionActor } from './projectProductionExecutionService';
import {
  evaluateCloseoutReadiness,
  evaluateShippingReadiness,
} from './projectShippingCloseoutRules';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';

type Executor = AuditLedgerTx;
// Raw SQL is intentional: existing shipment, P2 serialized-item, Quality, and PO
// tables remain authoritative and are linked without redefining their Drizzle models.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class ProjectShippingCloseoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

async function loadContext(projectId: string, tx: Executor, lock = false) {
  const project = rows(
    await tx.execute(sql`
      SELECT p.id,p.project_code,p.project_name,p.workflow_version,p.po_id,
        p.current_stage,p.status,po.po_number,po.customer_id,po.customer_name,
        po.status AS po_status
      FROM projects p
      LEFT JOIN p2_purchase_orders po ON po.id=p.po_id
      WHERE p.id=${projectId} ${lock ? sql`FOR UPDATE OF p` : sql``}`)
  )[0];
  if (!project)
    throw new ProjectShippingCloseoutError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let version: string;
  try {
    version = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectShippingCloseoutError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (version !== 'p2_v2')
    throw new ProjectShippingCloseoutError(
      'P2_V2_REQUIRED',
      'Shipping and closeout mutations require an explicit p2_v2 project.',
      409
    );
  const instances = rows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_instances
      WHERE project_id=${projectId} AND workflow_version='p2_v2'
        AND status NOT IN ('SUPERSEDED','CANCELLED')
      ${lock ? sql`FOR UPDATE` : sql``}`)
  );
  if (instances.length !== 1)
    throw new ProjectShippingCloseoutError(
      'WORKFLOW_INSTANCE_REQUIRED',
      'Exactly one current p2_v2 workflow instance is required.',
      409
    );
  const steps = rows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_step_instances
      WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`)
  );
  const productionStep = steps.find(
    (entry) => entry.step_type === 'production_quality'
  );
  const qualityStep = steps.find(
    (entry) => entry.step_type === 'final_release_shipping'
  );
  const shippingStep = steps.find(
    (entry) => entry.step_type === 'project_closing'
  );
  if (!shippingStep)
    throw new ProjectShippingCloseoutError(
      'SHIPPING_STAGE_REQUIRED',
      'Stage 10 Shipping & Project Closing is missing.',
      409
    );
  return {
    project,
    instance: instances[0],
    productionStep,
    qualityStep,
    shippingStep,
  };
}

async function loadShippingModel(projectId: string, tx: Executor) {
  const ctx = await loadContext(projectId, tx);
  const releases = rows(
    await tx.execute(sql`
      SELECT r.*,
        EXISTS(SELECT 1 FROM project_product_release_holds h
          WHERE h.product_release_id=r.id AND h.status='ACTIVE') AS held
      FROM project_product_releases r
      WHERE r.project_id=${projectId}
      ORDER BY r.released_at,r.id`)
  );
  const allocations = rows(
    await tx.execute(sql`
      SELECT a.*,r.release_number,r.release_decision,r.shipping_status,
        COALESCE((
          SELECT sum(l.quantity) FROM project_shipment_allocation_links l
          WHERE l.release_allocation_id=a.id AND l.status IN ('SHIPPED','DELIVERED')
        ),0) AS shipped_quantity,
        COALESCE((
          SELECT sum(l.quantity) FROM project_shipment_allocation_links l
          WHERE l.release_allocation_id=a.id AND l.status='DELIVERED'
        ),0) AS delivered_quantity,
        EXISTS(SELECT 1 FROM project_product_release_holds h
          WHERE h.product_release_id=a.product_release_id AND h.status='ACTIVE') AS held
      FROM project_product_release_allocations a
      JOIN project_product_releases r ON r.id=a.product_release_id
      WHERE a.project_id=${projectId}
      ORDER BY r.released_at,a.created_at,a.id`)
  );
  const shippingHolds = rows(
    await tx.execute(sql`
      SELECT * FROM project_shipping_holds WHERE project_id=${projectId}
      ORDER BY placed_at DESC`)
  );
  const reviews = rows(
    await tx.execute(sql`
      SELECT * FROM project_shipping_reviews WHERE project_id=${projectId}
      ORDER BY revision_number DESC`)
  );
  const review =
    reviews.find(
      (entry) => !['STALE', 'SUPERSEDED', 'DELIVERED'].includes(entry.status)
    ) ?? null;
  const authorizations = rows(
    await tx.execute(sql`
      SELECT * FROM project_shipment_authorizations
      WHERE project_id=${projectId} ORDER BY authorized_at DESC`)
  );
  const links = rows(
    await tx.execute(sql`
      SELECT l.* FROM project_shipment_allocation_links l
      WHERE l.project_id=${projectId} ORDER BY l.created_at`)
  );
  const eligibleAllocations = allocations.filter(
    (entry) =>
      !entry.held &&
      entry.release_decision === 'RELEASED' &&
      Number(entry.quantity) > Number(entry.shipped_quantity)
  );
  return {
    ctx,
    releases,
    allocations,
    eligibleAllocations,
    shippingHolds,
    reviews,
    review,
    authorizations,
    links,
  };
}

export async function getShippingCloseoutDashboard(
  projectId: string,
  tx: Executor = db
) {
  const shipping = await loadShippingModel(projectId, tx);
  const closeouts = rows(
    await tx.execute(sql`
      SELECT * FROM project_closeout_reviews WHERE project_id=${projectId}
      ORDER BY revision_number DESC`)
  );
  const closeout = closeouts[0] ?? null;
  const approvals = closeout
    ? rows(
        await tx.execute(sql`
          SELECT * FROM project_closeout_approvals
          WHERE closeout_review_id=${closeout.id} ORDER BY decided_at`)
      )
    : [];
  const closeoutEvents = rows(
    await tx.execute(sql`
      SELECT * FROM project_closeout_events WHERE project_id=${projectId}
      ORDER BY occurred_at`)
  );
  return { ...shipping, closeouts, closeout, approvals, closeoutEvents };
}

export type ShippingReviewInput = {
  expectedLockVersion?: number;
  allocationIds: string[];
  packaging: {
    packagingMethod: string;
    preservationMethod: string;
    packageCount: number;
    packageIdentifiers: string[];
    weightLbs: number;
    dimensions: { length: number; width: number; height: number };
    cushioningProtection?: string;
    moistureFodControls?: string;
    shelfLifeMarking?: string;
    handlingLabels?: string[];
    customerBagTagRequirements?: string;
    photographs?: Array<{ attachmentId: string; name: string }>;
  };
  shipTo: Record<string, unknown>;
  carrier: {
    carrier: string;
    serviceLevel: string;
    manualTrackingAllowed?: boolean;
    partialShipmentAllowed?: boolean;
    deliveryRequired?: boolean;
  };
  documentManifest: Array<{
    documentId: string;
    documentNumber: string;
    revision: string;
    status: string;
    checksum?: string;
    inclusionReason: string;
    required?: boolean;
  }>;
};

function shippingSelection(
  model: Awaited<ReturnType<typeof loadShippingModel>>,
  input: ShippingReviewInput
) {
  const selected = model.allocations.filter((entry) =>
    input.allocationIds.includes(String(entry.id))
  );
  if (selected.length !== new Set(input.allocationIds).size)
    throw new ProjectShippingCloseoutError(
      'ALLOCATION_NOT_FOUND',
      'One or more selected Product Release allocations were not found.',
      404
    );
  const activeReleaseHold = selected.some((entry) => entry.held);
  const activeShippingHold = model.shippingHolds.some(
    (hold) => hold.status === 'ACTIVE'
  );
  const selectedQuantity = selected.reduce(
    (sum, entry) =>
      sum + (Number(entry.quantity) - Number(entry.shipped_quantity)),
    0
  );
  const eligibleQuantity = model.eligibleAllocations
    .filter((entry) => input.allocationIds.includes(String(entry.id)))
    .reduce(
      (sum, entry) =>
        sum + (Number(entry.quantity) - Number(entry.shipped_quantity)),
      0
    );
  const readiness = evaluateShippingReadiness({
    selectedAllocationCount: selected.length,
    selectedQuantity,
    eligibleQuantity,
    activeReleaseHold,
    activeShippingHold,
    packagingMethod: input.packaging.packagingMethod,
    preservationMethod: input.packaging.preservationMethod,
    packageCount: input.packaging.packageCount,
    weightLbs: input.packaging.weightLbs,
    dimensions: input.packaging.dimensions,
    address: input.shipTo,
    carrier: input.carrier.carrier,
    serviceLevel: input.carrier.serviceLevel,
    documents: input.documentManifest,
  });
  return { selected, selectedQuantity, eligibleQuantity, readiness };
}

export async function saveShippingReview(
  projectId: string,
  input: ShippingReviewInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-shipping:${projectId}`}))`
    );
    const model = await loadShippingModel(projectId, tx);
    if (model.ctx.instance.status === 'COMPLETE')
      throw new ProjectShippingCloseoutError(
        'WORKFLOW_CLOSED',
        'Normal Shipping mutations are disabled after Project Closing.',
        409
      );
    if (!model.eligibleAllocations.length)
      throw new ProjectShippingCloseoutError(
        'ELIGIBLE_PRODUCT_RELEASE_REQUIRED',
        'Stage 10 cannot activate without an unheld eligible Product Release.',
        409
      );
    const selection = shippingSelection(model, input);
    let review: Row;
    if (model.review) {
      if (input.expectedLockVersion == null)
        throw new ProjectShippingCloseoutError(
          'EXPECTED_REVISION_REQUIRED',
          'expectedLockVersion is required when updating Shipping readiness.',
          400
        );
      if (Number(model.review.lock_version) !== input.expectedLockVersion)
        throw new ProjectShippingCloseoutError(
          'STALE_WRITE',
          'The Shipping review is stale.',
          409
        );
      if (
        ['PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED'].includes(
          model.review.status
        )
      )
        throw new ProjectShippingCloseoutError(
          'SHIPPING_REVIEW_FROZEN',
          'Shipment history is immutable; create another review for remaining allocations.',
          409
        );
      review = rows(
        await tx.execute(sql`
          UPDATE project_shipping_reviews SET
            lock_version=lock_version+1,status=${selection.readiness.status},
            selected_release_ids=${JSON.stringify([...new Set(selection.selected.map((entry) => entry.product_release_id))])}::jsonb,
            selected_allocation_ids=${JSON.stringify(input.allocationIds)}::jsonb,
            packaging_evidence=${JSON.stringify(input.packaging)}::jsonb,
            ship_to_snapshot=${JSON.stringify(input.shipTo)}::jsonb,
            carrier_snapshot=${JSON.stringify(input.carrier)}::jsonb,
            document_manifest=${JSON.stringify(input.documentManifest)}::jsonb,
            blockers=${JSON.stringify(selection.readiness.blockers)}::jsonb,
            evidence_snapshot=${JSON.stringify({ selected: selection.selected, selectedQuantity: selection.selectedQuantity })}::jsonb,
            packaging_verified_by=${actor.userId},
            packaging_verified_by_display_name=${actor.displayName},
            packaging_verified_at=now(),updated_at=now()
          WHERE id=${model.review.id} AND lock_version=${input.expectedLockVersion}
          RETURNING *`)
      )[0];
    } else {
      const revision = Number(model.reviews[0]?.revision_number ?? 0) + 1;
      review = rows(
        await tx.execute(sql`
          INSERT INTO project_shipping_reviews(
            project_id,workflow_instance_id,workflow_step_instance_id,revision_number,status,
            selected_release_ids,selected_allocation_ids,packaging_evidence,ship_to_snapshot,
            carrier_snapshot,document_manifest,blockers,evidence_snapshot,created_by,
            created_by_display_name,packaging_verified_by,packaging_verified_by_display_name,
            packaging_verified_at)
          VALUES(${projectId},${model.ctx.instance.id},${model.ctx.shippingStep.id},${revision},
            ${selection.readiness.status},
            ${JSON.stringify([...new Set(selection.selected.map((entry) => entry.product_release_id))])}::jsonb,
            ${JSON.stringify(input.allocationIds)}::jsonb,${JSON.stringify(input.packaging)}::jsonb,
            ${JSON.stringify(input.shipTo)}::jsonb,${JSON.stringify(input.carrier)}::jsonb,
            ${JSON.stringify(input.documentManifest)}::jsonb,
            ${JSON.stringify(selection.readiness.blockers)}::jsonb,
            ${JSON.stringify({ selected: selection.selected, selectedQuantity: selection.selectedQuantity })}::jsonb,
            ${actor.userId},${actor.displayName},${actor.userId},${actor.displayName},now())
          RETURNING *`)
      )[0];
      await tx.execute(sql`
        UPDATE project_workflow_step_instances
        SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_at=now()
        WHERE id=${model.ctx.shippingStep.id}
          AND status IN ('NOT_STARTED','NOT_APPLICABLE')`);
    }
    await recordAuditEvent(
      {
        eventType: 'P2_V2_SHIPPING_REVIEW_SAVED',
        subjectType: 'project_shipping_review',
        subjectId: review.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          revision: review.revision_number,
          status: review.status,
          selectedAllocationIds: input.allocationIds,
          selectedQuantity: selection.selectedQuantity,
        },
      },
      tx
    );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export type AuthorizeShipmentInput = {
  expectedLockVersion: number;
  idempotencyKey: string;
  signatureMeaning: string;
  certificationFailurePoint?: 'AFTER_AUTHORIZATION' | 'AFTER_ALLOCATIONS';
};

export async function authorizeShipment(
  projectId: string,
  input: AuthorizeShipmentInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-shipping:${projectId}`}))`
    );
    const model = await loadShippingModel(projectId, tx);
    const requestHash = digest(input);
    const prior = rows(
      await tx.execute(sql`
        SELECT * FROM project_shipment_authorizations
        WHERE project_id=${projectId} AND idempotency_key=${input.idempotencyKey}`)
    )[0];
    if (prior) {
      if (prior.request_hash !== requestHash)
        throw new ProjectShippingCloseoutError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used for another shipment authorization.',
          409
        );
      return { authorization: prior, idempotentReplay: true };
    }
    if (!model.review || model.review.status !== 'READY_TO_SHIP')
      throw new ProjectShippingCloseoutError(
        'READY_TO_SHIP_REQUIRED',
        'Shipping readiness must be READY_TO_SHIP before authorization.',
        409
      );
    if (Number(model.review.lock_version) !== input.expectedLockVersion)
      throw new ProjectShippingCloseoutError(
        'STALE_WRITE',
        'The Shipping review is stale.',
        409
      );
    const allocationIds = Array.isArray(model.review.selected_allocation_ids)
      ? model.review.selected_allocation_ids.map(String)
      : [];
    const selected = model.allocations.filter((entry) =>
      allocationIds.includes(String(entry.id))
    );
    if (!selected.length || selected.some((entry) => entry.held))
      throw new ProjectShippingCloseoutError(
        'RELEASE_NOT_SHIPPABLE',
        'A selected Product Release is held, revoked, or no longer eligible.',
        409
      );
    if (
      model.shippingHolds.some((hold) => hold.status === 'ACTIVE') ||
      selected.some((entry) => entry.shipping_status === 'BLOCKED')
    )
      throw new ProjectShippingCloseoutError(
        'SHIPPING_HOLD_ACTIVE',
        'An active Product Release or Shipping hold blocks authorization.',
        409
      );
    const alreadyCommitted = model.links.some(
      (link) =>
        allocationIds.includes(String(link.release_allocation_id)) &&
        ['AUTHORIZED', 'SHIPPED', 'DELIVERED'].includes(link.status)
    );
    if (alreadyCommitted)
      throw new ProjectShippingCloseoutError(
        'ALLOCATION_ALREADY_COMMITTED',
        'A selected release allocation is already authorized or shipped.',
        409
      );
    const authorizationNumber = `SA-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${digest([projectId, input.idempotencyKey]).slice(0, 8).toUpperCase()}`;
    const authorization = rows(
      await tx.execute(sql`
        INSERT INTO project_shipment_authorizations(
          authorization_number,project_id,shipping_review_id,shipping_review_revision,
          product_release_ids,allocation_snapshot,package_snapshot,ship_to_snapshot,
          carrier_snapshot,document_manifest,evidence_snapshot,idempotency_key,request_hash,
          authorized_by,authorized_by_display_name)
        VALUES(${authorizationNumber},${projectId},${model.review.id},
          ${model.review.revision_number},${JSON.stringify([...new Set(selected.map((entry) => entry.product_release_id))])}::jsonb,
          ${JSON.stringify(selected)}::jsonb,${JSON.stringify(model.review.packaging_evidence)}::jsonb,
          ${JSON.stringify(model.review.ship_to_snapshot)}::jsonb,
          ${JSON.stringify(model.review.carrier_snapshot)}::jsonb,
          ${JSON.stringify(model.review.document_manifest)}::jsonb,
          ${JSON.stringify({ signatureMeaning: input.signatureMeaning, qualityReleaseValidatedAt: new Date().toISOString() })}::jsonb,
          ${input.idempotencyKey},${requestHash},${actor.userId},${actor.displayName})
        RETURNING *`)
    )[0];
    if (
      input.certificationFailurePoint === 'AFTER_AUTHORIZATION' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after shipment authorization.',
        409
      );
    for (const allocation of selected) {
      const remaining =
        Number(allocation.quantity) - Number(allocation.shipped_quantity);
      await tx.execute(sql`
        INSERT INTO project_shipment_allocation_links(
          project_id,shipment_authorization_id,product_release_id,release_allocation_id,
          serial_number,batch_lot,part_number,po_line_id,quantity)
        VALUES(${projectId},${authorization.id},${allocation.product_release_id},
          ${allocation.id},${allocation.serial_number},${allocation.batch_lot},
          ${allocation.part_number},${allocation.po_line_id},${remaining})`);
    }
    if (
      input.certificationFailurePoint === 'AFTER_ALLOCATIONS' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after shipment allocation.',
        409
      );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_SHIPMENT_AUTHORIZED',
        subjectType: 'project_shipment_authorization',
        subjectId: authorization.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          authorizationNumber,
          allocationIds,
          shipmentConfirmed: false,
          projectClosed: false,
        },
      },
      tx
    );
    return { authorization, idempotentReplay: false };
  });
}

export type ConfirmShipmentInput = {
  idempotencyKey: string;
  trackingNumber: string;
  manualTracking: boolean;
  shipDate?: string;
  certificationFailurePoint?: 'AFTER_SHIPMENT' | 'AFTER_ALLOCATIONS';
};

export async function confirmShipment(
  projectId: string,
  authorizationId: string,
  input: ConfirmShipmentInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-shipping:${projectId}`}))`
    );
    const model = await loadShippingModel(projectId, tx);
    if (model.ctx.instance.status === 'COMPLETE')
      throw new ProjectShippingCloseoutError(
        'WORKFLOW_CLOSED',
        'Normal Shipping mutations are disabled after Project Closing.',
        409
      );
    const authorization = rows(
      await tx.execute(sql`
        SELECT * FROM project_shipment_authorizations
        WHERE id=${authorizationId} AND project_id=${projectId} FOR UPDATE`)
    )[0];
    if (!authorization)
      throw new ProjectShippingCloseoutError(
        'SHIPMENT_AUTHORIZATION_NOT_FOUND',
        'Shipment authorization not found.',
        404
      );
    if (authorization.status === 'CONFIRMED') {
      const confirmationHash = digest(input);
      const storedHash =
        authorization.evidence_snapshot?.confirmationRequestHash;
      if (storedHash !== confirmationHash)
        throw new ProjectShippingCloseoutError(
          'IDEMPOTENCY_CONFLICT',
          'The confirmed shipment cannot be replayed with different evidence.',
          409
        );
      return { authorization, idempotentReplay: true };
    }
    if (authorization.status !== 'AUTHORIZED')
      throw new ProjectShippingCloseoutError(
        'SHIPMENT_NOT_CONFIRMABLE',
        'Only an authorized, non-voided shipment can be confirmed.',
        409
      );
    if (!input.trackingNumber.trim())
      throw new ProjectShippingCloseoutError(
        'TRACKING_EVIDENCE_REQUIRED',
        'Carrier tracking or controlled manual shipment evidence is required.',
        400
      );
    if (
      model.shippingHolds.some(
        (hold) =>
          hold.status === 'ACTIVE' &&
          (!hold.shipment_authorization_id ||
            String(hold.shipment_authorization_id) === authorizationId)
      )
    )
      throw new ProjectShippingCloseoutError(
        'SHIPPING_HOLD_ACTIVE',
        'An active Shipping hold blocks shipment confirmation.',
        409
      );
    const authLinks = model.links.filter(
      (entry) => String(entry.shipment_authorization_id) === authorizationId
    );
    if (!authLinks.length)
      throw new ProjectShippingCloseoutError(
        'SHIPMENT_ALLOCATIONS_REQUIRED',
        'The shipment authorization has no exact release allocations.',
        409
      );
    if (authLinks.some((entry) => entry.status !== 'AUTHORIZED'))
      throw new ProjectShippingCloseoutError(
        'ALLOCATION_ALREADY_SHIPPED',
        'A selected allocation has already been shipped.',
        409
      );
    const carrier = authorization.carrier_snapshot ?? {};
    const packages = authorization.package_snapshot ?? {};
    const shipDate = input.shipDate ? new Date(input.shipDate) : new Date();
    const shipment = rows(
      await tx.execute(sql`
        INSERT INTO shipment_records(
          reference,po_numbers,carrier,service_level,bill_type,master_tracking_number,
          package_count,total_weight_lbs,shipped_at,ship_from_snapshot,ship_to_snapshot,
          documents,created_by,notification_metadata)
        VALUES(${authorization.authorization_number},${model.ctx.project.po_number},
          ${String(carrier.carrier ?? 'MANUAL')},${String(carrier.serviceLevel ?? 'MANUAL')},
          'SENDER',${input.trackingNumber},${Number(packages.packageCount ?? 1)},
          ${Number(packages.weightLbs)},${shipDate},
          ${JSON.stringify({ source: 'configured_company_ship_from' })}::jsonb,
          ${JSON.stringify(authorization.ship_to_snapshot)}::jsonb,
          ${JSON.stringify(authorization.document_manifest)}::jsonb,
          ${actor.username},${JSON.stringify({ p2V2: true, manualTracking: input.manualTracking })}::jsonb)
        RETURNING *`)
    )[0];
    if (
      input.certificationFailurePoint === 'AFTER_SHIPMENT' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after authoritative shipment creation.',
        409
      );
    await tx.execute(sql`
      UPDATE project_shipment_allocation_links
      SET status='SHIPPED',shipped_at=${shipDate}
      WHERE shipment_authorization_id=${authorizationId} AND status='AUTHORIZED'`);
    if (
      input.certificationFailurePoint === 'AFTER_ALLOCATIONS' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after allocation consumption.',
        409
      );
    const serials = authLinks
      .map((entry) => entry.serial_number)
      .filter(Boolean);
    if (serials.length)
      await tx.execute(sql`
        UPDATE p2_serialized_items
        SET current_department='Shipping',
          metadata=COALESCE(metadata,'{}'::jsonb) || ${JSON.stringify({
            p2V2ShipmentId: shipment.id,
            trackingNumber: input.trackingNumber,
            shippedAt: shipDate.toISOString(),
          })}::jsonb,
          updated_at=now()
        WHERE po_id=${model.ctx.project.po_id}
          AND COALESCE(customer_serial_number,serial_number) IN (${sql.join(
            serials.map((serial) => sql`${serial}`),
            sql`,`
          )})`);
    const confirmationHash = digest(input);
    await tx.execute(sql`
      UPDATE project_shipment_authorizations
      SET status='CONFIRMED',authoritative_shipment_id=${shipment.id},
        confirmed_by=${actor.userId},confirmed_by_display_name=${actor.displayName},
        confirmed_at=${shipDate},
        evidence_snapshot=evidence_snapshot || ${JSON.stringify({
          confirmationRequestHash: confirmationHash,
          trackingNumber: input.trackingNumber,
          manualTracking: input.manualTracking,
        })}::jsonb
      WHERE id=${authorizationId}`);
    for (const releaseId of [
      ...new Set(authLinks.map((entry) => String(entry.product_release_id))),
    ])
      await tx.execute(sql`
        UPDATE project_product_releases r SET shipping_status=
          CASE WHEN NOT EXISTS(
            SELECT 1 FROM project_product_release_allocations a
            WHERE a.product_release_id=r.id
              AND COALESCE((SELECT sum(l.quantity)
                FROM project_shipment_allocation_links l
                WHERE l.release_allocation_id=a.id
                  AND l.status IN ('SHIPPED','DELIVERED')),0) < a.quantity
          ) THEN 'CONSUMED' ELSE 'PARTIALLY_CONSUMED' END
        WHERE r.id=${releaseId}`);
    const remaining = model.allocations.some(
      (entry) =>
        !authLinks.some(
          (link) => String(link.release_allocation_id) === String(entry.id)
        ) && Number(entry.quantity) > Number(entry.shipped_quantity)
    );
    await tx.execute(sql`
      UPDATE project_shipping_reviews
      SET status=${remaining ? 'PARTIALLY_SHIPPED' : 'SHIPPED'},updated_at=now()
      WHERE id=${authorization.shipping_review_id}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_SHIPMENT_CONFIRMED',
        subjectType: 'shipment_record',
        subjectId: shipment.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          authorizationId,
          allocationIds: authLinks.map((entry) => entry.release_allocation_id),
          trackingNumber: input.trackingNumber,
          projectClosed: false,
          poClosed: false,
        },
      },
      tx
    );
    return {
      shipment,
      authorization: rows(
        await tx.execute(sql`
          SELECT * FROM project_shipment_authorizations WHERE id=${authorizationId}`)
      )[0],
      idempotentReplay: false,
    };
  });
}

export type DeliveryInput = {
  status: 'DELIVERED' | 'DELIVERY_EXCEPTION' | 'RETURNED';
  deliveredAt?: string;
  evidenceSource: 'CARRIER' | 'MANUAL_POD' | 'CUSTOMER_CONFIRMATION';
  proofOfDeliveryReference?: string;
  exception?: string;
  certificationFailurePoint?: 'AFTER_DELIVERY';
};

export async function recordDelivery(
  projectId: string,
  authorizationId: string,
  input: DeliveryInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await loadShippingModel(projectId, tx);
    if (model.ctx.instance.status === 'COMPLETE')
      throw new ProjectShippingCloseoutError(
        'WORKFLOW_CLOSED',
        'Record delivery before Project Closing or reopen through controlled authority.',
        409
      );
    const authorization = rows(
      await tx.execute(sql`
        SELECT * FROM project_shipment_authorizations
        WHERE id=${authorizationId} AND project_id=${projectId} FOR UPDATE`)
    )[0];
    if (!authorization)
      throw new ProjectShippingCloseoutError(
        'SHIPMENT_AUTHORIZATION_NOT_FOUND',
        'Shipment authorization not found.',
        404
      );
    if (
      !['CONFIRMED', 'DELIVERY_EXCEPTION', 'RETURNED'].includes(
        authorization.status
      )
    )
      throw new ProjectShippingCloseoutError(
        'CONFIRMED_SHIPMENT_REQUIRED',
        'Delivery evidence requires a confirmed physical shipment.',
        409
      );
    if (input.status === 'DELIVERED' && !input.proofOfDeliveryReference?.trim())
      throw new ProjectShippingCloseoutError(
        'PROOF_OF_DELIVERY_REQUIRED',
        'A tracking number alone is not proof of delivery.',
        400
      );
    if (input.status === 'DELIVERY_EXCEPTION' && !input.exception?.trim())
      throw new ProjectShippingCloseoutError(
        'DELIVERY_EXCEPTION_REQUIRED',
        'Describe the delivery exception.',
        400
      );
    const occurredAt = input.deliveredAt
      ? new Date(input.deliveredAt)
      : new Date();
    await tx.execute(sql`
      UPDATE project_shipment_authorizations SET status=${input.status},
        delivered_at=${input.status === 'DELIVERED' ? occurredAt : null},
        delivery_evidence_source=${input.evidenceSource},
        proof_of_delivery_reference=${input.proofOfDeliveryReference ?? null},
        delivery_exception=${input.exception ?? null}
      WHERE id=${authorizationId}`);
    await tx.execute(sql`
      UPDATE project_shipment_allocation_links
      SET status=${input.status === 'DELIVERED' ? 'DELIVERED' : input.status === 'RETURNED' ? 'RETURNED' : 'SHIPPED'},
        delivered_at=${input.status === 'DELIVERED' ? occurredAt : null}
      WHERE shipment_authorization_id=${authorizationId}`);
    if (input.status === 'DELIVERED')
      await tx.execute(sql`
        UPDATE project_shipping_reviews SET status='DELIVERED',updated_at=now()
        WHERE id=${authorization.shipping_review_id}`);
    await recordAuditEvent(
      {
        eventType: `P2_V2_${input.status}`,
        subjectType: 'project_shipment_authorization',
        subjectId: authorizationId,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, ...input, occurredAt: occurredAt.toISOString() },
      },
      tx
    );
    if (
      input.certificationFailurePoint === 'AFTER_DELIVERY' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after delivery/POD confirmation.',
        409
      );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function placeShippingHold(
  projectId: string,
  input: {
    scope: string;
    reason: string;
    reviewId?: string;
    authorizationId?: string;
    releaseId?: string;
  },
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await loadContext(projectId, tx, true);
    const hold = rows(
      await tx.execute(sql`
        INSERT INTO project_shipping_holds(project_id,shipping_review_id,
          shipment_authorization_id,product_release_id,scope,reason,placed_by,
          placed_by_display_name)
        VALUES(${projectId},${input.reviewId ?? null},${input.authorizationId ?? null},
          ${input.releaseId ?? null},${input.scope},${input.reason},${actor.userId},
          ${actor.displayName}) RETURNING *`)
    )[0];
    await recordAuditEvent(
      {
        eventType: 'P2_V2_SHIPPING_HOLD_PLACED',
        subjectType: 'project_shipping_hold',
        subjectId: hold.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, scope: input.scope, reason: input.reason },
      },
      tx
    );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function releaseShippingHold(
  projectId: string,
  holdId: string,
  releaseAuthorization: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await loadContext(projectId, tx, true);
    const updated = rows(
      await tx.execute(sql`
        UPDATE project_shipping_holds SET status='RELEASED',disposition=${releaseAuthorization},
          released_by=${actor.userId},released_by_display_name=${actor.displayName},
          release_authorization=${releaseAuthorization},released_at=now()
        WHERE id=${holdId} AND project_id=${projectId} AND status='ACTIVE'
        RETURNING *`)
    )[0];
    if (!updated)
      throw new ProjectShippingCloseoutError(
        'SHIPPING_HOLD_NOT_ACTIVE',
        'The Shipping hold was not found or is no longer active.',
        409
      );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function voidShipmentAuthorization(
  projectId: string,
  authorizationId: string,
  reason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const authorization = rows(
      await tx.execute(sql`
        SELECT * FROM project_shipment_authorizations
        WHERE id=${authorizationId} AND project_id=${projectId} FOR UPDATE`)
    )[0];
    if (!authorization)
      throw new ProjectShippingCloseoutError(
        'SHIPMENT_AUTHORIZATION_NOT_FOUND',
        'Shipment authorization not found.',
        404
      );
    if (authorization.status !== 'AUTHORIZED')
      throw new ProjectShippingCloseoutError(
        'PHYSICAL_SHIPMENT_CANNOT_BE_VOIDED',
        'Only pre-shipment authorization may be voided. Use return, recall, escape, or delivery-exception controls after physical shipment.',
        409
      );
    await tx.execute(sql`
      UPDATE project_shipment_authorizations SET status='VOIDED',void_reason=${reason},
        voided_by=${actor.userId},voided_by_display_name=${actor.displayName},voided_at=now()
      WHERE id=${authorizationId}`);
    await tx.execute(sql`
      UPDATE project_shipment_allocation_links SET status='VOIDED'
      WHERE shipment_authorization_id=${authorizationId} AND status='AUTHORIZED'`);
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export type CloseoutReviewInput = {
  expectedLockVersion?: number;
  deliveryRequired: boolean;
  financeTransferredOrComplete: boolean;
  financeDisposition?: string;
  productionReconciled: boolean;
  qualityReconciled: boolean;
  supplierAndPropertyReconciled: boolean;
  openActions: Array<{ action: string; owner: string; status: string }>;
  documentArchiveManifest: Array<{
    documentId: string;
    documentNumber: string;
    revision: string;
    status: string;
    checksum?: string;
    inclusionReason: string;
  }>;
};

async function closeoutReadiness(
  projectId: string,
  input: CloseoutReviewInput,
  tx: Executor
) {
  const model = await loadShippingModel(projectId, tx);
  const authorizedQuantity = rows(
    await tx.execute(sql`
      SELECT COALESCE(sum(quantity),0) quantity
      FROM p2_purchase_order_items WHERE po_id=${model.ctx.project.po_id}`)
  )[0];
  const releasedQuantity = model.allocations.reduce(
    (sum, entry) => sum + Number(entry.quantity),
    0
  );
  const shippedQuantity = model.links
    .filter((entry) => ['SHIPPED', 'DELIVERED'].includes(entry.status))
    .reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const deliveredQuantity = model.links
    .filter((entry) => entry.status === 'DELIVERED')
    .reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const activeReleaseHolds = model.releases.filter(
    (entry) => entry.held
  ).length;
  const activeShippingHolds = model.shippingHolds.filter(
    (entry) => entry.status === 'ACTIVE'
  ).length;
  const deliveryExceptions = model.authorizations.filter(
    (entry) => entry.status === 'DELIVERY_EXCEPTION'
  ).length;
  const unresolvedActions = input.openActions.filter(
    (entry) => !['CLOSED', 'TRANSFERRED', 'COMPLETE'].includes(entry.status)
  ).length;
  const rules = evaluateCloseoutReadiness({
    stage8Complete: model.ctx.productionStep?.status === 'COMPLETE',
    stage9Complete: model.ctx.qualityStep?.status === 'COMPLETE',
    authorizedQuantity: Number(authorizedQuantity?.quantity ?? 0),
    releasedQuantity,
    shippedQuantity,
    deliveredQuantity,
    deliveryRequired: input.deliveryRequired,
    activeHolds: activeReleaseHolds + activeShippingHolds,
    deliveryExceptions,
    unresolvedActions,
    archiveDocumentCount: input.documentArchiveManifest.length,
    financeTransferredOrComplete: input.financeTransferredOrComplete,
  });
  if (!input.productionReconciled)
    rules.blockers.push('Production reconciliation is not confirmed.');
  if (!input.qualityReconciled)
    rules.blockers.push('Quality reconciliation is not confirmed.');
  if (!input.supplierAndPropertyReconciled)
    rules.blockers.push(
      'Supplier and customer-property reconciliation is not confirmed.'
    );
  rules.ready = rules.blockers.length === 0;
  rules.status = rules.ready ? 'READY_FOR_CLOSEOUT_REVIEW' : 'BLOCKED';
  return {
    model,
    rules,
    reconciliation: {
      authorizedQuantity: Number(authorizedQuantity?.quantity ?? 0),
      releasedQuantity,
      shippedQuantity,
      deliveredQuantity,
      deliveryRequired: input.deliveryRequired,
      productionReconciled: input.productionReconciled,
      qualityReconciled: input.qualityReconciled,
      supplierAndPropertyReconciled: input.supplierAndPropertyReconciled,
      financeTransferredOrComplete: input.financeTransferredOrComplete,
      financeDisposition: input.financeDisposition,
      activeReleaseHolds,
      activeShippingHolds,
      deliveryExceptions,
    },
  };
}

export async function saveCloseoutReview(
  projectId: string,
  input: CloseoutReviewInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-closeout:${projectId}`}))`
    );
    const readiness = await closeoutReadiness(projectId, input, tx);
    if (readiness.model.ctx.instance.status === 'COMPLETE')
      throw new ProjectShippingCloseoutError(
        'WORKFLOW_CLOSED',
        'Use controlled Reopen instead of editing closed evidence.',
        409
      );
    const current = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews WHERE project_id=${projectId}
        ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`)
    )[0];
    let closeout: Row;
    if (
      current &&
      ['IN_PROGRESS', 'BLOCKED', 'READY_FOR_CLOSEOUT_REVIEW'].includes(
        current.status
      )
    ) {
      if (
        input.expectedLockVersion == null ||
        Number(current.lock_version) !== input.expectedLockVersion
      )
        throw new ProjectShippingCloseoutError(
          'STALE_WRITE',
          'The closeout review is stale.',
          409
        );
      closeout = rows(
        await tx.execute(sql`
          UPDATE project_closeout_reviews SET status=${readiness.rules.status},
            lock_version=lock_version+1,
            reconciliation_snapshot=${JSON.stringify(readiness.reconciliation)}::jsonb,
            document_archive_manifest=${JSON.stringify(input.documentArchiveManifest)}::jsonb,
            open_action_snapshot=${JSON.stringify(input.openActions)}::jsonb,
            blockers=${JSON.stringify(readiness.rules.blockers)}::jsonb,updated_at=now()
          WHERE id=${current.id} AND lock_version=${input.expectedLockVersion}
          RETURNING *`)
      )[0];
    } else {
      const revision = Number(current?.revision_number ?? 0) + 1;
      closeout = rows(
        await tx.execute(sql`
          INSERT INTO project_closeout_reviews(project_id,workflow_instance_id,
            workflow_step_instance_id,revision_number,status,reconciliation_snapshot,
            document_archive_manifest,open_action_snapshot,blockers,created_by,
            created_by_display_name,supersedes_closeout_id)
          VALUES(${projectId},${readiness.model.ctx.instance.id},
            ${readiness.model.ctx.shippingStep.id},${revision},${readiness.rules.status},
            ${JSON.stringify(readiness.reconciliation)}::jsonb,
            ${JSON.stringify(input.documentArchiveManifest)}::jsonb,
            ${JSON.stringify(input.openActions)}::jsonb,
            ${JSON.stringify(readiness.rules.blockers)}::jsonb,
            ${actor.userId},${actor.displayName},
            ${current?.status === 'REOPENED' ? current.id : null})
          RETURNING *`)
      )[0];
    }
    await recordAuditEvent(
      {
        eventType: 'P2_V2_CLOSEOUT_REVIEW_SAVED',
        subjectType: 'project_closeout_review',
        subjectId: closeout.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          revision: closeout.revision_number,
          blockers: readiness.rules.blockers,
        },
      },
      tx
    );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function submitCloseoutReview(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const current = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews WHERE project_id=${projectId}
        ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`)
    )[0];
    if (!current || current.status !== 'READY_FOR_CLOSEOUT_REVIEW')
      throw new ProjectShippingCloseoutError(
        'CLOSEOUT_NOT_READY',
        'Resolve all closeout blockers before submission.',
        409
      );
    if (Number(current.lock_version) !== expectedLockVersion)
      throw new ProjectShippingCloseoutError(
        'STALE_WRITE',
        'The closeout review is stale.',
        409
      );
    await tx.execute(sql`
      UPDATE project_closeout_reviews SET status='PENDING_APPROVAL',
        lock_version=lock_version+1,submitted_at=now(),updated_at=now()
      WHERE id=${current.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_CLOSEOUT_SUBMITTED',
        subjectType: 'project_closeout_review',
        subjectId: current.id,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, revision: current.revision_number },
      },
      tx
    );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function decideCloseoutReview(
  projectId: string,
  expectedLockVersion: number,
  approvalType: string,
  decision: string,
  signatureMeaning: string,
  reason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const closeout = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews WHERE project_id=${projectId}
        ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`)
    )[0];
    if (!closeout || closeout.status !== 'PENDING_APPROVAL')
      throw new ProjectShippingCloseoutError(
        'CLOSEOUT_NOT_PENDING_APPROVAL',
        'Submit the current closeout revision before approval.',
        409
      );
    if (Number(closeout.lock_version) !== expectedLockVersion)
      throw new ProjectShippingCloseoutError(
        'STALE_WRITE',
        'The closeout review is stale.',
        409
      );
    const actorApproval = rows(
      await tx.execute(sql`
        SELECT approval_type FROM project_closeout_approvals
        WHERE closeout_review_id=${closeout.id} AND actor_user_id=${actor.userId}
          AND decision='APPROVED' AND approval_type<>${approvalType}`)
    )[0];
    if (decision === 'APPROVED' && actorApproval)
      throw new ProjectShippingCloseoutError(
        'SEGREGATION_OF_DUTIES_REQUIRED',
        `The actor already approved ${actorApproval.approval_type}; a separate approver is required.`,
        409
      );
    await tx.execute(sql`
      INSERT INTO project_closeout_approvals(project_id,closeout_review_id,
        closeout_revision,approval_type,decision,signature_meaning,reason,
        evidence_snapshot_hash,actor_user_id,actor_employee_id,actor_display_name,actor_role)
      VALUES(${projectId},${closeout.id},${closeout.revision_number},${approvalType},
        ${decision},${signatureMeaning},${reason},
        ${digest(closeout.reconciliation_snapshot)},${actor.userId},
        ${actor.employeeId ?? null},${actor.displayName},${actor.role})
      ON CONFLICT(closeout_review_id,approval_type) DO UPDATE SET
        decision=EXCLUDED.decision,signature_meaning=EXCLUDED.signature_meaning,
        reason=EXCLUDED.reason,evidence_snapshot_hash=EXCLUDED.evidence_snapshot_hash,
        actor_user_id=EXCLUDED.actor_user_id,actor_employee_id=EXCLUDED.actor_employee_id,
        actor_display_name=EXCLUDED.actor_display_name,actor_role=EXCLUDED.actor_role,
        decided_at=now()`);
    await tx.execute(sql`
      UPDATE project_closeout_reviews SET lock_version=lock_version+1,updated_at=now()
      WHERE id=${closeout.id} AND lock_version=${expectedLockVersion}`);
    return getShippingCloseoutDashboard(projectId, tx);
  });
}

export async function closeProject(
  projectId: string,
  input: {
    expectedLockVersion: number;
    idempotencyKey: string;
    signatureMeaning: string;
    certificationFailurePoint?: 'AFTER_CLOSE';
  },
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-closeout:${projectId}`}))`
    );
    const ctx = await loadContext(projectId, tx, true);
    const requestHash = digest(input);
    const prior = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews
        WHERE project_id=${projectId} AND idempotency_key=${input.idempotencyKey}`)
    )[0];
    if (prior) {
      if (prior.request_hash !== requestHash)
        throw new ProjectShippingCloseoutError(
          'IDEMPOTENCY_CONFLICT',
          'The close idempotency key was already used for another request.',
          409
        );
      return { closeout: prior, idempotentReplay: true };
    }
    const closeout = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews WHERE project_id=${projectId}
        ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`)
    )[0];
    if (!closeout || closeout.status !== 'PENDING_APPROVAL')
      throw new ProjectShippingCloseoutError(
        'CLOSEOUT_NOT_PENDING_APPROVAL',
        'A reconciled closeout pending approvals is required.',
        409
      );
    if (Number(closeout.lock_version) !== input.expectedLockVersion)
      throw new ProjectShippingCloseoutError(
        'STALE_WRITE',
        'The closeout review is stale.',
        409
      );
    if (Array.isArray(closeout.blockers) && closeout.blockers.length)
      throw new ProjectShippingCloseoutError(
        'CLOSEOUT_BLOCKED',
        'Closeout blockers remain.',
        409,
        { blockers: closeout.blockers }
      );
    const approvals = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_approvals
        WHERE closeout_review_id=${closeout.id}`)
    );
    const required = [
      'PROJECT_MANAGEMENT',
      'QUALITY',
      'OPERATIONS',
      'SHIPPING_LOGISTICS',
    ];
    const missing = required.filter(
      (type) =>
        !approvals.some(
          (entry) =>
            entry.approval_type === type && entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectShippingCloseoutError(
        'CLOSEOUT_APPROVALS_REQUIRED',
        'All required functional approvals must be recorded.',
        409,
        { missingApprovals: missing }
      );
    if (
      ctx.productionStep?.status !== 'COMPLETE' ||
      ctx.qualityStep?.status !== 'COMPLETE'
    )
      throw new ProjectShippingCloseoutError(
        'PRIOR_STAGES_INCOMPLETE',
        'Stages 8 and 9 must remain complete and current.',
        409
      );
    await tx.execute(sql`
      UPDATE project_closeout_reviews SET status='CLOSED',
        lock_version=lock_version+1,closed_by=${actor.userId},
        closed_by_display_name=${actor.displayName},close_decision=${input.signatureMeaning},
        closed_at=now(),idempotency_key=${input.idempotencyKey},
        request_hash=${requestHash},updated_at=now()
      WHERE id=${closeout.id} AND lock_version=${input.expectedLockVersion}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_instances SET status='COMPLETE',
        completed_at=now(),completed_by=${actor.employeeId ?? null},
        completed_by_display_name=${actor.displayName},updated_at=now()
      WHERE id=${ctx.shippingStep.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_instances SET status='COMPLETE',completed_at=now(),updated_at=now()
      WHERE id=${ctx.instance.id}`);
    await tx.execute(sql`
      UPDATE projects SET status='completed',current_stage='PROJECT_CLOSED',
        actual_ship_date=COALESCE(actual_ship_date,CURRENT_DATE),stage_updated_at=now(),updated_at=now()
      WHERE id=${projectId}`);
    await tx.execute(sql`
      UPDATE p2_purchase_orders SET status='CLOSED',updated_at=now()
      WHERE id=${ctx.project.po_id}`);
    await tx.execute(sql`
      INSERT INTO project_closeout_events(project_id,closeout_review_id,event_type,
        reason,responsible_owner,actor_user_id,actor_display_name,evidence_snapshot)
      VALUES(${projectId},${closeout.id},'CLOSED',${input.signatureMeaning},
        ${actor.displayName},${actor.userId},${actor.displayName},
        ${JSON.stringify({
          reconciliation: closeout.reconciliation_snapshot,
          archive: closeout.document_archive_manifest,
          approvals,
        })}::jsonb)`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PROJECT_CLOSED',
        subjectType: 'project',
        subjectId: projectId,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          workflowInstanceId: ctx.instance.id,
          closeoutRevision: closeout.revision_number,
          projectStatus: 'completed',
          poStatus: 'CLOSED',
        },
      },
      tx
    );
    if (
      input.certificationFailurePoint === 'AFTER_CLOSE' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after project closing.',
        409
      );
    return {
      closeout: rows(
        await tx.execute(sql`
          SELECT * FROM project_closeout_reviews WHERE id=${closeout.id}`)
      )[0],
      idempotentReplay: false,
    };
  });
}

export async function reopenProject(
  projectId: string,
  input: {
    reason: string;
    responsibleOwner: string;
    certificationFailurePoint?: 'AFTER_REOPEN';
  },
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-closeout:${projectId}`}))`
    );
    const ctx = await loadContext(projectId, tx, true);
    if (
      ctx.instance.status !== 'COMPLETE' ||
      ctx.project.status !== 'completed'
    )
      throw new ProjectShippingCloseoutError(
        'CLOSED_PROJECT_REQUIRED',
        'Only a controlled closed p2_v2 project can be reopened.',
        409
      );
    const closed = rows(
      await tx.execute(sql`
        SELECT * FROM project_closeout_reviews
        WHERE project_id=${projectId} AND status='CLOSED'
        ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`)
    )[0];
    if (!closed)
      throw new ProjectShippingCloseoutError(
        'IMMUTABLE_CLOSURE_REQUIRED',
        'The immutable closure evidence was not found.',
        409
      );
    await tx.execute(sql`
      UPDATE project_closeout_reviews SET status='REOPENED',reopened_at=now(),
        reopen_reason=${input.reason},responsible_owner=${input.responsibleOwner},updated_at=now()
      WHERE id=${closed.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_instances SET status='ACTIVE',completed_at=NULL,updated_at=now()
      WHERE id=${ctx.instance.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_instances SET status='IN_PROGRESS',
        completed_at=NULL,completed_by=NULL,completed_by_display_name=NULL,updated_at=now()
      WHERE id=${ctx.shippingStep.id}`);
    await tx.execute(sql`
      UPDATE projects SET status='active',current_stage='SHIPPING_CLOSEOUT_REOPENED',
        stage_updated_at=now(),updated_at=now() WHERE id=${projectId}`);
    await tx.execute(sql`
      UPDATE p2_purchase_orders SET status='IN_PROGRESS',updated_at=now()
      WHERE id=${ctx.project.po_id}`);
    await tx.execute(sql`
      INSERT INTO project_closeout_events(project_id,closeout_review_id,event_type,
        reason,responsible_owner,actor_user_id,actor_display_name,evidence_snapshot)
      VALUES(${projectId},${closed.id},'REOPENED',${input.reason},
        ${input.responsibleOwner},${actor.userId},${actor.displayName},
        ${JSON.stringify({ originalClosedAt: closed.closed_at, originalCloseDecision: closed.close_decision })}::jsonb)`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PROJECT_REOPENED',
        subjectType: 'project',
        subjectId: projectId,
        sourceService: 'projectShippingCloseoutService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          closeoutId: closed.id,
          reason: input.reason,
          responsibleOwner: input.responsibleOwner,
          shippedAllocationsReopened: false,
        },
      },
      tx
    );
    if (
      input.certificationFailurePoint === 'AFTER_REOPEN' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectShippingCloseoutError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after controlled reopening.',
        409
      );
    return getShippingCloseoutDashboard(projectId, tx);
  });
}
