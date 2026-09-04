import { createHash } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { productionWorkOrders } from '../../schema';
import { evaluateDocumentationRequirements } from '../lib/documentationRequirementsEngine';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';

type Executor = AuditLedgerTx;
type ReleaseTx = AuditLedgerTx & Pick<typeof db, 'update'>;
type Row = Record<string, unknown>;

export const HISTORIC_P2_COMPATIBILITY_RELEASE =
  'HISTORIC_P2_COMPATIBILITY_RELEASE' as const;

export type HistoricP2ReleaseAuthorityMode =
  'HISTORIC_P2_COMPATIBILITY' | 'P2_V2' | 'UNRELATED_LEGACY' | 'UNKNOWN';

export type ManufacturingOrderReleaseAuthority =
  'P2_V2' | 'HISTORIC_P2' | 'UNRELATED_LEGACY';

export type HistoricP2ReleaseActor = {
  userId: number;
  employeeId?: number | null;
  displayName: string;
  role: string;
};

export type HistoricP2ReleaseEvidence = {
  key: string;
  label: string;
  passed: boolean;
  referenceIds?: string[];
};

export type HistoricP2ReleaseBlocker = {
  code: string;
  message: string;
};

export type HistoricP2ManufacturingReleaseEligibility = {
  authorityMode: HistoricP2ReleaseAuthorityMode;
  eligible: boolean;
  alreadyReleased: boolean;
  project: {
    id: string;
    projectCode: string;
    storedWorkflowVersion: string | null;
    effectiveWorkflowVersion: string | null;
    status: string;
    currentStage: string;
    linkedP2PoId: number | null;
  } | null;
  workOrder: {
    id: string;
    projectId: string;
    workOrderNumber: string;
    partNumber: string;
    status: string;
    wadStatus: string;
  } | null;
  evidence: HistoricP2ReleaseEvidence[];
  blockers: HistoricP2ReleaseBlocker[];
};

export class HistoricP2ManufacturingReleaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'HistoricP2ManufacturingReleaseError';
  }
}

const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);

const clean = (value: unknown): string => String(value ?? '').trim();
const normalized = (value: unknown): string => clean(value).toLowerCase();
const reference = (type: string, id: unknown): string => `${type}:${clean(id)}`;
const evidenceDigest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const releaseLockIdentity = (workOrderId: string): string =>
  `${workOrderId}:manufacturing-order-release`;

async function withSerializableReleaseRetry<T>(
  operation: (tx: ReleaseTx) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.transaction((tx) => operation(tx as ReleaseTx), {
        isolationLevel: 'serializable',
      });
    } catch (error: unknown) {
      lastError = error;
      const postgresError = error as {
        code?: string;
        constraint?: string;
      } | null;
      const retryableAuditChainRace =
        postgresError?.code === '23505' &&
        postgresError.constraint === 'audit_events_sequence_number_uidx';
      if (
        (postgresError?.code !== '40001' && !retryableAuditChainRace) ||
        attempt === maxAttempts
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw lastError;
}

function addBlocker(
  blockers: HistoricP2ReleaseBlocker[],
  code: string,
  message: string
) {
  if (!blockers.some((blocker) => blocker.code === code)) {
    blockers.push({ code, message });
  }
}

function classifyReleaseAuthority(
  workflowVersion: string,
  poId: unknown,
  hasP2OrderLink: unknown
): ManufacturingOrderReleaseAuthority {
  if (workflowVersion === 'p2_v2') return 'P2_V2';
  return poId != null || hasP2OrderLink === true
    ? 'HISTORIC_P2'
    : 'UNRELATED_LEGACY';
}

async function evaluateCompatibilityReadiness(
  tx: Executor,
  input: {
    partNumber: string;
    quantity: number;
    travelerRequired: boolean;
    travelerRows: Row[];
    routingIds: string[];
  }
): Promise<{ status: 'READY' | 'BLOCKED' | 'PARTIAL'; reason?: string }> {
  if (input.travelerRequired && input.travelerRows.length === 0) {
    return {
      status: 'BLOCKED',
      reason:
        'Travelers not yet set up — contact your supervisor to create a traveler before starting',
    };
  }

  const materialRows = rows(
    await tx.execute(sql`
      WITH selected_bom AS (
        SELECT id FROM boms
        WHERE parent_part_ag_number=${input.partNumber} AND is_active=true
        ORDER BY id LIMIT 1
      ), selected_revision AS (
        SELECT id FROM bom_revisions
        WHERE bom_id=(SELECT id FROM selected_bom) AND is_released=true
        ORDER BY created_at DESC,id LIMIT 1
      )
      SELECT bl.child_part_ag_number,
             (COALESCE(bl.qty_per,1)::numeric * ${input.quantity}::numeric) AS needed,
             COALESCE((
               SELECT balance.quantity_available
               FROM inventory_balances balance
               WHERE balance.ag_part_number=bl.child_part_ag_number
               ORDER BY balance.id LIMIT 1
             ),0) AS available
      FROM bom_lines bl
      WHERE bl.revision_id=(SELECT id FROM selected_revision)
      ORDER BY bl.id`)
  );
  const shortage = materialRows.find(
    (material) => Number(material.available) < Number(material.needed)
  );
  if (shortage) {
    return {
      status: 'BLOCKED',
      reason: `Materials are not fully staged (${clean(shortage.child_part_ag_number)} is short) — check the Material Readiness section`,
    };
  }

  if (input.routingIds.length > 0) {
    const certificationRows = rows(
      await tx.execute(sql`
        SELECT operation.id,operation.operation_name,operation.certification_id,
               CASE WHEN operation.certification_id IS NULL THEN false ELSE EXISTS (
                 SELECT 1 FROM employee_certifications certification
                 JOIN employees employee ON employee.id=certification.employee_id
                 WHERE certification.certification_id=operation.certification_id
                   AND certification.is_active=true
                   AND (certification.expiry_date IS NULL OR certification.expiry_date>=CURRENT_DATE)
                   AND employee.is_active=true
               ) END AS covered
        FROM routing_operations operation
        WHERE operation.part_routing_id=ANY(${input.routingIds}::uuid[])
          AND operation.requires_certification=true
        ORDER BY operation.part_routing_id,operation.step_number,operation.id`)
    );
    if (
      certificationRows.some(
        (operation) => operation.certification_id == null || !operation.covered
      )
    ) {
      return {
        status: 'PARTIAL',
        reason:
          'One or more required certifications are missing for this routing — contact your supervisor before starting work',
      };
    }
  }

  return { status: 'READY' };
}

async function resolveManufacturingOrderReleaseAuthorityWithExecutor(
  workOrderId: string,
  executor: Executor,
  lock: boolean,
  expectedProjectId?: string
): Promise<ManufacturingOrderReleaseAuthority> {
  const authorityRows = rows(
    await executor.execute(sql`
      SELECT pwo.project_id,p.workflow_version,p.po_id,
             EXISTS (
               SELECT 1 FROM project_steps linked_p2_step
               WHERE linked_p2_step.project_id=p.id
                 AND linked_p2_step.step_type='p2_order'
                 AND linked_p2_step.linked_p2_order_id IS NOT NULL
             ) AS has_p2_order_link
      FROM production_work_orders pwo
      JOIN projects p ON p.id=pwo.project_id
      WHERE pwo.id=${workOrderId}
      LIMIT 1
      ${lock ? sql`FOR UPDATE OF pwo,p` : sql``}`)
  );
  const authorityRow = authorityRows[0];
  if (!authorityRow) {
    throw new HistoricP2ManufacturingReleaseError(
      'WORK_ORDER_NOT_FOUND',
      'The manufacturing order was not found.',
      404
    );
  }
  if (
    expectedProjectId !== undefined &&
    clean(authorityRow.project_id) !== clean(expectedProjectId)
  ) {
    throw new HistoricP2ManufacturingReleaseError(
      'WORK_ORDER_PROJECT_MISMATCH',
      'The manufacturing order no longer belongs to the authorized project.',
      409
    );
  }

  let workflowVersion: string;
  try {
    workflowVersion = resolveProjectWorkflowVersion(
      authorityRow.workflow_version
    );
  } catch {
    throw new HistoricP2ManufacturingReleaseError(
      'UNKNOWN_PROJECT_WORKFLOW_VERSION',
      'The project workflow authority is not recognized.',
      409,
      { storedWorkflowVersion: authorityRow.workflow_version ?? null }
    );
  }
  return classifyReleaseAuthority(
    workflowVersion,
    authorityRow.po_id,
    authorityRow.has_p2_order_link
  );
}

export async function resolveManufacturingOrderReleaseAuthority(
  workOrderId: string
): Promise<ManufacturingOrderReleaseAuthority> {
  return resolveManufacturingOrderReleaseAuthorityWithExecutor(
    workOrderId,
    db,
    false
  );
}

export async function releaseUnrelatedLegacyManufacturingWorkOrder(input: {
  workOrderId: string;
  expectedProjectId: string;
  expectedStatus: string;
}) {
  return withSerializableReleaseRetry(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${releaseLockIdentity(input.workOrderId)},0))`
    );
    const authority =
      await resolveManufacturingOrderReleaseAuthorityWithExecutor(
        input.workOrderId,
        tx,
        true,
        input.expectedProjectId
      );
    if (authority !== 'UNRELATED_LEGACY') {
      throw new HistoricP2ManufacturingReleaseError(
        'MANUFACTURING_RELEASE_AUTHORITY_CHANGED',
        'The project release authority changed while the manufacturing order was being released. Refresh and use the applicable controlled release path.',
        409,
        { authority }
      );
    }

    const [updated] = await tx
      .update(productionWorkOrders)
      .set({ status: 'RELEASED', updatedAt: new Date() })
      .where(
        and(
          eq(productionWorkOrders.id, input.workOrderId),
          eq(productionWorkOrders.status, input.expectedStatus)
        )
      )
      .returning();
    if (!updated) {
      throw new HistoricP2ManufacturingReleaseError(
        'WORK_ORDER_RELEASE_CONCURRENCY_CONFLICT',
        'The manufacturing order changed before it could be released.',
        409
      );
    }
    return updated;
  });
}

async function evaluate(
  workOrderId: string,
  tx: Executor,
  lock: boolean,
  expectedProjectId?: string
): Promise<HistoricP2ManufacturingReleaseEligibility> {
  const blockers: HistoricP2ReleaseBlocker[] = [];
  const evidence: HistoricP2ReleaseEvidence[] = [];
  const workOrderRows = rows(
    await tx.execute(sql`
      SELECT pwo.id,pwo.project_id,pwo.work_order_number,pwo.part_number,
             pwo.quantity,pwo.status,pwo.wad_status,pwo.wizard_data,
             p.project_code,p.workflow_version,p.status AS project_status,
             p.current_stage,p.po_id,
             EXISTS (
              SELECT 1 FROM project_steps linked_p2_step
              WHERE linked_p2_step.project_id=p.id
                 AND linked_p2_step.step_type='p2_order'
                 AND linked_p2_step.linked_p2_order_id IS NOT NULL
             ) AS has_p2_order_link
      FROM production_work_orders pwo
      JOIN projects p ON p.id=pwo.project_id
      WHERE pwo.id=${workOrderId}
      ${lock ? sql`FOR UPDATE OF pwo,p` : sql``}`)
  );
  const row = workOrderRows[0];
  if (!row) {
    addBlocker(
      blockers,
      'WORK_ORDER_NOT_FOUND',
      'The manufacturing order was not found.'
    );
    return {
      authorityMode: 'UNKNOWN',
      eligible: false,
      alreadyReleased: false,
      project: null,
      workOrder: null,
      evidence: [
        {
          key: 'work_order_exists',
          label: 'Manufacturing order exists',
          passed: false,
        },
      ],
      blockers,
    };
  }

  const projectId = clean(row.project_id);
  const status = clean(row.status).toUpperCase();
  const alreadyReleased = status === 'RELEASED';
  let effectiveWorkflowVersion: string | null = null;
  let authorityMode: HistoricP2ReleaseAuthorityMode = 'UNKNOWN';
  try {
    effectiveWorkflowVersion = resolveProjectWorkflowVersion(
      row.workflow_version
    );
    const releaseAuthority = classifyReleaseAuthority(
      effectiveWorkflowVersion,
      row.po_id,
      row.has_p2_order_link
    );
    authorityMode =
      releaseAuthority === 'HISTORIC_P2'
        ? 'HISTORIC_P2_COMPATIBILITY'
        : releaseAuthority;
  } catch {
    addBlocker(
      blockers,
      'UNKNOWN_PROJECT_WORKFLOW_VERSION',
      'The project workflow authority is not recognized.'
    );
  }

  const project = {
    id: projectId,
    projectCode: clean(row.project_code),
    storedWorkflowVersion:
      row.workflow_version == null ? null : clean(row.workflow_version),
    effectiveWorkflowVersion,
    status: clean(row.project_status),
    currentStage: clean(row.current_stage),
    linkedP2PoId: row.po_id == null ? null : Number(row.po_id),
  };
  const workOrder = {
    id: clean(row.id),
    projectId,
    workOrderNumber: clean(row.work_order_number),
    partNumber: clean(row.part_number),
    status,
    wadStatus: clean(row.wad_status).toUpperCase(),
  };

  evidence.push(
    {
      key: 'project_exists',
      label: 'Project exists',
      passed: true,
      referenceIds: [reference('project', projectId)],
    },
    {
      key: 'work_order_ownership',
      label: 'Manufacturing order belongs to this project',
      passed: true,
      referenceIds: [
        reference('production_work_order', workOrder.id),
        reference('project', projectId),
      ],
    }
  );

  const projectMatches =
    expectedProjectId === undefined || clean(expectedProjectId) === projectId;
  evidence.push({
    key: 'expected_project_ownership',
    label: 'Manufacturing order belongs to the requested project',
    passed: projectMatches,
    referenceIds:
      expectedProjectId === undefined
        ? [reference('project', projectId)]
        : [
            reference('project', expectedProjectId),
            reference('production_work_order', workOrder.id),
          ],
  });
  if (!projectMatches) {
    addBlocker(
      blockers,
      'WORK_ORDER_PROJECT_MISMATCH',
      'The manufacturing order does not belong to the requested project.'
    );
    return {
      authorityMode,
      eligible: false,
      alreadyReleased,
      project,
      workOrder,
      evidence,
      blockers,
    };
  }

  const historicWorkflow = authorityMode === 'HISTORIC_P2_COMPATIBILITY';
  evidence.push({
    key: 'historic_workflow',
    label: 'Historic P2 workflow is authoritative',
    passed: historicWorkflow,
    referenceIds: [reference('project', projectId)],
  });
  if (authorityMode === 'P2_V2') {
    addBlocker(
      blockers,
      'P2_V2_COMPATIBILITY_FALLBACK_FORBIDDEN',
      'P2 V2 projects must use the existing P2 V2 release controls.'
    );
  }
  if (authorityMode === 'UNRELATED_LEGACY') {
    addBlocker(
      blockers,
      'UNRELATED_LEGACY_COMPATIBILITY_FALLBACK_FORBIDDEN',
      'This legacy manufacturing order has no P2 purchase-order linkage and must use its existing release path.'
    );
  }

  const projectReleasable = new Set(['active', 'won']).has(
    normalized(row.project_status)
  );
  evidence.push({
    key: 'project_releasable',
    label: 'Project is active or won for manufacturing',
    passed: projectReleasable,
    referenceIds: [reference('project', projectId)],
  });
  if (!projectReleasable) {
    addBlocker(
      blockers,
      'PROJECT_NOT_ACTIVE_FOR_MANUFACTURING',
      'The project is not active for manufacturing release.'
    );
  }

  const releasableStatuses = new Set(['DRAFT', 'PLANNED', 'READY']);
  const workOrderReleasable =
    alreadyReleased || releasableStatuses.has(workOrder.status);
  evidence.push({
    key: 'work_order_releasable',
    label: 'Manufacturing order is releasable',
    passed: workOrderReleasable,
    referenceIds: [reference('production_work_order', workOrder.id)],
  });
  if (!workOrderReleasable) {
    addBlocker(
      blockers,
      'WORK_ORDER_STATUS_NOT_RELEASABLE',
      `Manufacturing order status ${workOrder.status || 'UNKNOWN'} cannot be released.`
    );
  }

  const workOrderQuantity = Number(row.quantity);
  const workOrderQuantityValid =
    Number.isFinite(workOrderQuantity) && workOrderQuantity > 0;
  evidence.push({
    key: 'work_order_quantity',
    label: 'Manufacturing order quantity is valid',
    passed: workOrderQuantityValid,
    referenceIds: [reference('production_work_order', workOrder.id)],
  });
  if (!workOrderQuantityValid) {
    addBlocker(
      blockers,
      'WORK_ORDER_QUANTITY_INVALID',
      'The manufacturing order quantity is missing or invalid.'
    );
  }

  if (!historicWorkflow) {
    return {
      authorityMode,
      eligible: false,
      alreadyReleased,
      project,
      workOrder,
      evidence,
      blockers,
    };
  }

  const v2Conflict = rows(
    await tx.execute(sql`
      SELECT
        EXISTS (
          SELECT 1 FROM project_workflow_instances wi
          WHERE wi.project_id=${projectId}
            AND wi.workflow_version='p2_v2'
            AND wi.status NOT IN ('SUPERSEDED','CANCELLED')
        ) AS active_workflow,
        EXISTS (
          SELECT 1 FROM project_production_plans plan
          WHERE plan.project_id=${projectId}
            AND plan.status IN ('APPROVED','RELEASED')
        ) AS current_plan,
        EXISTS (
          SELECT 1 FROM project_production_releases production_release
          WHERE production_release.project_id=${projectId}
            AND production_release.status='APPROVED'
        ) AS production_release,
        EXISTS (
          SELECT 1 FROM project_production_launches launch
          WHERE launch.project_id=${projectId} AND launch.status='COMPLETE'
        ) AS production_launch,
        EXISTS (
          SELECT 1 FROM p2_frozen_production_demand_baselines baseline
          WHERE baseline.project_id=${projectId} AND baseline.status='RELEASED'
        ) AS frozen_demand,
        EXISTS (
          SELECT 1 FROM p2_manufacturing_work_order_authorities authority
          WHERE authority.production_work_order_id=${workOrderId}
             OR authority.project_id=${projectId}
        ) AS manufacturing_authority`)
  )[0];
  const conflictingV2Authority = Boolean(
    v2Conflict?.active_workflow ||
    v2Conflict?.current_plan ||
    v2Conflict?.production_release ||
    v2Conflict?.production_launch ||
    v2Conflict?.frozen_demand ||
    v2Conflict?.manufacturing_authority
  );
  evidence.push({
    key: 'no_p2_v2_authority_conflict',
    label: 'No conflicting P2 V2 authority exists',
    passed: !conflictingV2Authority,
  });
  if (conflictingV2Authority) {
    addBlocker(
      blockers,
      'CONFLICTING_P2_V2_AUTHORITY',
      'A P2 V2 workflow or newer production baseline conflicts with the historic release path.'
    );
  }

  const stepRows = rows(
    await tx.execute(sql`
      SELECT ps.id,ps.step_type,ps.status,ps.completed_at,
             ps.linked_quote_id,
             ps.linked_purchase_review_id,ps.linked_preproduction_checklist_id,
             ps.linked_p2_order_id,
             review.status AS purchase_review_status,
             preproduction.status AS preproduction_status,
             preproduction.project_id AS preproduction_project_id
      FROM project_steps ps
      LEFT JOIN purchase_review_checklists review
        ON review.id=ps.linked_purchase_review_id
      LEFT JOIN preproduction_checklists preproduction
        ON preproduction.id=ps.linked_preproduction_checklist_id
      WHERE ps.project_id=${projectId}
        AND ps.step_type IN (
          'quote','purchase_review_checklist','preproduction_checklist','p2_order'
        )
      ORDER BY ps.step_order,ps.id`)
  );
  const stepsByType = (type: string) =>
    stepRows.filter((step) => clean(step.step_type) === type);
  const purchaseSteps = stepsByType('purchase_review_checklist');
  const preproductionSteps = stepsByType('preproduction_checklist');
  const p2OrderSteps = stepsByType('p2_order');
  const quoteStep = stepsByType('quote')[0];
  const purchaseStep = purchaseSteps[0];
  const preproductionStep = preproductionSteps[0];
  const p2OrderStep = p2OrderSteps[0];

  const purchaseReviewPassed =
    purchaseSteps.length === 1 &&
    normalized(purchaseStep?.status) === 'completed' &&
    purchaseStep?.linked_purchase_review_id != null &&
    normalized(purchaseStep?.purchase_review_status) === 'approved';
  evidence.push({
    key: 'purchase_order_review',
    label: 'Purchase Order Review is complete',
    passed: purchaseReviewPassed,
    referenceIds: purchaseStep
      ? [
          reference('project_step', purchaseStep.id),
          ...(purchaseStep.linked_purchase_review_id == null
            ? []
            : [
                reference(
                  'purchase_review_checklist',
                  purchaseStep.linked_purchase_review_id
                ),
              ]),
        ]
      : undefined,
  });
  if (!purchaseReviewPassed) {
    addBlocker(
      blockers,
      purchaseSteps.length > 1
        ? 'AMBIGUOUS_PURCHASE_ORDER_REVIEW_EVIDENCE'
        : 'PURCHASE_ORDER_REVIEW_INCOMPLETE',
      purchaseSteps.length > 1
        ? 'Multiple historic Purchase Order Review steps make the release evidence ambiguous.'
        : 'Purchase Order Review evidence is missing or not approved.'
    );
  }

  const preproductionProjectMatches =
    normalized(preproductionStep?.preproduction_project_id) ===
      normalized(projectId) ||
    normalized(preproductionStep?.preproduction_project_id) ===
      normalized(row.project_code);
  const preproductionPassed =
    preproductionSteps.length === 1 &&
    normalized(preproductionStep?.status) === 'completed' &&
    preproductionStep?.linked_preproduction_checklist_id != null &&
    normalized(preproductionStep?.preproduction_status) === 'completed' &&
    preproductionProjectMatches;
  evidence.push({
    key: 'preproduction',
    label: 'Preproduction is complete',
    passed: preproductionPassed,
    referenceIds: preproductionStep
      ? [
          reference('project_step', preproductionStep.id),
          ...(preproductionStep.linked_preproduction_checklist_id == null
            ? []
            : [
                reference(
                  'preproduction_checklist',
                  preproductionStep.linked_preproduction_checklist_id
                ),
              ]),
        ]
      : undefined,
  });
  if (!preproductionPassed) {
    addBlocker(
      blockers,
      preproductionSteps.length > 1
        ? 'AMBIGUOUS_PREPRODUCTION_EVIDENCE'
        : 'PREPRODUCTION_INCOMPLETE',
      preproductionSteps.length > 1
        ? 'Multiple historic Preproduction steps make the release evidence ambiguous.'
        : 'Preproduction evidence is missing, incomplete, or linked to another project.'
    );
  }

  const storedProjectPoId = project.linkedP2PoId;
  const linkedStepPoIdValue = Number(p2OrderStep?.linked_p2_order_id);
  const linkedStepPoId =
    Number.isSafeInteger(linkedStepPoIdValue) && linkedStepPoIdValue > 0
      ? linkedStepPoIdValue
      : null;
  const poReferencesAgree =
    storedProjectPoId == null || storedProjectPoId === linkedStepPoId;
  const p2OrderStepValid =
    p2OrderSteps.length === 1 && linkedStepPoId != null && poReferencesAgree;
  const poId = p2OrderStepValid
    ? (storedProjectPoId ?? linkedStepPoId)
    : storedProjectPoId;
  if (p2OrderStepValid) project.linkedP2PoId = poId;
  if (!p2OrderStepValid) {
    addBlocker(
      blockers,
      p2OrderSteps.length > 1
        ? 'AMBIGUOUS_P2_ORDER_EVIDENCE'
        : 'P2_ORDER_LINK_INCOMPLETE',
      p2OrderSteps.length > 1
        ? 'Multiple historic P2 Order steps make the release evidence ambiguous.'
        : 'The historic P2 Order link is missing or does not match the project PO.'
    );
  }

  const po =
    poId == null
      ? null
      : (rows(
          await tx.execute(sql`
            SELECT id,po_number,status,project_id,is_current_revision,updated_at,
                   contract_review_role,source_quote_id
            FROM p2_purchase_orders WHERE id=${poId}`)
        )[0] ?? null);
  const poStatus = normalized(po?.status);
  const poStates = new Set(['released', 'in_production', 'completed']);
  const poLinked =
    p2OrderStepValid &&
    Boolean(po) &&
    (po?.project_id == null || clean(po.project_id) === projectId) &&
    po?.is_current_revision !== false;
  evidence.push({
    key: 'linked_p2_purchase_order',
    label: 'Customer P2 Purchase Order is linked',
    passed: poLinked,
    referenceIds:
      po && p2OrderStep
        ? [
            reference('project_step', p2OrderStep.id),
            reference('p2_purchase_order', po.id),
          ]
        : undefined,
  });
  if (!poLinked) {
    addBlocker(
      blockers,
      'LINKED_P2_PURCHASE_ORDER_INVALID',
      'The historic P2 Purchase Order link is missing, stale, or contradictory.'
    );
  }

  const contractReviewRole = normalized(
    po?.contract_review_role || 'secondary'
  );
  const contractReviewRequired = contractReviewRole === 'primary';
  const effectiveQuoteId =
    clean(quoteStep?.linked_quote_id ?? po?.source_quote_id) || null;
  const quoteSnapshot =
    contractReviewRequired && effectiveQuoteId
      ? (rows(
          await tx.execute(sql`
            SELECT id,revision_label,status_at_snapshot
            FROM quote_snapshots
            WHERE quote_id=${effectiveQuoteId}
            ORDER BY revision_number DESC,id DESC
            LIMIT 1`)
        )[0] ?? null)
      : null;
  const contractReview = contractReviewRequired
    ? (rows(
        await tx.execute(sql`
          SELECT id,status
          FROM purchase_review_checklists
          WHERE (${effectiveQuoteId}::text IS NOT NULL AND (
                   form_data->>'quoteId'=${effectiveQuoteId}
                OR form_data->>'quote_id'=${effectiveQuoteId}
                ))
             OR form_data->>'projectId'=${projectId}
             OR form_data->>'project_id'=${projectId}
          ORDER BY updated_at DESC,created_at DESC,id DESC
          LIMIT 1`)
      )[0] ?? null)
    : null;
  const contractReviewPassed =
    !contractReviewRequired ||
    (Boolean(quoteSnapshot) &&
      normalized(contractReview?.status) === 'approved');
  evidence.push({
    key: 'contract_review',
    label: contractReviewRequired
      ? 'Primary Purchase Order Contract Review is approved'
      : 'Contract Review is not required for this secondary Purchase Order',
    passed: contractReviewPassed,
    referenceIds: contractReviewRequired
      ? [
          ...(quoteSnapshot
            ? [reference('quote_snapshot', quoteSnapshot.id)]
            : []),
          ...(contractReview
            ? [reference('purchase_review_checklist', contractReview.id)]
            : []),
        ]
      : po
        ? [reference('p2_purchase_order', po.id)]
        : undefined,
  });
  if (!contractReviewPassed) {
    addBlocker(
      blockers,
      'CONTRACT_REVIEW_INCOMPLETE',
      !quoteSnapshot
        ? 'A sent quote snapshot is required before releasing this primary Purchase Order.'
        : 'Contract Review must be approved before releasing this primary Purchase Order.'
    );
  }

  const projectProductionState = new Set(['production', 'in_production']).has(
    normalized(row.current_stage)
  );
  const releaseActivity = rows(
    await tx.execute(sql`
      SELECT id FROM project_activity_log
      WHERE project_id=${projectId}
        AND activity_type='stage_changed'
        AND description IN (
          'Released to Production — P2 Release Gate passed (all three conditions met)',
          'Released to Production — P2 Release Gate passed (all required conditions met)'
        )
      ORDER BY created_at DESC`)
  );
  const historicP2ReleasePassed =
    poLinked &&
    poStates.has(poStatus) &&
    projectProductionState &&
    releaseActivity.length > 0;
  evidence.push({
    key: 'historic_p2_production_release',
    label: 'Historic P2 Production Release is authorized',
    passed: historicP2ReleasePassed,
    referenceIds: historicP2ReleasePassed
      ? [
          reference('project', projectId),
          reference('p2_purchase_order', po?.id),
          ...releaseActivity.map((activity) =>
            reference('project_activity_log', activity.id)
          ),
        ]
      : undefined,
  });
  if (!historicP2ReleasePassed) {
    addBlocker(
      blockers,
      'HISTORIC_P2_PRODUCTION_RELEASE_NOT_AUTHORIZED',
      'The linked P2 Purchase Order and project do not show a completed historic Production Release.'
    );
  }

  const wadRows = rows(
    await tx.execute(sql`
      SELECT id,work_order_number,status,wad_status
      FROM production_work_orders
      WHERE project_id=${projectId}
        AND UPPER(status) IN ('RELEASED','IN_PROGRESS','COMPLETE','CLOSED')
        AND UPPER(COALESCE(NULLIF(BTRIM(wad_status),''),'DRAFT'))
              IN ('DRAFT','APPROVED')
      ORDER BY updated_at DESC,id`)
  );
  const wadPassed = wadRows.length > 0;
  evidence.push({
    key: 'wad_authorization',
    label: 'Historic WAD authorization is complete',
    passed: wadPassed,
    referenceIds: wadRows.map((wad) =>
      reference('production_work_order', wad.id)
    ),
  });
  if (!wadPassed) {
    addBlocker(
      blockers,
      'WAD_AUTHORIZATION_INCOMPLETE',
      'No historically authorized WAD with a compatible recorded WAD state exists for this project.'
    );
  }

  const pendingRevisions = rows(
    await tx.execute(sql`
      SELECT id FROM wad_revisions
      WHERE wad_id=${workOrderId}
        AND status IN ('draft','pending_approval')
        AND (
          impact_production=true OR impact_released_travelers=true
          OR impact_inspection=true OR impact_material_issued=true
          OR requires_production_hold=true
        )
      ORDER BY created_at DESC`)
  );
  if (pendingRevisions.length) {
    addBlocker(
      blockers,
      'PENDING_WAD_REVISION_BLOCKS_RELEASE',
      'A pending WAD revision affecting production must be approved before release.'
    );
  }

  const travelerRows = rows(
    await tx.execute(sql`
      SELECT t.id,t.project_id,t.part_number AS traveler_part_number,
             t.status,t.part_routing_id,
              t.part_routing_revision,t.wad_revision_id,
              routing.id AS existing_routing_id,
              routing.project_id AS routing_project_id,
              routing.part_number AS routing_part_number,
              routing.routing_revision AS existing_routing_revision,
             revision.id AS existing_wad_revision_id,
             revision.wad_id AS revision_wad_id,
             revision.status AS revision_status
      FROM travelers t
      LEFT JOIN part_routings routing ON routing.id::text=t.part_routing_id
      LEFT JOIN wad_revisions revision ON revision.id=t.wad_revision_id
      WHERE t.production_work_order_id=${workOrderId}
      ORDER BY t.created_at,t.id`)
  );
  const documentation = evaluateDocumentationRequirements({
    wizard_data: row.wizard_data,
  });
  const workInstructionLinks = rows(
    await tx.execute(sql`
      SELECT id,template_id
      FROM wad_document_links
      WHERE work_order_id=${workOrderId}
        AND UPPER(template_type) IN (
          'WORK_INSTRUCTION','CONTROLLED_WORK_INSTRUCTION'
        )
      ORDER BY linked_at,id`)
  );
  const workInstructionRequired =
    documentation.package.workInstruction === 'required';
  const workInstructionPassed =
    !workInstructionRequired || workInstructionLinks.length > 0;
  evidence.push({
    key: 'work_instruction_documentation',
    label: 'Required work instruction is linked',
    passed: workInstructionPassed,
    referenceIds: workInstructionLinks.map((link) =>
      reference('wad_document_link', link.id)
    ),
  });
  if (!workInstructionPassed) {
    addBlocker(
      blockers,
      'WORK_INSTRUCTION_REQUIRED',
      'The WAD requires a work instruction, but no WORK_INSTRUCTION document is linked.'
    );
  }
  const travelerRequired = documentation.gates.travelerGeneration.required;
  const routingRequired = documentation.package.routing === 'required';
  const missingTraveler = travelerRows.length === 0;
  const routingRowsWithoutTraveler =
    routingRequired && missingTraveler
      ? rows(
          await tx.execute(sql`
            SELECT id,project_id,routing_revision
            FROM part_routings
            WHERE LOWER(TRIM(part_number))=LOWER(TRIM(${workOrder.partNumber}))
              AND is_active=true
              AND (project_id=${projectId} OR project_id IS NULL)
            ORDER BY (project_id=${projectId}) DESC,routing_revision DESC,id`)
        )
      : [];
  const projectRoutingRows = routingRowsWithoutTraveler.filter(
    (routing) => clean(routing.project_id) === projectId
  );
  const applicableRoutingRows = projectRoutingRows.length
    ? projectRoutingRows
    : routingRowsWithoutTraveler.filter(
        (routing) => routing.project_id == null
      );
  const routingWithoutTravelerValid =
    !routingRequired || !missingTraveler || applicableRoutingRows.length === 1;
  const contradictoryTraveler = travelerRows.some(
    (traveler) =>
      (traveler.project_id != null &&
        clean(traveler.project_id) !== projectId) ||
      (clean(traveler.traveler_part_number) !== '' &&
        normalized(traveler.traveler_part_number) !==
          normalized(workOrder.partNumber)) ||
      ['cancelled', 'canceled', 'void', 'voided', 'superseded'].includes(
        normalized(traveler.status)
      )
  );
  const danglingRouting =
    !routingWithoutTravelerValid ||
    travelerRows.some(
      (traveler) =>
        (routingRequired && !clean(traveler.part_routing_id)) ||
        (traveler.part_routing_id != null && !traveler.existing_routing_id) ||
        (traveler.existing_routing_id != null &&
          normalized(traveler.routing_part_number) !==
            normalized(workOrder.partNumber)) ||
        (traveler.routing_project_id != null &&
          clean(traveler.routing_project_id) !== projectId) ||
        (traveler.part_routing_revision != null &&
          traveler.existing_routing_revision != null &&
          Number(traveler.part_routing_revision) !==
            Number(traveler.existing_routing_revision))
    );
  const danglingWadRevision = travelerRows.some(
    (traveler) =>
      traveler.wad_revision_id != null &&
      (!traveler.existing_wad_revision_id ||
        clean(traveler.revision_wad_id) !== workOrderId ||
        normalized(traveler.revision_status) !== 'approved')
  );
  const samplingPlanMissing =
    documentation.gates.routingApproval.requiresSamplingPlan &&
    !documentation.samplingPlanId;
  const travelerAndRoutingPassed =
    (!travelerRequired || !missingTraveler) &&
    !contradictoryTraveler &&
    !danglingRouting &&
    !danglingWadRevision &&
    pendingRevisions.length === 0 &&
    workInstructionPassed &&
    !samplingPlanMissing;
  evidence.push({
    key: 'routing_traveler_documentation',
    label:
      'Routing, traveler, revision, and documentation references are valid',
    passed: travelerAndRoutingPassed,
    referenceIds: [
      ...travelerRows.map((traveler) => reference('traveler', traveler.id)),
      ...travelerRows
        .filter((traveler) => traveler.existing_routing_id)
        .map((traveler) =>
          reference('part_routing', traveler.existing_routing_id)
        ),
      ...applicableRoutingRows.map((routing) =>
        reference('part_routing', routing.id)
      ),
      ...travelerRows
        .filter((traveler) => traveler.existing_wad_revision_id)
        .map((traveler) =>
          reference('wad_revision', traveler.existing_wad_revision_id)
        ),
    ],
  });
  if (travelerRequired && missingTraveler) {
    addBlocker(
      blockers,
      'TRAVELER_REQUIRED',
      'A traveler must be linked before this manufacturing order can be released.'
    );
  }
  if (contradictoryTraveler) {
    addBlocker(
      blockers,
      'TRAVELER_EVIDENCE_CONTRADICTORY',
      'A linked traveler is cancelled or belongs to another project or part.'
    );
  }
  if (danglingRouting) {
    addBlocker(
      blockers,
      'ROUTING_REFERENCE_INVALID',
      'A required traveler routing, part, project, or revision no longer matches its referenced record.'
    );
  }
  if (danglingWadRevision) {
    addBlocker(
      blockers,
      'WAD_REVISION_REFERENCE_INVALID',
      'A traveler references a missing, unrelated, or unapproved WAD revision.'
    );
  }
  if (samplingPlanMissing) {
    addBlocker(
      blockers,
      'SAMPLING_PLAN_REQUIRED',
      'The WAD requires a sampling plan, but no sampling plan is recorded.'
    );
  }

  if (
    !alreadyReleased &&
    releasableStatuses.has(workOrder.status) &&
    workOrderQuantityValid
  ) {
    try {
      const routingIds = [
        ...travelerRows.map((traveler) => clean(traveler.existing_routing_id)),
        ...applicableRoutingRows.map((routing) => clean(routing.id)),
      ].filter(
        (routingId, index, all) =>
          Boolean(routingId) && all.indexOf(routingId) === index
      );
      const readiness = await evaluateCompatibilityReadiness(tx, {
        partNumber: workOrder.partNumber,
        quantity: workOrderQuantity,
        travelerRequired,
        travelerRows,
        routingIds,
      });
      const ready = readiness.status === 'READY';
      evidence.push({
        key: 'manufacturing_readiness',
        label: 'Manufacturing order readiness checks pass',
        passed: ready,
        referenceIds: [reference('production_work_order', workOrderId)],
      });
      if (!ready) {
        addBlocker(
          blockers,
          'WORK_ORDER_READINESS_BLOCKED',
          readiness.reason ||
            'The manufacturing order is not ready for floor release.'
        );
      }
    } catch (error: unknown) {
      if (lock) throw error;
      evidence.push({
        key: 'manufacturing_readiness',
        label: 'Manufacturing order readiness checks pass',
        passed: false,
        referenceIds: [reference('production_work_order', workOrderId)],
      });
      addBlocker(
        blockers,
        'WORK_ORDER_READINESS_UNAVAILABLE',
        'Manufacturing readiness could not be proven.'
      );
    }
  }

  const compatibilityEvents = rows(
    await tx.execute(sql`
      SELECT id,occurred_at,recorded_at,payload_json
      FROM audit_events
      WHERE subject_type='work_order' AND subject_id=${workOrderId}
        AND action=${HISTORIC_P2_COMPATIBILITY_RELEASE}
      ORDER BY id`)
  );
  if (compatibilityEvents.length > 1) {
    addBlocker(
      blockers,
      'DUPLICATE_HISTORIC_RELEASE_AUDIT_EVIDENCE',
      'Multiple historic compatibility release events exist for this manufacturing order.'
    );
  }
  if (compatibilityEvents.length > 0 && !alreadyReleased) {
    addBlocker(
      blockers,
      'HISTORIC_RELEASE_AUDIT_STATE_CONFLICT',
      'Historic compatibility audit evidence conflicts with the current manufacturing-order state.'
    );
  }

  return {
    authorityMode,
    eligible: !alreadyReleased && blockers.length === 0,
    alreadyReleased,
    project,
    workOrder,
    evidence,
    blockers,
  };
}

export async function evaluateHistoricP2ManufacturingReleaseEligibility(
  workOrderId: string,
  expectedProjectId?: string
): Promise<HistoricP2ManufacturingReleaseEligibility> {
  return evaluate(workOrderId, db, false, expectedProjectId);
}

export async function listHistoricP2ManufacturingReleaseReadiness(
  projectId: string
) {
  const projectRows = rows(
    await db.execute(sql`
      SELECT id,workflow_version,po_id,
             EXISTS (
              SELECT 1 FROM project_steps linked_p2_step
              WHERE linked_p2_step.project_id=projects.id
                 AND linked_p2_step.step_type='p2_order'
                 AND linked_p2_step.linked_p2_order_id IS NOT NULL
             ) AS has_p2_order_link
      FROM projects WHERE id=${projectId} LIMIT 1`)
  );
  const project = projectRows[0];
  if (!project) {
    throw new HistoricP2ManufacturingReleaseError(
      'PROJECT_NOT_FOUND',
      'The project was not found.',
      404
    );
  }
  let workflowVersion: string;
  try {
    workflowVersion = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    workflowVersion = clean(project.workflow_version) || 'unknown';
  }
  const workOrders = rows(
    await db.execute(sql`
      SELECT id FROM production_work_orders
      WHERE project_id=${projectId}
      ORDER BY created_at,id`)
  );
  const orders: HistoricP2ManufacturingReleaseEligibility[] = [];
  for (const workOrder of workOrders) {
    orders.push(
      await evaluateHistoricP2ManufacturingReleaseEligibility(
        clean(workOrder.id),
        projectId
      )
    );
  }
  return {
    authorityMode:
      workflowVersion === 'legacy_v1'
        ? classifyReleaseAuthority(
            workflowVersion,
            project.po_id,
            project.has_p2_order_link
          ) === 'HISTORIC_P2'
          ? ('HISTORIC_P2_COMPATIBILITY' as const)
          : ('UNRELATED_LEGACY' as const)
        : workflowVersion === 'p2_v2'
          ? ('P2_V2' as const)
          : ('UNKNOWN' as const),
    projectId,
    workflowVersion,
    orders,
  };
}

export async function releaseHistoricP2ManufacturingWorkOrder(input: {
  workOrderId: string;
  expectedProjectId?: string;
  actor: HistoricP2ReleaseActor;
  reason?: string;
}) {
  return withSerializableReleaseRetry(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${releaseLockIdentity(input.workOrderId)},0))`
    );
    const eligibility = await evaluate(
      input.workOrderId,
      tx,
      true,
      input.expectedProjectId
    );
    const projectMismatch = eligibility.blockers.find(
      (blocker) => blocker.code === 'WORK_ORDER_PROJECT_MISMATCH'
    );
    if (projectMismatch) {
      throw new HistoricP2ManufacturingReleaseError(
        projectMismatch.code,
        projectMismatch.message,
        409,
        { eligibility }
      );
    }
    if (eligibility.authorityMode !== 'HISTORIC_P2_COMPATIBILITY') {
      throw new HistoricP2ManufacturingReleaseError(
        'HISTORIC_P2_COMPATIBILITY_NOT_APPLICABLE',
        'Historic P2 compatibility release is not applicable to this project.',
        409,
        { eligibility }
      );
    }
    const auditConflict = eligibility.blockers.find((blocker) =>
      [
        'DUPLICATE_HISTORIC_RELEASE_AUDIT_EVIDENCE',
        'HISTORIC_RELEASE_AUDIT_STATE_CONFLICT',
      ].includes(blocker.code)
    );
    if (auditConflict) {
      throw new HistoricP2ManufacturingReleaseError(
        auditConflict.code,
        auditConflict.message,
        409,
        { eligibility }
      );
    }
    if (eligibility.alreadyReleased) {
      const priorAudit = rows(
        await tx.execute(sql`
          SELECT id,action,occurred_at,recorded_at
          FROM audit_events
          WHERE subject_type='work_order' AND subject_id=${input.workOrderId}
            AND action=${HISTORIC_P2_COMPATIBILITY_RELEASE}
          ORDER BY id LIMIT 1`)
      )[0];
      return {
        released: false,
        alreadyReleased: true,
        eligibility,
        workOrder: eligibility.workOrder,
        auditEvent: priorAudit ?? null,
      };
    }
    if (!eligibility.eligible) {
      throw new HistoricP2ManufacturingReleaseError(
        'HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE',
        'Historic P2 release evidence is incomplete or contradictory.',
        409,
        { eligibility, blockers: eligibility.blockers }
      );
    }
    if (!eligibility.project || !eligibility.workOrder) {
      throw new HistoricP2ManufacturingReleaseError(
        'HISTORIC_P2_RELEASE_CONTEXT_MISSING',
        'Historic P2 release context could not be proven.',
        409,
        { eligibility }
      );
    }

    const releasedAt = new Date();
    const updated = rows(
      await tx.execute(sql`
        UPDATE production_work_orders
        SET status='RELEASED',updated_at=${releasedAt}
        WHERE id=${input.workOrderId} AND status IN ('DRAFT','PLANNED','READY')
        RETURNING id,project_id,work_order_number,part_number,status,wad_status,updated_at`)
    )[0];
    if (!updated) {
      throw new HistoricP2ManufacturingReleaseError(
        'WORK_ORDER_RELEASE_CONCURRENCY_CONFLICT',
        'The manufacturing order changed before it could be released.',
        409,
        { eligibility }
      );
    }
    const releasedWorkOrder = {
      id: clean(updated.id),
      projectId: clean(updated.project_id),
      workOrderNumber: clean(updated.work_order_number),
      partNumber: clean(updated.part_number),
      status: clean(updated.status).toUpperCase(),
      wadStatus: clean(updated.wad_status).toUpperCase(),
      updatedAt: updated.updated_at ?? releasedAt,
    };

    const reason =
      clean(input.reason) ||
      'Existing historic P2 production authorization was reconciled for current manufacturing execution.';
    const evidenceSnapshot = {
      mechanism: HISTORIC_P2_COMPATIBILITY_RELEASE,
      projectId: eligibility.project.id,
      projectCode: eligibility.project.projectCode,
      storedWorkflowVersion: eligibility.project.storedWorkflowVersion,
      effectiveWorkflowVersion: eligibility.project.effectiveWorkflowVersion,
      manufacturingOrderId: eligibility.workOrder.id,
      manufacturingOrderNumber: eligibility.workOrder.workOrderNumber,
      linkedP2PoId: eligibility.project.linkedP2PoId,
      evidence: eligibility.evidence.map((item) => ({
        key: item.key,
        label: item.label,
        passed: item.passed,
        referenceIds: item.referenceIds ?? [],
      })),
      beforeStatus: eligibility.workOrder.status,
      resultingStatus: 'RELEASED',
      actorUserId: input.actor.userId,
      actorEmployeeId: input.actor.employeeId ?? null,
      actorDisplayName: input.actor.displayName,
      actorRole: input.actor.role,
      signatureMeaning:
        'Release an existing manufacturing order using verified historic P2 production authority.',
      reason,
      releasedAt: releasedAt.toISOString(),
    };
    const digest = evidenceDigest(evidenceSnapshot);
    const auditEvent = await recordAuditEvent(
      {
        eventType: HISTORIC_P2_COMPATIBILITY_RELEASE,
        subjectType: 'work_order',
        subjectId: input.workOrderId,
        sourceService: 'historicP2ManufacturingReleaseService',
        actor: {
          id: input.actor.employeeId ?? null,
          username: input.actor.displayName,
          role: input.actor.role,
        },
        occurredAt: releasedAt,
        reason,
        payload: {
          ...evidenceSnapshot,
          evidenceDigest: digest,
        },
        fieldsChanged: {
          status: {
            before: eligibility.workOrder.status,
            after: 'RELEASED',
          },
        },
        meta: {
          mechanism: HISTORIC_P2_COMPATIBILITY_RELEASE,
          projectId: eligibility.project.id,
          linkedP2PoId: eligibility.project.linkedP2PoId,
          evidenceDigest: digest,
        },
        entityType: 'work_order',
        entityId: input.workOrderId,
      },
      tx
    );

    return {
      released: true,
      alreadyReleased: false,
      eligibility,
      workOrder: releasedWorkOrder,
      auditEvent: {
        ...auditEvent,
        action: HISTORIC_P2_COMPATIBILITY_RELEASE,
        occurredAt: releasedAt.toISOString(),
      },
    };
  });
}
