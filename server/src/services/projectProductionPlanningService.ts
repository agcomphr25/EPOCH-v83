import { createHash } from 'crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import { evaluateCommercialBaseline } from './projectCommercialReviewService';
import { evaluateTechnicalConfigurationBaseline } from './projectTechnicalConfigurationReviewService';
import {
  ProjectProductionPlanningError,
  productionPlanItemBlockers,
} from './projectProductionPlanningValidation';

export { ProjectProductionPlanningError } from './projectProductionPlanningValidation';
type Executor = AuditLedgerTx;
// Raw-query records deliberately mirror additive tables without expanding the central schema surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type PlanningActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};
export type PlanHeaderInput = {
  requirementSource: string;
  planningBasis: string;
  effectivityType?: string;
  effectivityReference?: string;
  notes?: string | null;
};
const resultRows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

async function context(
  projectId: string,
  tx: Executor,
  lock = false,
  requireTechnicalBaseline = true
) {
  const project = resultRows(
    await tx.execute(
      sql`SELECT id, workflow_version, po_id FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  )[0];
  if (!project)
    throw new ProjectProductionPlanningError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  const version = resolveProjectWorkflowVersion(project.workflow_version);
  if (version !== 'p2_v2')
    throw new ProjectProductionPlanningError(
      'P2_V2_REQUIRED',
      'Production Planning requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id=${projectId} AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (instances.length !== 1)
    throw new ProjectProductionPlanningError(
      instances.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      instances.length
        ? 'Multiple active V2 instances exist.'
        : 'An active V2 workflow instance is required.',
      409
    );
  const steps = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`
    )
  );
  const issues = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (issues.length)
    throw new ProjectProductionPlanningError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find((row) => row.step_type === 'production_planning');
  const compatibilityDefinition = Number(instances[0].definition_version) === 1;
  const technical = steps.find((row) =>
    compatibilityDefinition
      ? row.step_type === 'design_applicability'
      : row.step_type === 'technical_configuration_review'
  );
  if (!step)
    throw new ProjectProductionPlanningError(
      'PRODUCTION_PLANNING_STAGE_REQUIRED',
      'Production Planning stage is missing.',
      409
    );
  if (requireTechnicalBaseline) {
    if (
      !technical ||
      !(compatibilityDefinition
        ? ['COMPLETE', 'NOT_APPLICABLE'].includes(technical.status)
        : technical.status === 'COMPLETE')
    )
      throw new ProjectProductionPlanningError(
        'TECHNICAL_CONFIGURATION_REVIEW_REQUIRED',
        'Technical & Configuration Review must be complete and current.',
        409
      );
  }
  if (requireTechnicalBaseline && !compatibilityDefinition) {
    const baseline = await evaluateTechnicalConfigurationBaseline(
      projectId,
      tx
    );
    if (!baseline.valid)
      throw new ProjectProductionPlanningError(
        'TECHNICAL_CONFIGURATION_BASELINE_INVALID',
        'Technical & Configuration Review is incomplete or stale.',
        409,
        { blockers: baseline.blockers }
      );
  }
  return {
    project,
    instance: instances[0],
    step,
    steps,
    technical,
    compatibilityDefinition,
  };
}

async function currentPlan(projectId: string, tx: Executor) {
  return (
    resultRows(
      await tx.execute(
        sql`SELECT * FROM project_production_plans WHERE project_id=${projectId} AND status<>'SUPERSEDED' ORDER BY revision_number DESC LIMIT 1`
      )
    )[0] ?? null
  );
}

async function currentPo(
  projectId: string,
  projectPoId: number | null,
  tx: Executor
) {
  return (
    resultRows(
      await tx.execute(sql`
    WITH selected AS (SELECT COALESCE(parent_po_id,id) root_id FROM p2_purchase_orders WHERE id=${projectPoId})
    SELECT po.* FROM p2_purchase_orders po LEFT JOIN selected s ON true
    WHERE (po.project_id=${projectId} OR po.id=s.root_id OR po.parent_po_id=s.root_id) AND po.is_current_revision=true
    ORDER BY po.revision_number DESC, po.updated_at DESC LIMIT 1`)
    )[0] ?? null
  );
}

async function configurationRows(
  projectId: string,
  poId: number,
  tx: Executor
) {
  return resultRows(
    await tx.execute(sql`
    WITH RECURSIVE roots AS (
      SELECT ('root:'||poi.id)::text AS assembly_path, NULL::text AS parent_part_number,
             COALESCE(ii.ag_part_number,poi.part_number) part_number, COALESCE(ii.name,poi.part_name) part_name,
             ii.id inventory_item_id, ii.manufacturing_level::text manufacturing_level,
             COALESCE(ii.item_type::text,ii.type) item_type, poi.quantity::numeric qty_per, poi.quantity::numeric extended_qty,
             ARRAY[COALESCE(ii.ag_part_number,poi.part_number)]::text[] cycle_path
      FROM p2_purchase_order_items poi LEFT JOIN inventory_items ii ON ii.id=poi.inventory_item_id WHERE poi.po_id=${poId}
    ), tree AS (
      SELECT roots.*, 0 depth, selected_bom.bom_id, selected_bom.revision_id, selected_bom.rev_code, selected_bom.is_released
      FROM roots
      LEFT JOIN LATERAL (
        SELECT b.id bom_id, br.id revision_id, br.rev_code, br.is_released
        FROM boms b JOIN bom_revisions br ON br.bom_id=b.id
        WHERE b.parent_part_ag_number=roots.part_number AND b.is_active=true
        ORDER BY br.is_released DESC, br.effective_from DESC NULLS LAST, br.created_at DESC LIMIT 1
      ) selected_bom ON true
      UNION ALL
      SELECT tree.assembly_path||'/line:'||bl.id, tree.part_number, bl.child_part_ag_number, ii.name, ii.id,
             ii.manufacturing_level::text, COALESCE(ii.item_type::text,ii.type), bl.qty_per,
             tree.extended_qty*bl.qty_per, tree.cycle_path||bl.child_part_ag_number, tree.depth+1,
             child_bom.bom_id, child_bom.revision_id, child_bom.rev_code, child_bom.is_released
      FROM tree JOIN bom_lines bl ON bl.revision_id=tree.revision_id
      LEFT JOIN inventory_items ii ON ii.ag_part_number=bl.child_part_ag_number
      LEFT JOIN LATERAL (
        SELECT b.id bom_id, br.id revision_id, br.rev_code, br.is_released
        FROM boms b JOIN bom_revisions br ON br.bom_id=b.id
        WHERE b.parent_part_ag_number=bl.child_part_ag_number AND b.is_active=true
        ORDER BY br.is_released DESC, br.effective_from DESC NULLS LAST, br.created_at DESC LIMIT 1
      ) child_bom ON true
      WHERE tree.depth<25 AND NOT bl.child_part_ag_number=ANY(tree.cycle_path)
    )
    SELECT tree.*,
      routing.id routing_id, routing.routing_revision, routing.is_active routing_is_active,
      template.approval_status routing_template_status,
      COALESCE(upper(tree.item_type)='MANUFACTURED', tree.bom_id IS NOT NULL) is_manufactured
    FROM tree
    LEFT JOIN LATERAL (
      SELECT pr.* FROM part_routings pr
      WHERE pr.part_number=tree.part_number AND (pr.project_id=${projectId} OR pr.project_id IS NULL)
      ORDER BY (pr.project_id=${projectId}) DESC, pr.is_active DESC, pr.routing_revision DESC LIMIT 1
    ) routing ON true
    LEFT JOIN production_control_templates template ON template.id=routing.created_from_template_id
    ORDER BY tree.assembly_path`)
  );
}

function baselineHash(po: Row, rows: Row[], technicalBasis?: Row | null) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        po: [po.id, po.revision_number, po.updated_at],
        technicalBasis: technicalBasis
          ? [
              technicalBasis.id,
              technicalBasis.source_revision ?? technicalBasis.release_revision,
              technicalBasis.status ?? technicalBasis.release_status,
            ]
          : null,
        items: rows.map((row) => [
          row.assembly_path,
          row.part_number,
          row.revision_id,
          row.rev_code,
          row.routing_id,
          row.routing_revision,
        ]),
      })
    )
    .digest('hex');
}

async function currentDesignRelease(projectId: string, tx: Executor) {
  return (
    resultRows(
      await tx.execute(sql`
        SELECT er.id,er.release_revision,er.release_status
        FROM project_design_applicability_decisions decision
        JOIN design_control_records dcr ON dcr.rd_project_id=decision.linked_design_project_id AND dcr.project_id=${projectId}
        JOIN engineering_releases er ON er.design_control_record_id=dcr.id AND er.release_status='RELEASED'
        WHERE decision.project_id=${projectId} AND decision.status='APPROVED'
        ORDER BY er.released_at DESC NULLS LAST,er.created_at DESC LIMIT 1`)
    )[0] ?? null
  );
}

async function insertConfigurationItems(plan: Row, rows: Row[], tx: Executor) {
  for (const row of rows) {
    const manufactured = Boolean(row.is_manufactured);
    const routingStatus = !row.routing_id
      ? 'MISSING'
      : !row.routing_is_active
        ? 'INACTIVE'
        : row.routing_template_status === 'APPROVED'
          ? 'RELEASED'
          : 'ACTIVE_UNAPPROVED';
    await tx.execute(sql`INSERT INTO project_production_plan_items
      (production_plan_id,project_id,inventory_item_id,part_number,part_name,manufacturing_level,parent_part_number,assembly_path,quantity_per_parent,extended_project_quantity,make_buy,is_manufactured,bom_id,bom_revision_id,bom_revision,bom_release_status,routing_id,routing_revision,routing_release_status,effectivity_reference,specification_references,work_instruction_references,special_process_requirements,required_certifications,required_test_records,tooling_requirements,cnc_program_requirements)
      VALUES (${plan.id},${plan.project_id},${row.inventory_item_id},${row.part_number},${row.part_name},${row.manufacturing_level},${row.parent_part_number},${row.assembly_path},${row.qty_per},${row.extended_qty},${manufactured ? 'MAKE' : 'BUY'},${manufactured},${row.bom_id},${row.revision_id},${row.rev_code},${!manufactured ? 'NOT_REQUIRED_APPROVED' : !row.bom_id ? 'MISSING' : row.is_released ? 'RELEASED' : 'UNRELEASED'},${row.routing_id},${row.routing_revision == null ? null : String(row.routing_revision)},${manufactured ? routingStatus : 'NOT_REQUIRED_APPROVED'},${plan.effectivity_reference},'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb)`);
  }
}

async function audit(
  eventType: string,
  plan: Row,
  actor: PlanningActor,
  tx: Executor,
  reason?: string
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_production_plan',
      subjectId: plan.id,
      sourceService: 'projectProductionPlanningService',
      actor: { id: actor.userId, username: actor.username, role: actor.role },
      reason,
      payload: {
        projectId: plan.project_id,
        revisionNumber: plan.revision_number,
        poId: plan.po_id,
        poRevisionNumber: plan.po_revision_number,
      },
    },
    tx
  );
}

async function releaseAuthoritativeLinks(
  model: Awaited<ReturnType<typeof readModel>>,
  actor: PlanningActor,
  tx: Executor
) {
  const plan = model.plan!;
  await tx.execute(
    sql`UPDATE project_workflow_step_links SET unlinked_at=now(),unlink_reason=${`Superseded by Production Plan revision ${plan.revision_number}`},updated_at=now() WHERE workflow_step_instance_id=${model.stage.id} AND is_authoritative=true AND unlinked_at IS NULL`
  );
  const links: Array<[string, string, string | null, string | null]> = [
    [
      'PO_REVISION',
      String(plan.po_id),
      String(plan.po_revision_number),
      plan.effectivity_reference,
    ],
    [
      'CONFIGURATION_BASELINE',
      plan.configuration_baseline_id,
      plan.configuration_revision,
      plan.effectivity_reference,
    ],
  ];
  if (plan.design_release_id)
    links.push([
      'ENGINEERING_RELEASE',
      plan.design_release_id,
      plan.design_release_revision,
      plan.effectivity_reference,
    ]);
  for (const item of model.items) {
    if (item.bom_revision_id)
      links.push([
        'BOM_REVISION',
        item.bom_revision_id,
        item.bom_revision,
        item.effectivity_reference,
      ]);
    if (item.routing_id)
      links.push([
        'PART_ROUTING',
        item.routing_id,
        item.routing_revision,
        item.effectivity_reference,
      ]);
    for (const reference of Array.isArray(item.work_instruction_references)
      ? item.work_instruction_references
      : [])
      links.push([
        'CONTROLLED_WORK_INSTRUCTION',
        clean(reference),
        null,
        item.effectivity_reference,
      ]);
    if (clean(item.sampling_plan_id))
      links.push([
        'SAMPLING_PLAN',
        clean(item.sampling_plan_id),
        null,
        item.effectivity_reference,
      ]);
    if (clean(item.packaging_instruction_reference))
      links.push([
        'PACKAGING_INSTRUCTION',
        clean(item.packaging_instruction_reference),
        null,
        item.effectivity_reference,
      ]);
  }
  for (const [recordType, recordId, revision, effectivity] of links.filter(
    (link) => Boolean(link[1])
  )) {
    await tx.execute(
      sql`INSERT INTO project_workflow_step_links (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,is_authoritative,record_revision,effectivity_reference,linked_by,linked_by_display_name) VALUES (${model.stage.id},${plan.project_id},${recordType},${recordId},${recordType === 'PO_REVISION' || recordType === 'CONFIGURATION_BASELINE' ? 'PRIMARY' : 'EVIDENCE'},true,${revision},${effectivity},${actor.employeeId ?? null},${actor.displayName})`
    );
  }
}

async function approvals(planId: string, stepId: string, tx: Executor) {
  return resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${stepId} AND evidence_snapshot->>'planId'=${planId} ORDER BY decided_at`
    )
  );
}

async function staleness(
  plan: Row,
  items: Row[],
  ctx: Awaited<ReturnType<typeof context>>,
  tx: Executor
) {
  const differences: string[] = [];
  const po = await currentPo(plan.project_id, ctx.project.po_id, tx);
  if (
    !po ||
    Number(po.id) !== Number(plan.po_id) ||
    Number(po.revision_number) !== Number(plan.po_revision_number)
  )
    differences.push(
      'Current customer PO revision differs from the released planning baseline.'
    );
  if (plan.design_release_id) {
    const release = resultRows(
      await tx.execute(
        sql`SELECT er.id,er.release_revision,er.release_status,dcr.status design_control_status FROM engineering_releases er JOIN design_control_records dcr ON dcr.id=er.design_control_record_id WHERE er.id=${plan.design_release_id}`
      )
    )[0];
    if (
      !release ||
      release.release_status !== 'RELEASED' ||
      release.design_control_status !== 'engineering_released' ||
      release.release_revision !== plan.design_release_revision
    )
      differences.push(
        'The controlling Engineering Release was reopened or superseded.'
      );
  }
  if (!ctx.compatibilityDefinition) {
    const technical = await evaluateTechnicalConfigurationBaseline(
      plan.project_id,
      tx
    );
    const currentReference = technical.review
      ? `Technical Review ${technical.review.revision_number}:${technical.review.source_revision}`
      : null;
    if (!technical.valid || plan.configuration_revision !== currentReference)
      differences.push(
        'Technical & Configuration Review is stale or differs from the released planning baseline.'
      );
  }
  for (const item of items.filter((row) => row.is_manufactured)) {
    const state = resultRows(
      await tx.execute(
        sql`SELECT br.id revision_id, br.rev_code, br.is_released FROM boms b LEFT JOIN LATERAL (SELECT * FROM bom_revisions WHERE bom_id=b.id ORDER BY is_released DESC, created_at DESC LIMIT 1) br ON true WHERE b.parent_part_ag_number=${item.part_number} AND b.is_active=true LIMIT 1`
      )
    )[0];
    if (
      String(state?.revision_id ?? '') !== String(item.bom_revision_id ?? '') ||
      !state?.is_released
    )
      differences.push(`${item.part_number}: BOM revision/release changed.`);
    const routing = resultRows(
      await tx.execute(
        sql`SELECT pr.id,pr.routing_revision,pr.is_active,pct.approval_status FROM part_routings pr LEFT JOIN production_control_templates pct ON pct.id=pr.created_from_template_id WHERE pr.part_number=${item.part_number} AND (pr.project_id=${plan.project_id} OR pr.project_id IS NULL) ORDER BY (pr.project_id=${plan.project_id}) DESC,pr.is_active DESC,pr.routing_revision DESC LIMIT 1`
      )
    )[0];
    if (
      String(routing?.id ?? '') !== String(item.routing_id ?? '') ||
      String(routing?.routing_revision ?? '') !==
        String(item.routing_revision ?? '') ||
      routing?.approval_status !== 'APPROVED'
    )
      differences.push(
        `${item.part_number}: routing revision/release changed.`
      );
  }
  return Array.from(new Set(differences));
}

async function readModel(projectId: string, tx: Executor) {
  const ctx = await context(projectId, tx, false, false);
  const plan = await currentPlan(projectId, tx);
  const history = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_production_plans WHERE project_id=${projectId} ORDER BY revision_number DESC`
    )
  );
  const items = plan
    ? resultRows(
        await tx.execute(
          sql`SELECT * FROM project_production_plan_items WHERE production_plan_id=${plan.id} ORDER BY assembly_path`
        )
      )
    : [];
  const order = resultRows(
    await tx.execute(sql`
      SELECT p.project_code,p.project_name,p.target_ship_date,
             po.po_number,po.revision_number po_revision_number,
             po.customer_name,po.expected_delivery,po.status po_status,
             q.quote_number,q.status quote_status
      FROM projects p
      LEFT JOIN p2_purchase_orders po ON po.id=p.po_id
      LEFT JOIN quotes q ON q.id=po.source_quote_id
      WHERE p.id=${projectId}`)
  )[0];
  const orderLines = resultRows(
    await tx.execute(sql`
      SELECT poi.id,poi.part_number customer_part_number,
             COALESCE(ii.ag_part_number,poi.part_number) ag_part_number,
             COALESCE(ii.name,poi.part_name) description,
             poi.quantity,poi.due_date
      FROM projects p
      JOIN p2_purchase_order_items poi ON poi.po_id=p.po_id
      LEFT JOIN inventory_items ii ON ii.id=poi.inventory_item_id
      WHERE p.id=${projectId}
      ORDER BY poi.id`)
  );
  const commercialSources = resultRows(
    await tx.execute(sql`
      SELECT stage_type,status,source_record_type,source_revision,source_snapshot
      FROM project_commercial_stage_reviews
      WHERE project_id=${projectId} AND status<>'SUPERSEDED'
      ORDER BY stage_type,revision_number DESC`)
  );
  const technicalSource = resultRows(
    await tx.execute(sql`
      SELECT status,source_revision,technical_baseline,released_evidence,
             effectivity_reference
      FROM project_technical_configuration_reviews
      WHERE project_id=${projectId} AND status<>'SUPERSEDED'
      ORDER BY revision_number DESC LIMIT 1`)
  )[0];
  const rfqSource = commercialSources.find(
    (entry) => entry.stage_type === 'rfq_risk_assessment'
  );
  const rfqSnapshot = (rfqSource?.source_snapshot ?? {}) as Row;
  const rfqRecord = (rfqSnapshot.rfq ?? {}) as Row;
  const currentApprovals = plan
    ? await approvals(plan.id, ctx.step.id, tx)
    : [];
  const approvalHistory = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${ctx.step.id} AND approval_type LIKE 'PRODUCTION_PLANNING_%' ORDER BY decided_at DESC`
    )
  );
  const blockers = plan
    ? items.flatMap(productionPlanItemBlockers)
    : ['Create a Production Planning draft.'];
  const commercial = await evaluateCommercialBaseline(projectId, tx);
  blockers.push(...commercial.blockers);
  if (!ctx.compatibilityDefinition) {
    const technical = await evaluateTechnicalConfigurationBaseline(
      projectId,
      tx
    );
    blockers.push(...technical.blockers);
  }
  for (const item of items.filter((row) => row.is_manufactured)) {
    if (
      item.inspection_extent === 'APPROVED_SAMPLING' &&
      clean(item.sampling_plan_id)
    ) {
      const approved = resultRows(
        await tx.execute(sql`
          SELECT id FROM controlled_documents
          WHERE (id::text=${clean(item.sampling_plan_id)} OR document_number=${clean(item.sampling_plan_id)})
            AND lower(status)='approved'
          UNION ALL
          SELECT id FROM production_control_templates
          WHERE (id::text=${clean(item.sampling_plan_id)} OR name=${clean(item.sampling_plan_id)})
            AND template_type='QC' AND approval_status='APPROVED'
          LIMIT 1`)
      );
      if (!approved.length)
        blockers.push(
          `${item.part_number}: sampling-plan reference is not an approved controlled record.`
        );
    }
    if (item.work_instruction_requirement === 'REQUIRED') {
      const references = Array.isArray(item.work_instruction_references)
        ? item.work_instruction_references.map(clean).filter(Boolean)
        : [];
      if (!references.length)
        blockers.push(
          `${item.part_number}: controlled work instruction required.`
        );
      for (const reference of references) {
        const approved = resultRows(
          await tx.execute(
            sql`SELECT id FROM controlled_documents WHERE (id::text=${reference} OR document_number=${reference}) AND lower(status)='approved' LIMIT 1`
          )
        );
        if (!approved.length)
          blockers.push(
            `${item.part_number}: work instruction ${reference} is not approved.`
          );
      }
    }
    if (
      item.work_instruction_requirement === 'DRAWING_SPEC_SUFFICIENT' &&
      (!clean(item.drawing_number) || !clean(item.drawing_revision))
    )
      blockers.push(
        `${item.part_number}: drawing/specification sufficiency requires drawing number and revision.`
      );
    if (
      item.packaging_instruction_requirement === 'REQUIRED' &&
      clean(item.packaging_instruction_reference)
    ) {
      const approved = resultRows(
        await tx.execute(
          sql`SELECT id FROM controlled_documents WHERE (id::text=${clean(item.packaging_instruction_reference)} OR document_number=${clean(item.packaging_instruction_reference)}) AND lower(status)='approved' LIMIT 1`
        )
      );
      if (!approved.length)
        blockers.push(
          `${item.part_number}: packaging instruction is not an approved controlled document.`
        );
    }
  }
  if (plan && !plan.configuration_baseline_id)
    blockers.push('Configuration baseline is required.');
  if (plan && !clean(plan.effectivity_reference))
    blockers.push('Configuration effectivity is required.');
  if (plan && items.filter((item) => item.is_manufactured).length === 0)
    blockers.push('At least one manufactured item is required.');
  const staleDifferences = plan ? await staleness(plan, items, ctx, tx) : [];
  if (plan?.status === 'RELEASED') blockers.push(...staleDifferences);
  return {
    plan,
    items,
    orderConfirmation: {
      projectCode: order?.project_code ?? null,
      projectName: order?.project_name ?? null,
      customer: order?.customer_name ?? null,
      rfq: rfqRecord.rfq_number ?? rfqRecord.rfqNumber ?? null,
      acceptedQuote: order?.quote_number ?? null,
      acceptedQuoteStatus: order?.quote_status ?? null,
      customerPurchaseOrder: order?.po_number ?? null,
      customerPurchaseOrderRevision: order?.po_revision_number ?? null,
      customerPurchaseOrderStatus: order?.po_status ?? null,
      requiredDeliveryDate:
        order?.expected_delivery ?? order?.target_ship_date ?? null,
      lines: orderLines,
      technicalBaseline: technicalSource
        ? {
            status: technicalSource.status,
            sourceRevision: technicalSource.source_revision,
            effectivityReference: technicalSource.effectivity_reference,
            requirements: technicalSource.technical_baseline,
            releasedEvidence: technicalSource.released_evidence,
          }
        : null,
      sources: commercialSources.map((source) => ({
        name: String(source.stage_type).replaceAll('_', ' '),
        status: source.status,
        type: source.source_record_type,
        revision: source.source_revision,
      })),
    },
    history,
    approvals: currentApprovals,
    approvalHistory,
    stage: ctx.step,
    readiness: {
      ready: Boolean(plan) && blockers.length === 0,
      blockers,
      stale: staleDifferences.length > 0,
      differences: staleDifferences,
    },
  };
}

export const getCurrentProductionPlan = (
  projectId: string,
  tx: Executor = db
) => readModel(projectId, tx);
export async function getProductionPlanHistory(
  projectId: string,
  tx: Executor = db
) {
  await context(projectId, tx);
  return resultRows(
    await tx.execute(
      sql`SELECT * FROM project_production_plans WHERE project_id=${projectId} ORDER BY revision_number DESC`
    )
  );
}

async function createRevision(
  projectId: string,
  input: PlanHeaderInput,
  actor: PlanningActor,
  tx: Executor,
  revision: number
) {
  const ctx = await context(projectId, tx, true);
  const po = await currentPo(projectId, ctx.project.po_id, tx);
  if (!po)
    throw new ProjectProductionPlanningError(
      'CURRENT_PO_REQUIRED',
      'A current linked P2 PO revision is required.',
      409
    );
  const rows = await configurationRows(projectId, po.id, tx);
  if (!rows.length)
    throw new ProjectProductionPlanningError(
      'PO_ITEMS_REQUIRED',
      'The current P2 PO has no configuration items.',
      409
    );
  const designRelease = ctx.compatibilityDefinition
    ? await currentDesignRelease(projectId, tx)
    : null;
  const technical = ctx.compatibilityDefinition
    ? null
    : await evaluateTechnicalConfigurationBaseline(projectId, tx);
  const technicalBasis = technical?.review ?? designRelease;
  const baseline = baselineHash(po, rows, technicalBasis);
  const configurationRevision = technical?.review
    ? `Technical Review ${technical.review.revision_number}:${technical.review.source_revision}`
    : `PO ${po.po_number} Rev ${po.revision_number}`;
  const plan = resultRows(
    await tx.execute(
      sql`INSERT INTO project_production_plans (project_id,workflow_instance_id,workflow_step_instance_id,revision_number,status,po_id,po_revision_number,po_number,configuration_baseline_id,configuration_revision,design_release_id,design_release_revision,effectivity_type,effectivity_reference,requirement_source,planning_basis,notes,created_by,created_by_display_name) VALUES (${projectId},${ctx.instance.id},${ctx.step.id},${revision},'DRAFT',${po.id},${po.revision_number},${po.po_number},${baseline},${configurationRevision},${designRelease?.id ?? null},${designRelease?.release_revision ?? null},${input.effectivityType ?? 'PO_REVISION'},${clean(input.effectivityReference) || `PO ${po.po_number} Rev ${po.revision_number}`},${clean(input.requirementSource)},${clean(input.planningBasis)},${clean(input.notes) || null},${actor.userId},${actor.displayName}) RETURNING *`
    )
  )[0];
  await insertConfigurationItems(plan, rows, tx);
  return plan;
}

export async function createDraftFromCurrentConfiguration(
  projectId: string,
  input: PlanHeaderInput,
  actor: PlanningActor
) {
  if (!clean(input.requirementSource) || !clean(input.planningBasis))
    throw new ProjectProductionPlanningError(
      'PLAN_HEADER_REQUIRED',
      'Requirement source and planning basis are required.'
    );
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    if (await currentPlan(projectId, tx))
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_EXISTS',
        'Revise the current plan instead.',
        409
      );
    const plan = await createRevision(projectId, input, actor, tx, 1);
    await audit('P2_V2_PRODUCTION_PLAN_DRAFT_CREATED', plan, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function refreshDraft(
  projectId: string,
  planId: string,
  actor: PlanningActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const plan = await currentPlan(projectId, tx);
    if (!plan || plan.id !== planId)
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_NOT_FOUND',
        'Current plan not found.',
        404
      );
    if (plan.status !== 'DRAFT')
      throw new ProjectProductionPlanningError(
        'DRAFT_REQUIRED',
        'Only a draft can be refreshed.',
        409
      );
    const po = await currentPo(projectId, ctx.project.po_id, tx);
    if (!po)
      throw new ProjectProductionPlanningError(
        'CURRENT_PO_REQUIRED',
        'Current PO revision required.',
        409
      );
    const rows = await configurationRows(projectId, po.id, tx);
    const designRelease = ctx.compatibilityDefinition
      ? await currentDesignRelease(projectId, tx)
      : null;
    const technical = ctx.compatibilityDefinition
      ? null
      : await evaluateTechnicalConfigurationBaseline(projectId, tx);
    const technicalBasis = technical?.review ?? designRelease;
    const configurationRevision = technical?.review
      ? `Technical Review ${technical.review.revision_number}:${technical.review.source_revision}`
      : `PO ${po.po_number} Rev ${po.revision_number}`;
    await tx.execute(
      sql`DELETE FROM project_production_plan_items WHERE production_plan_id=${planId}`
    );
    await tx.execute(
      sql`UPDATE project_production_plans SET po_id=${po.id},po_revision_number=${po.revision_number},po_number=${po.po_number},configuration_baseline_id=${baselineHash(po, rows, technicalBasis)},configuration_revision=${configurationRevision},design_release_id=${designRelease?.id ?? null},design_release_revision=${designRelease?.release_revision ?? null},effectivity_reference=${`PO ${po.po_number} Rev ${po.revision_number}`},updated_at=now() WHERE id=${planId}`
    );
    const refreshed = {
      ...plan,
      project_id: projectId,
      effectivity_reference: `PO ${po.po_number} Rev ${po.revision_number}`,
    };
    await insertConfigurationItems(refreshed, rows, tx);
    await audit('P2_V2_PRODUCTION_PLAN_DRAFT_REFRESHED', plan, actor, tx);
    return readModel(projectId, tx);
  });
}

const editableFields = new Set([
  'drawing_number',
  'drawing_revision',
  'specification_references',
  'routing_requirement',
  'routing_not_required_reason',
  'traveler_requirement',
  'traveler_type',
  'traveler_not_required_reason',
  'work_instruction_requirement',
  'work_instruction_basis',
  'work_instruction_references',
  'specification_sheet_requirement',
  'inspection_requirement',
  'in_process_inspection_required',
  'final_inspection_required',
  'inspection_extent',
  'sampling_plan_id',
  'sampling_plan_status',
  'fai_requirement',
  'fai_reason',
  'traceability_level',
  'serialization_required',
  'lot_traceability_required',
  'special_process_source',
  'special_process_requirements',
  'required_certifications',
  'required_test_records',
  'tooling_requirements',
  'cnc_program_requirements',
  'packaging_instruction_requirement',
  'packaging_instruction_reference',
  'requirement_source',
  'notes',
]);
const jsonFields = new Set([
  'specification_references',
  'work_instruction_references',
  'special_process_requirements',
  'required_certifications',
  'required_test_records',
  'tooling_requirements',
  'cnc_program_requirements',
]);
export async function updatePlanItemDecision(
  projectId: string,
  planId: string,
  itemId: string,
  changes: Record<string, unknown>,
  actor: PlanningActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const plan = await currentPlan(projectId, tx);
    if (!plan || plan.id !== planId)
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_NOT_FOUND',
        'Current plan not found.',
        404
      );
    if (plan.status !== 'DRAFT')
      throw new ProjectProductionPlanningError(
        'DRAFT_REQUIRED',
        'Only draft plan items may be edited.',
        409
      );
    const entries = Object.entries(changes).filter(([key]) =>
      editableFields.has(key)
    );
    if (!entries.length)
      throw new ProjectProductionPlanningError(
        'NO_EDITABLE_FIELDS',
        'No editable planning fields supplied.'
      );
    for (const [key, value] of entries) {
      if (jsonFields.has(key)) {
        await tx.execute(
          sql`UPDATE project_production_plan_items SET ${sql.raw(key)}=${JSON.stringify(value ?? [])}::jsonb,updated_at=now() WHERE id=${itemId} AND production_plan_id=${planId} AND project_id=${projectId}`
        );
      } else {
        await tx.execute(
          sql`UPDATE project_production_plan_items SET ${sql.raw(key)}=${value},updated_at=now() WHERE id=${itemId} AND production_plan_id=${planId} AND project_id=${projectId}`
        );
      }
    }
    await audit('P2_V2_PRODUCTION_PLAN_ITEM_UPDATED', plan, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function submitForApproval(
  projectId: string,
  planId: string,
  actor: PlanningActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const plan = await currentPlan(projectId, tx);
    if (!plan || plan.id !== planId)
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_NOT_FOUND',
        'Current plan not found.',
        404
      );
    if (plan.status !== 'DRAFT')
      throw new ProjectProductionPlanningError(
        'DRAFT_REQUIRED',
        'Only a draft may be submitted.',
        409
      );
    const model = await readModel(projectId, tx);
    if (model.readiness.blockers.length)
      throw new ProjectProductionPlanningError(
        'PLAN_NOT_READY',
        'Production plan has readiness blockers.',
        409,
        { blockers: model.readiness.blockers }
      );
    await tx.execute(
      sql`UPDATE project_production_plans SET status='PENDING_APPROVAL',submitted_by=${actor.userId},submitted_by_display_name=${actor.displayName},submitted_at=now(),updated_at=now() WHERE id=${planId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL',blocked_reason=NULL,updated_at=now() WHERE id=${ctx.step.id}`
    );
    await audit('P2_V2_PRODUCTION_PLAN_SUBMITTED', plan, actor, tx);
    return readModel(projectId, tx);
  });
}

async function recordDecision(
  projectId: string,
  planId: string,
  capacity: 'ENGINEERING' | 'QUALITY' | 'OPERATIONS',
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: PlanningActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectProductionPlanningError(
      'SIGNATURE_MEANING_REQUIRED',
      'Signature meaning is required.'
    );
  if (decision !== 'APPROVED' && !clean(reason))
    throw new ProjectProductionPlanningError(
      'REASON_REQUIRED',
      'Rejection/return reason is required.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const plan = await currentPlan(projectId, tx);
    if (!plan || plan.id !== planId)
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_NOT_FOUND',
        'Current plan not found.',
        404
      );
    if (plan.status !== 'PENDING_APPROVAL')
      throw new ProjectProductionPlanningError(
        'PENDING_APPROVAL_REQUIRED',
        'Plan is not pending approval.',
        409
      );
    const existing = await approvals(planId, ctx.step.id, tx);
    if (
      existing.some(
        (a) => a.approval_type === `PRODUCTION_PLANNING_${capacity}`
      )
    )
      throw new ProjectProductionPlanningError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this revision.`,
        409
      );
    if (
      existing.some(
        (a) => a.actor_user_id === actor.userId && a.decision === 'APPROVED'
      )
    )
      throw new ProjectProductionPlanningError(
        'SEGREGATION_OF_DUTIES',
        'One user cannot provide multiple functional approvals.',
        403
      );
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id,project_id,approval_type,decision,signature_meaning,reason,actor_employee_id,actor_user_id,actor_display_name,actor_role,step_revision_snapshot,evidence_snapshot) VALUES (${ctx.step.id},${projectId},${`PRODUCTION_PLANNING_${capacity}`},${decision},${signatureMeaning},${clean(reason) || null},${actor.employeeId ?? null},${actor.userId},${actor.displayName},${actor.role},${String(plan.revision_number)},${JSON.stringify({ planId, capacity, configurationBaselineId: plan.configuration_baseline_id })}::jsonb)`
    );
    if (decision !== 'APPROVED') {
      await tx.execute(
        sql`UPDATE project_production_plans SET status='REJECTED',updated_at=now() WHERE id=${planId}`
      );
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='BLOCKED',blocked_reason=${`${capacity} ${decision.toLowerCase()}: ${clean(reason)}`},updated_at=now() WHERE id=${ctx.step.id}`
      );
    } else {
      const all = await approvals(planId, ctx.step.id, tx);
      if (
        ['ENGINEERING', 'QUALITY', 'OPERATIONS'].every((role) =>
          all.some(
            (a) =>
              a.approval_type === `PRODUCTION_PLANNING_${role}` &&
              a.decision === 'APPROVED'
          )
        )
      ) {
        const model = await readModel(projectId, tx);
        if (model.readiness.blockers.length)
          throw new ProjectProductionPlanningError(
            'PLAN_NOT_READY',
            'Plan changed or has readiness blockers.',
            409,
            { blockers: model.readiness.blockers }
          );
        await releaseAuthoritativeLinks(model, actor, tx);
        await tx.execute(
          sql`UPDATE project_production_plans SET status='RELEASED',released_by=${actor.userId},released_by_display_name=${actor.displayName},released_at=now(),updated_at=now() WHERE id=${planId}`
        );
        await tx.execute(
          sql`UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),completed_by=${actor.employeeId ?? null},completed_by_display_name=${actor.displayName},blocked_reason=NULL,revision_reference=${String(plan.revision_number)},effectivity_reference=${plan.effectivity_reference},updated_at=now() WHERE id=${ctx.step.id}`
        );
      }
    }
    await audit(
      `P2_V2_PRODUCTION_PLAN_${capacity}_DECIDED`,
      plan,
      actor,
      tx,
      clean(reason) || undefined
    );
    return readModel(projectId, tx);
  });
}
export const recordEngineeringDecision = (
  projectId: string,
  planId: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: PlanningActor
) =>
  recordDecision(
    projectId,
    planId,
    'ENGINEERING',
    decision,
    signatureMeaning,
    reason,
    actor
  );
export const recordQualityDecision = (
  projectId: string,
  planId: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: PlanningActor
) =>
  recordDecision(
    projectId,
    planId,
    'QUALITY',
    decision,
    signatureMeaning,
    reason,
    actor
  );
export const recordOperationsDecision = (
  projectId: string,
  planId: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: PlanningActor
) =>
  recordDecision(
    projectId,
    planId,
    'OPERATIONS',
    decision,
    signatureMeaning,
    reason,
    actor
  );

export async function revisePlan(
  projectId: string,
  planId: string,
  input: PlanHeaderInput,
  actor: PlanningActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const prior = await currentPlan(projectId, tx);
    if (!prior || prior.id !== planId)
      throw new ProjectProductionPlanningError(
        'CURRENT_PLAN_NOT_FOUND',
        'Current plan not found.',
        404
      );
    if (!['RELEASED', 'REJECTED'].includes(prior.status))
      throw new ProjectProductionPlanningError(
        'REVISION_NOT_ALLOWED',
        'Only released or rejected plans may be revised.',
        409
      );
    await tx.execute(
      sql`UPDATE project_production_plans SET status='SUPERSEDED',superseded_at=now(),updated_at=now() WHERE id=${planId}`
    );
    const next = await createRevision(
      projectId,
      input,
      actor,
      tx,
      Number(prior.revision_number) + 1
    );
    await tx.execute(
      sql`UPDATE project_production_plans SET superseded_by_plan_id=${next.id} WHERE id=${planId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_approvals SET superseded_at=now() WHERE workflow_step_instance_id=${prior.workflow_step_instance_id} AND evidence_snapshot->>'planId'=${planId} AND superseded_at IS NULL`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',completed_at=NULL,completed_by=NULL,completed_by_display_name=NULL,blocked_reason=NULL,updated_at=now() WHERE id=${prior.workflow_step_instance_id}`
    );
    await audit('P2_V2_PRODUCTION_PLAN_REVISED', next, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function evaluateProductionPlanningReadiness(
  projectId: string,
  tx: Executor = db
) {
  return (await readModel(projectId, tx)).readiness;
}
export async function synchronizeProductionPlanningStage(
  projectId: string,
  tx: Executor = db
) {
  const model = await readModel(projectId, tx);
  if (model.plan?.status === 'RELEASED' && model.readiness.stale) {
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='BLOCKED',blocked_reason=${model.readiness.differences.join(' ')},completed_at=NULL,completed_by=NULL,completed_by_display_name=NULL,updated_at=now() WHERE id=${model.stage.id}`
    );
  }
  return readModel(projectId, tx);
}
