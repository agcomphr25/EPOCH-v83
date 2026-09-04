import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';

// Raw SQL keeps the authoritative P2 tables as the source of truth without
// creating a second schema model in Project Workflow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Actor = {
  userId: number;
  username: string;
  displayName: string;
  role: string;
};
const rows = <T extends Row>(result: unknown): T[] =>
  Array.isArray(result)
    ? (result as T[])
    : ((result as { rows?: T[] })?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class ProjectP2HandoffError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

async function context(projectId: string, tx: AuditLedgerTx, lock = false) {
  const project = rows(
    await tx.execute(
      sql`SELECT id,project_code,workflow_version,po_id,current_stage,status FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  )[0];
  if (!project)
    throw new ProjectP2HandoffError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  if (project.workflow_version !== 'p2_v2')
    throw new ProjectP2HandoffError(
      'P2_V2_REQUIRED',
      'P2 handoff is available only for p2_v2 projects.',
      409
    );
  const instances = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id=${projectId} AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (instances.length !== 1)
    throw new ProjectP2HandoffError(
      'WORKFLOW_INSTANCE_REQUIRED',
      'Exactly one active P2 V2 workflow instance is required.',
      409
    );
  const instance = instances[0];
  if (Number(instance.definition_version) !== 3)
    throw new ProjectP2HandoffError(
      'P2_HANDOFF_DEFINITION_REQUIRED',
      'P2 Control Center handoff is available only for prospective definition version 3.',
      409
    );
  const steps = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instance.id} ORDER BY step_order`
    )
  );
  if (validateWorkflowInstanceIntegrity(instance, steps).length)
    throw new ProjectP2HandoffError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The workflow instance failed immutable-definition validation.',
      409
    );
  const handoffStep = steps.find((step) => step.step_type === 'p2_release');
  const executionStep = steps.find((step) => step.step_type === 'p2_execution');
  const closingStep = steps.find(
    (step) => step.step_type === 'project_closing'
  );
  if (!handoffStep || !executionStep || !closingStep)
    throw new ProjectP2HandoffError(
      'P2_HANDOFF_STAGES_REQUIRED',
      'The prospective P2 handoff stages are incomplete.',
      409
    );
  return { project, instance, handoffStep, executionStep, closingStep };
}

async function currentApprovalEvidence(projectId: string, tx: AuditLedgerTx) {
  const release = rows(
    await tx.execute(
      sql`SELECT pr.*,rr.status readiness_status,rr.source_stage_revisions,wa.status wad_status,pp.status plan_status FROM project_production_releases pr JOIN project_preproduction_readiness_reviews rr ON rr.id=pr.readiness_review_id JOIN project_wad_authorizations wa ON wa.id=pr.wad_authorization_id JOIN project_production_plans pp ON pp.id=pr.production_plan_id WHERE pr.project_id=${projectId} AND pr.status='APPROVED' FOR SHARE`
    )
  )[0];
  if (!release)
    throw new ProjectP2HandoffError(
      'PRODUCTION_RELEASE_APPROVAL_REQUIRED',
      'Approve Production Release before releasing the order to P2.',
      409
    );
  if (
    release.readiness_status !== 'COMPLETE' ||
    release.wad_status !== 'RELEASED' ||
    release.plan_status !== 'RELEASED'
  )
    throw new ProjectP2HandoffError(
      'PRODUCTION_RELEASE_EVIDENCE_STALE',
      'Production-release evidence changed after approval.',
      409
    );
  return {
    productionReleaseId: release.id,
    readinessReviewId: release.readiness_review_id,
    readinessRevision: Number(release.readiness_revision),
    wadAuthorizationId: release.wad_authorization_id,
    wadRevision: Number(release.wad_revision),
    productionPlanId: release.production_plan_id,
    productionPlanRevision: Number(release.production_plan_revision),
    configurationBaselineId: release.configuration_baseline_id,
    effectivityReference: release.effectivity_reference,
    sourceStageRevisions: release.source_stage_revisions,
    approvalSnapshot: release.evidence_snapshot,
  };
}

export async function releaseToP2ControlCenter(
  projectId: string,
  input: {
    idempotencyKey: string;
    confirmation: string;
    signatureMeaning: string;
  },
  actor: Actor
) {
  if (input.confirmation !== 'RELEASE TO P2 CONTROL CENTER')
    throw new ProjectP2HandoffError(
      'CONFIRMATION_REQUIRED',
      'Type RELEASE TO P2 CONTROL CENTER to confirm this consequential action.'
    );
  if (!input.idempotencyKey.trim())
    throw new ProjectP2HandoffError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required.'
    );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-control-center-release:${projectId}`}))`
    );
    const ctx = await context(projectId, tx, true);
    const prior = rows(
      await tx.execute(
        sql`SELECT * FROM project_p2_control_center_releases WHERE project_id=${projectId} AND status='RELEASED' FOR UPDATE`
      )
    )[0];
    if (prior) {
      if (prior.idempotency_key === input.idempotencyKey)
        return getP2ExecutionReadModel(projectId, tx);
      throw new ProjectP2HandoffError(
        'P2_ALREADY_RELEASED',
        'This order has already been released to the P2 Control Center.',
        409
      );
    }
    const poId = Number(ctx.project.po_id);
    if (!Number.isInteger(poId))
      throw new ProjectP2HandoffError(
        'LINKED_PO_REQUIRED',
        'A linked P2 purchase order is required.',
        409
      );
    const evidence = await currentApprovalEvidence(projectId, tx);
    const requestHash = digest({
      projectId,
      productionReleaseId: evidence.productionReleaseId,
      confirmation: input.confirmation,
      signatureMeaning: input.signatureMeaning,
    });
    const replay = rows(
      await tx.execute(
        sql`SELECT * FROM project_p2_control_center_releases WHERE project_id=${projectId} AND idempotency_key=${input.idempotencyKey} FOR UPDATE`
      )
    )[0];
    if (replay) {
      if (replay.request_hash !== requestHash)
        throw new ProjectP2HandoffError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used with different release evidence.',
          409
        );
      return getP2ExecutionReadModel(projectId, tx);
    }
    const beforeOrders = Number(
      rows(
        await tx.execute(
          sql`SELECT count(*)::int count FROM p2_production_orders WHERE p2_po_id=${poId}`
        )
      )[0]?.count ?? 0
    );
    const beforeTravelers = Number(
      rows(
        await tx.execute(
          sql`SELECT count(*)::int count FROM travelers WHERE project_id=${projectId}`
        )
      )[0]?.count ?? 0
    );
    const released = rows(
      await tx.execute(
        sql`INSERT INTO project_p2_control_center_releases (project_id,workflow_instance_id,workflow_step_instance_id,production_release_id,customer_po_id,definition_version,idempotency_key,request_hash,approval_evidence_snapshot,released_by,released_by_display_name,released_by_role,signature_meaning) VALUES (${projectId},${ctx.instance.id},${ctx.handoffStep.id},${evidence.productionReleaseId},${poId},3,${input.idempotencyKey},${requestHash},${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},${actor.role},${input.signatureMeaning}) RETURNING *`
      )
    )[0];
    await tx.execute(
      sql`UPDATE p2_purchase_orders SET status='RELEASED_TO_P2',updated_at=now() WHERE id=${poId}`
    );
    await tx.execute(
      sql`UPDATE projects SET current_stage='RELEASED_TO_P2',stage_updated_at=now(),updated_at=now() WHERE id=${projectId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),completed_by_display_name=${actor.displayName},revision_reference=${String(evidence.readinessRevision)},updated_at=now() WHERE id=${ctx.handoffStep.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=${ctx.executionStep.id}`
    );
    const afterOrders = Number(
      rows(
        await tx.execute(
          sql`SELECT count(*)::int count FROM p2_production_orders WHERE p2_po_id=${poId}`
        )
      )[0]?.count ?? 0
    );
    const afterTravelers = Number(
      rows(
        await tx.execute(
          sql`SELECT count(*)::int count FROM travelers WHERE project_id=${projectId}`
        )
      )[0]?.count ?? 0
    );
    if (afterOrders !== beforeOrders || afterTravelers !== beforeTravelers)
      throw new ProjectP2HandoffError(
        'DUPLICATE_EXECUTION_RECORDS',
        'P2 handoff must not create production orders or travelers.',
        409
      );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_RELEASED_TO_CONTROL_CENTER',
        subjectType: 'project_p2_control_center_release',
        subjectId: released.id,
        sourceService: 'projectP2HandoffService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          poId,
          definitionVersion: 3,
          productionReleaseId: evidence.productionReleaseId,
          productionOrdersCreated: 0,
          travelersCreated: 0,
        },
      },
      tx
    );
    return getP2ExecutionReadModel(projectId, tx);
  });
}

export async function getP2ExecutionReadModel(
  projectId: string,
  tx: AuditLedgerTx = db
) {
  const ctx = await context(projectId, tx);
  const poId = Number(ctx.project.po_id);
  const po = Number.isInteger(poId)
    ? rows(
        await tx.execute(
          sql`SELECT id,po_number,status,updated_at FROM p2_purchase_orders WHERE id=${poId}`
        )
      )[0]
    : null;
  const required = po
    ? Number(
        rows(
          await tx.execute(
            sql`SELECT COALESCE(sum(quantity),0)::numeric total FROM p2_purchase_order_items WHERE po_id=${poId}`
          )
        )[0]?.total ?? 0
      )
    : 0;
  const production = po
    ? rows(
        await tx.execute(
          sql`SELECT COALESCE(sum(quantity),0)::numeric planned,COALESCE(sum(quantity_manufactured),0)::numeric completed,COALESCE(sum(CASE WHEN status='IN_PROGRESS' THEN quantity-quantity_manufactured ELSE 0 END),0)::numeric in_production,COALESCE(sum(CASE WHEN status='CANCELLED' THEN quantity ELSE 0 END),0)::numeric dispositioned,max(updated_at) updated_at FROM p2_production_orders WHERE p2_po_id=${poId}`
        )
      )[0]
    : {};
  const accepted = po
    ? Number(
        rows(
          await tx.execute(
            sql`SELECT count(DISTINCT fi.serialized_item_id)::numeric total FROM p2_final_inspection_results fi JOIN p2_serialized_items si ON si.id=fi.serialized_item_id WHERE si.po_id=${poId} AND fi.overall_result IN ('PASS','CONDITIONAL')`
          )
        )[0]?.total ?? 0
      )
    : 0;
  const released = Number(
    rows(
      await tx.execute(
        sql`SELECT COALESCE(sum(released_quantity),0)::numeric total FROM project_product_releases WHERE project_id=${projectId} AND release_decision='RELEASED'`
      )
    )[0]?.total ?? 0
  );
  const shipped = Number(
    rows(
      await tx.execute(
        sql`SELECT COALESCE(sum(quantity),0)::numeric total FROM project_shipment_allocation_links WHERE project_id=${projectId} AND status IN ('SHIPPED','DELIVERED')`
      )
    )[0]?.total ?? 0
  );
  const productionHolds = Number(
    rows(
      await tx.execute(
        sql`SELECT count(*)::int count FROM project_production_holds WHERE project_id=${projectId} AND status='ACTIVE'`
      )
    )[0]?.count ?? 0
  );
  const qualityHolds = Number(
    rows(
      await tx.execute(
        sql`SELECT count(*)::int count FROM project_product_release_holds WHERE project_id=${projectId} AND status='ACTIVE'`
      )
    )[0]?.count ?? 0
  );
  const shippingHolds = Number(
    rows(
      await tx.execute(
        sql`SELECT count(*)::int count FROM project_shipping_holds WHERE project_id=${projectId} AND status='ACTIVE'`
      )
    )[0]?.count ?? 0
  );
  const openNcrs = po
    ? Number(
        rows(
          await tx.execute(
            sql`SELECT count(*)::int count FROM nonconformance_records WHERE po_number=${String(po.po_number)} AND COALESCE(status,'Open') NOT IN ('Resolved','Closed')`
          )
        )[0]?.count ?? 0
      )
    : 0;
  const handoff = rows(
    await tx.execute(
      sql`SELECT * FROM project_p2_control_center_releases WHERE project_id=${projectId} AND status='RELEASED'`
    )
  )[0];
  const completed = Number(production?.completed ?? 0);
  const dispositioned = Number(production?.dispositioned ?? 0);
  const deliveryRequired = Math.max(0, required - dispositioned);
  const pending = Math.max(0, required - completed - dispositioned);
  const certificationsComplete = released >= deliveryRequired && required > 0;
  const shipmentComplete = shipped >= deliveryRequired && required > 0;
  const noHolds =
    productionHolds + qualityHolds + shippingHolds + openNcrs === 0;
  const executionComplete =
    completed + dispositioned >= required &&
    released >= deliveryRequired &&
    shipmentComplete &&
    certificationsComplete &&
    noHolds;
  const state = !handoff
    ? 'Not Released'
    : !noHolds
      ? qualityHolds || openNcrs
        ? 'Quality Hold'
        : 'Blocked'
      : shipped > 0 && !shipmentComplete
        ? 'Partially Shipped'
        : shipmentComplete
          ? 'Shipped'
          : released >= deliveryRequired && required > 0
            ? 'Released by Quality'
            : completed >= required && required > 0
              ? 'Awaiting Product Release'
              : Number(production?.in_production ?? 0) > 0
                ? 'In Production'
                : Number(production?.planned ?? 0) > 0
                  ? 'Scheduled'
                  : 'Released to P2';
  const p2ControlCenterLink = (
    tab: 'status' | 'production' | 'production-map'
  ) => {
    const params = new URLSearchParams({ tab, projectId });
    if (po?.id != null) params.set('poId', String(po.id));
    if (po?.po_number) params.set('po', String(po.po_number));
    return `/p2-control-center?${params.toString()}`;
  };
  const dailyTagUpParams = new URLSearchParams({ projectId });
  if (po?.po_number) dailyTagUpParams.set('customerPo', String(po.po_number));
  const workOrderQueueParams = new URLSearchParams({ projectId });
  if (po?.id != null) workOrderQueueParams.set('poId', String(po.id));
  if (po?.po_number) workOrderQueueParams.set('po', String(po.po_number));
  return {
    projectId,
    definitionVersion: 3,
    p2PoId: po?.id ?? null,
    p2PoNumber: po?.po_number ?? null,
    state,
    currentP2Status: po?.status ?? 'NOT_RELEASED',
    quantityRequired: required,
    quantityPending: pending,
    quantityInProduction: Number(production?.in_production ?? 0),
    quantityCompleted: completed,
    quantityDispositioned: dispositioned,
    quantityAcceptedByQuality: accepted,
    quantityReleased: released,
    quantityShipped: shipped,
    productionHolds,
    qualityHolds,
    shippingHolds,
    openNcrs,
    certificationStatus: certificationsComplete ? 'Complete' : 'Incomplete',
    shippingStatus: shipmentComplete
      ? 'Complete'
      : shipped > 0
        ? 'Partial'
        : 'Not shipped',
    executionComplete,
    closingUnlocked: executionComplete,
    blockers: [
      productionHolds && `${productionHolds} production hold(s)`,
      qualityHolds && `${qualityHolds} quality hold(s)`,
      shippingHolds && `${shippingHolds} shipping hold(s)`,
      openNcrs && `${openNcrs} open NCR(s)`,
      pending && `${pending} unit(s) not complete`,
      released < deliveryRequired &&
        `${deliveryRequired - released} unit(s) not released or dispositioned`,
      shipped < deliveryRequired &&
        `${deliveryRequired - shipped} unit(s) not shipped or dispositioned`,
    ].filter(Boolean),
    nextAction: !handoff
      ? 'Approve Production Release, then release the order to P2.'
      : executionComplete
        ? 'P2 execution is complete; continue to Project Closing.'
        : 'Continue work in the P2 Control Center and resolve the listed blockers.',
    lastAuthoritativeUpdate:
      production?.updated_at ?? po?.updated_at ?? handoff?.released_at ?? null,
    links: {
      controlCenter: p2ControlCenterLink('status'),
      production: p2ControlCenterLink('production'),
      productionMap: p2ControlCenterLink('production-map'),
      projectProduction: `/projects/${encodeURIComponent(projectId)}?tab=production`,
      pmControlCenter: `/pm-control-center?project=${encodeURIComponent(projectId)}`,
      dailyTagUp: `/daily-tag-up?${dailyTagUpParams.toString()}`,
      p2WorkOrderQueues: `/p2-work-orders/queues/all?${workOrderQueueParams.toString()}`,
    },
  };
}
