/**
 * Reconcile an already-converted legacy project with its preserved completion
 * evidence. This does not recreate, edit, or delete the legacy records.
 *
 * Usage:
 *   npx tsx server/scripts/reconcileConvertedProjectEvidence.ts --project=PRJ-026
 *   npx tsx server/scripts/reconcileConvertedProjectEvidence.ts --project=PRJ-026 --apply --confirm-project=PRJ-026
 */

import { sql } from 'drizzle-orm';

import { db, pgPool } from '../db';

type Row = Record<string, unknown>;
type Evidence = {
  stage: string;
  recordType: string;
  recordId: string;
  completedAt: unknown;
  completedBy: number | null;
  completedByDisplayName: string;
  note: string;
};

const resultRows = (result: unknown): Row[] =>
  (result as { rows?: Row[] } | null)?.rows ?? [];
const arg = (name: string) =>
  process.argv
    .slice(2)
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim() || null;

async function load(identifier: string) {
  const projects = await pgPool.query(
    `SELECT p.id,p.project_code,p.project_name,p.workflow_version,p.current_stage,
            wi.id workflow_instance_id,wi.definition_version
       FROM projects p
       LEFT JOIN project_workflow_instances wi ON wi.project_id=p.id
        AND wi.workflow_version='p2_v2' AND wi.status NOT IN ('SUPERSEDED','CANCELLED')
      WHERE p.id::text=$1 OR p.project_code=$1`,
    [identifier]
  );
  if (projects.rowCount !== 1)
    throw new Error(
      `Expected one project for ${identifier}; found ${projects.rowCount}.`
    );
  const project = projects.rows[0] as Row;
  if (project.workflow_version !== 'p2_v2' || !project.workflow_instance_id)
    throw new Error(
      'Project must already be converted to p2_v2 with one active workflow instance.'
    );

  const legacy = await pgPool.query(
    `SELECT id,step_type,status,completed_at,completed_by,completed_by_display_name,
            linked_purchase_review_id,linked_preproduction_checklist_id,linked_p2_order_id
       FROM project_steps WHERE project_id=$1 ORDER BY step_order`,
    [project.id]
  );
  const byType = new Map(
    legacy.rows.map((row) => [String(row.step_type), row as Row])
  );
  for (const type of [
    'rfq_risk_assessment',
    'quote',
    'purchase_review_checklist',
    'preproduction_checklist',
  ]) {
    if (byType.get(type)?.status !== 'completed')
      throw new Error(
        `Legacy ${type} is not completed; reconciliation is not allowed.`
      );
  }

  const wads = await pgPool.query(
    `SELECT id,work_order_number,status,wad_status,updated_at
       FROM production_work_orders
      WHERE project_id=$1 AND status='RELEASED' AND wad_status='APPROVED'
      ORDER BY updated_at DESC`,
    [project.id]
  );
  if (wads.rowCount !== 1)
    throw new Error(
      `Expected exactly one released approved project WAD; found ${wads.rowCount}.`
    );
  const wad = wads.rows[0] as Row;
  const poStep = byType.get('p2_order');
  if (!poStep?.linked_p2_order_id)
    throw new Error('The legacy P2 order step has no linked PO.');
  const purchaseOrders = await pgPool.query(
    `SELECT id,po_number,status,updated_at FROM p2_purchase_orders
      WHERE id=$1 AND project_id=$2 AND status IN ('released','in_production','completed')`,
    [poStep.linked_p2_order_id, project.id]
  );
  if (purchaseOrders.rowCount !== 1)
    throw new Error('The linked P2 PO is not released or in production.');
  const po = purchaseOrders.rows[0] as Row;

  const legacyEvidence = (
    stage: string,
    type: string,
    note: string
  ): Evidence => {
    const step = byType.get(type)!;
    return {
      stage,
      recordType: 'legacy_project_step',
      recordId: String(step.id),
      completedAt: step.completed_at,
      completedBy: Number(step.completed_by) || null,
      completedByDisplayName: String(
        step.completed_by_display_name ?? 'Legacy workflow conversion'
      ),
      note,
    };
  };
  const preproduction = byType.get('preproduction_checklist')!;
  const purchaseReview = byType.get('purchase_review_checklist')!;
  const evidence: Evidence[] = [
    legacyEvidence(
      'rfq_risk_assessment',
      'rfq_risk_assessment',
      'Satisfied by the completed legacy RFQ risk-assessment step.'
    ),
    legacyEvidence(
      'estimate_quote',
      'quote',
      'Satisfied by the completed legacy quote step.'
    ),
    legacyEvidence(
      'contract_review',
      'purchase_review_checklist',
      'Satisfied by the completed legacy purchase-review step.'
    ),
    {
      stage: 'contract_review',
      recordType: 'purchase_review_checklist',
      recordId: String(purchaseReview.linked_purchase_review_id),
      completedAt: purchaseReview.completed_at,
      completedBy: Number(purchaseReview.completed_by) || null,
      completedByDisplayName: String(
        purchaseReview.completed_by_display_name ?? 'Legacy workflow conversion'
      ),
      note: 'Preserved purchase-review checklist linked by the legacy workflow.',
    },
    {
      stage: 'technical_configuration_review',
      recordType: 'production_work_order',
      recordId: String(wad.id),
      completedAt: wad.updated_at,
      completedBy: null,
      completedByDisplayName: 'Legacy workflow conversion',
      note: `Released approved WAD ${String(wad.work_order_number)} contains the preserved BOM, routing, traveler, quality, and document baseline.`,
    },
    {
      stage: 'production_planning',
      recordType: 'p2_purchase_order',
      recordId: String(po.id),
      completedAt: po.updated_at,
      completedBy: null,
      completedByDisplayName: 'Legacy workflow conversion',
      note: `Released production PO ${String(po.po_number)} is the preserved planning authority.`,
    },
    {
      stage: 'production_planning',
      recordType: 'production_work_order',
      recordId: String(wad.id),
      completedAt: wad.updated_at,
      completedBy: null,
      completedByDisplayName: 'Legacy workflow conversion',
      note: 'Released approved WAD preserves the production budget and execution plan.',
    },
    {
      stage: 'wad_authorization',
      recordType: 'production_work_order',
      recordId: String(wad.id),
      completedAt: wad.updated_at,
      completedBy: null,
      completedByDisplayName: 'Legacy workflow conversion',
      note: 'Satisfied by the existing released and approved WAD.',
    },
    legacyEvidence(
      'preproduction_release',
      'preproduction_checklist',
      'Satisfied by the completed legacy preproduction-checklist step.'
    ),
    {
      stage: 'preproduction_release',
      recordType: 'preproduction_checklist',
      recordId: String(preproduction.linked_preproduction_checklist_id),
      completedAt: preproduction.completed_at,
      completedBy: Number(preproduction.completed_by) || null,
      completedByDisplayName: String(
        preproduction.completed_by_display_name ?? 'Legacy workflow conversion'
      ),
      note: 'Preserved completed preproduction checklist.',
    },
  ];
  if (evidence.some((item) => !item.recordId || item.recordId === 'null'))
    throw new Error('A required preserved legacy evidence link is missing.');
  return { project, evidence };
}

async function apply(project: Row, evidence: Evidence[]) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${project.id}:legacy-evidence-reconciliation`},0))`
    );
    const locked = resultRows(
      await tx.execute(
        sql`SELECT id,project_code,workflow_version FROM projects WHERE id=${String(project.id)} FOR UPDATE`
      )
    )[0];
    if (!locked || locked.workflow_version !== 'p2_v2')
      throw new Error('Project workflow changed before reconciliation.');
    const steps = resultRows(
      await tx.execute(
        sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${String(project.workflow_instance_id)} FOR UPDATE`
      )
    );
    const byStage = new Map(
      steps.map((step) => [String(step.step_type), step])
    );
    for (const item of evidence) {
      const step = byStage.get(item.stage);
      if (!step) throw new Error(`Workflow stage ${item.stage} is missing.`);
      await tx.execute(sql`
        INSERT INTO project_workflow_step_links
          (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,is_authoritative,linked_by,linked_by_display_name)
        SELECT ${String(step.id)},${String(project.id)},${item.recordType},${item.recordId},'SATISFIES_REQUIREMENT',true,${item.completedBy},${item.completedByDisplayName}
        WHERE NOT EXISTS (
          SELECT 1 FROM project_workflow_step_links
           WHERE workflow_step_instance_id=${String(step.id)} AND record_type=${item.recordType}
             AND record_id=${item.recordId} AND relationship_type='SATISFIES_REQUIREMENT' AND unlinked_at IS NULL
        )`);
      await tx.execute(sql`
        UPDATE project_workflow_step_instances
           SET status='COMPLETE',started_at=COALESCE(started_at,${item.completedAt}::timestamp,now()),
               completed_at=COALESCE(completed_at,${item.completedAt}::timestamp,now()),
               completed_by=COALESCE(completed_by,${item.completedBy}),
               completed_by_display_name=COALESCE(completed_by_display_name,${item.completedByDisplayName}),
               notes=CASE WHEN notes IS NULL OR notes='' THEN ${item.note} ELSE notes END,updated_at=now()
         WHERE id=${String(step.id)} AND status NOT IN ('COMPLETE','CANCELLED','SUPERSEDED')`);
    }
    const next = byStage.get('p2_release');
    if (next)
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=${String(next.id)} AND status='NOT_STARTED'`
      );
    await tx.execute(sql`
      INSERT INTO project_activity_log(project_id,activity_type,description,performed_by_display_name,metadata)
      VALUES (${String(project.id)},'legacy_workflow_evidence_reconciled',
        'Completed legacy preproduction evidence was linked authoritatively to the converted P2 V2 workflow; original records were preserved.',
        'Controlled legacy-to-P2-V2 reconciliation',
        ${JSON.stringify({ preservedLegacyRecords: true, stagesSatisfied: [...new Set(evidence.map((item) => item.stage))], linkRelationship: 'SATISFIES_REQUIREMENT' })}::jsonb)`);
    return {
      projectCode: project.project_code,
      preservedLegacyRecords: true,
      stagesSatisfied: [...new Set(evidence.map((item) => item.stage))],
    };
  });
}

async function main() {
  const identifier = arg('--project');
  if (!identifier) throw new Error('Pass --project=<UUID-or-code>.');
  const confirmation = arg('--confirm-project');
  const applyRequested = process.argv.includes('--apply');
  const loaded = await load(identifier);
  console.log(
    JSON.stringify(
      {
        mode: applyRequested ? 'APPLY' : 'DRY_RUN',
        project: loaded.project,
        evidence: loaded.evidence,
      },
      null,
      2
    )
  );
  if (!applyRequested) return;
  if (confirmation !== loaded.project.project_code)
    throw new Error(
      `Apply requires --confirm-project=${String(loaded.project.project_code)}.`
    );
  console.log(
    JSON.stringify(await apply(loaded.project, loaded.evidence), null, 2)
  );
}

main()
  .then(() => pgPool.end())
  .catch(async (error) => {
    await pgPool.end().catch(() => undefined);
    console.error('[reconcile-converted-project-evidence] failed:', error);
    process.exitCode = 1;
  });
