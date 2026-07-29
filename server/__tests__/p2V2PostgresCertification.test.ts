import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';
import { isP2V2ProductionLaunchEnabled } from '../src/lib/featureFlags';
import {
  completeCommercialReview,
  createCommercialReview,
  decideCommercialReview,
  submitCommercialReview,
  type CommercialActor,
  type CommercialStage,
} from '../src/services/projectCommercialReviewService';
import {
  completeTechnicalConfigurationReview,
  createTechnicalConfigurationReview,
  decideTechnicalConfigurationReview,
  submitTechnicalConfigurationReview,
  type TechnicalReviewActor,
} from '../src/services/projectTechnicalConfigurationReviewService';
import {
  approveProductionRelease,
  completePreproduction,
  createPreproductionReadiness,
  decidePreproduction,
  getPreproductionReadiness,
  launchProduction,
  launchProductionForCertification,
  ProjectPreproductionError,
  submitPreproduction,
} from '../src/services/projectPreproductionReadinessService';
import {
  completeProductionStage,
  createCompletionReview,
  decideProductionCompletion,
  getProductionDashboard,
  recalculateProductionReadiness,
  submitProductionCompletion,
} from '../src/services/projectProductionExecutionService';
import {
  completeQualityReview,
  createQualityReview,
  decideQualityReview,
  getQualityDashboard,
  placeReleaseHold,
  releaseProductHold,
  releaseProduct,
  submitQualityReview,
} from '../src/services/projectQualityReleaseService';
import {
  authorizeShipment,
  closeProject,
  confirmShipment,
  decideCloseoutReview,
  getShippingCloseoutDashboard,
  placeShippingHold,
  recordDelivery,
  releaseShippingHold,
  reopenProject,
  saveCloseoutReview,
  saveShippingReview,
  submitCloseoutReview,
} from '../src/services/projectShippingCloseoutService';
import {
  getP2V2StagesForDefinitionVersion,
  P2_V2_DEFINITION_VERSION,
} from '../src/services/projectWorkflowRegistry';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const databaseUrl = new URL(connectionString);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.pathname !== '/epoch_p2_v2_certification'
) {
  throw new Error(
    `Refusing non-disposable database ${databaseUrl.hostname}${databaseUrl.pathname}`
  );
}

const pool = new Pool({ connectionString, max: 12 });
const actor: CommercialActor & TechnicalReviewActor = {
  userId: 9101,
  username: 'phase8-certifier',
  displayName: 'Phase 8 Certifier',
  role: 'ADMIN',
};
const baseProjectId = '00000000-0000-4000-8000-000000000801';
const certifiedStageOrder = [
  'rfq_risk_assessment',
  'estimate_quote',
  'contract_review',
  'technical_configuration_review',
  'production_planning',
  'wad_authorization',
  'preproduction_release',
  'production_quality',
  'final_release_shipping',
  'project_closing',
];

type Fixture = {
  projectId: string;
  poId: number;
  workflowId: string;
  steps: Record<string, string>;
  planId: string;
  wadId: string;
  readinessId: string;
  releaseId: string;
};

async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = []
) {
  return pool.query<T>(text, values);
}

const certificationActor = (
  userId: number,
  role: string
): CommercialActor & TechnicalReviewActor => ({
  ...actor,
  userId,
  employeeId: userId,
  username: `phase10-certifier-${userId}`,
  displayName: `Phase 10 Certifier ${userId}`,
  role,
});

async function certifyCommercialStage(
  projectId: string,
  stage: CommercialStage,
  review: { id: string; lock_version: number | string }
) {
  let model = await submitCommercialReview(
    projectId,
    stage,
    review.id,
    Number(review.lock_version),
    actor
  );
  const roles =
    stage === 'contract_review'
      ? ['PROJECT_MANAGEMENT', 'ENGINEERING', 'QUALITY', 'OPERATIONS']
      : ['PROJECT_MANAGEMENT'];
  for (const [index, role] of roles.entries()) {
    model = await decideCommercialReview(
      projectId,
      stage,
      review.id,
      Number(model.review.lock_version),
      role as 'PROJECT_MANAGEMENT' | 'ENGINEERING' | 'QUALITY' | 'OPERATIONS',
      'APPROVED',
      `${role} approves the controlled ${stage} baseline`,
      '',
      certificationActor(9101 + index, role)
    );
  }
  return completeCommercialReview(
    projectId,
    stage,
    review.id,
    Number(model.review.lock_version),
    actor
  );
}

async function createFixture(
  projectId = baseProjectId,
  suffix = 'A'
): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customer = `CERT-${suffix}`;
    const poNumber = `CERT-PO-${suffix}`;
    await client.query(
      `INSERT INTO p2_customers(customer_id,customer_name,rfq_prefix)
         VALUES ($1,'Certification Customer','CRT')
       ON CONFLICT DO NOTHING`,
      [customer]
    );
    await client.query(
      `INSERT INTO inventory_items
         (ag_part_number,name,type,item_type,manufactured_category,
          manufacturing_level,manufacturing_department)
         VALUES
         ($1,'Parent Assembly','Manufactured','MANUFACTURED','ASSEMBLY','FINAL','Assembly'),
         ($2,'Machined Child','Manufactured','MANUFACTURED','MACHINED_PART','COMPONENT','CNC'),
         ($3,'Layup Detail','Manufactured','MANUFACTURED','COMPOSITE','COMPONENT','Layup'),
         ($4,'Cut Detail','Manufactured','MANUFACTURED','COMPONENT','COMPONENT','Cutting Table'),
         ($5,'Purchased Hardware','Purchased','PURCHASED',NULL,'COMPONENT',NULL)
       ON CONFLICT (ag_part_number) DO NOTHING`,
      [
        `PARENT-${suffix}`,
        `CHILD-${suffix}`,
        `LAYUP-${suffix}`,
        `CUT-${suffix}`,
        `BUY-${suffix}`,
      ]
    );
    const po = await client.query<{ id: number }>(
      `INSERT INTO p2_purchase_orders
         (po_number,customer_id,customer_name,po_date,expected_delivery,status,
          revision_number,is_current_revision)
       VALUES ($1,$2,'Certification Customer',CURRENT_DATE,CURRENT_DATE+30,
               'READY_FOR_P2_RELEASE',1,true)
       RETURNING id`,
      [poNumber, customer]
    );
    const poId = po.rows[0].id;
    await client.query(
      `INSERT INTO p2_purchase_order_items
         (po_id,inventory_item_id,part_number,part_name,quantity,specifications)
       SELECT $1::integer,id,ag_part_number,name,1,$3
       FROM inventory_items WHERE ag_part_number=$2
       UNION ALL
       SELECT $1::integer,id,ag_part_number,name,1,$4
       FROM inventory_items WHERE ag_part_number=$2`,
      [
        poId,
        `PARENT-${suffix}`,
        'Customer PO line 1 - released configuration',
        'Customer PO line 2 - released configuration',
      ]
    );
    await client.query(
      `INSERT INTO projects
         (id,project_code,project_name,customer_id,workflow_version,current_stage,
          po_id,status)
       VALUES ($1,$2,'Phase 8 real launch certification',$3,'p2_v2',
               'READY_FOR_P2_RELEASE',$4,'active')`,
      [projectId, `CERT-PROJECT-${suffix}`, customer, poId]
    );
    const workflow = await client.query<{ id: string }>(
      `INSERT INTO project_workflow_instances
         (project_id,workflow_version,definition_version,status)
       VALUES ($1,'p2_v2',$2,'ACTIVE') RETURNING id`,
      [projectId, P2_V2_DEFINITION_VERSION]
    );
    const workflowId = workflow.rows[0].id;
    const steps: Record<string, string> = {};
    for (const stage of getP2V2StagesForDefinitionVersion(
      P2_V2_DEFINITION_VERSION
    )) {
      const step = await client.query<{ id: string }>(
        `INSERT INTO project_workflow_step_instances
           (workflow_instance_id,project_id,step_type,step_order,label_snapshot,
            description_snapshot,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          workflowId,
          projectId,
          stage.type,
          stage.order,
          stage.label,
          stage.description,
          [
            'rfq_risk_assessment',
            'estimate_quote',
            'contract_review',
            'technical_configuration_review',
            'production_planning',
            'wad_authorization',
            'preproduction_release',
          ].includes(stage.type)
            ? 'COMPLETE'
            : stage.type === 'production_quality'
              ? 'NOT_STARTED'
              : 'NOT_APPLICABLE',
        ]
      );
      steps[stage.type] = step.rows[0].id;
    }
    await client.query(
      `INSERT INTO rfq_risk_assessments
         (rfq_number,customer_id,customer_name,form_data,bid_decision,status)
       VALUES ($1,$2,'Certification Customer',
               $3::jsonb,'bid','submitted')`,
      [
        `CERT-RFQ-${suffix}`,
        customer,
        JSON.stringify({
          parts: [{ partNumber: `PARENT-${suffix}`, quantity: 2 }],
          requestedDueDate: '2030-01-01',
        }),
      ]
    );
    const rfq = await client.query<{ id: number }>(
      `SELECT id FROM rfq_risk_assessments WHERE rfq_number=$1`,
      [`CERT-RFQ-${suffix}`]
    );
    const quote = await client.query<{ id: string }>(
      `INSERT INTO quotes
         (quote_number,customer_id,customer_name,status,valid_until)
       VALUES ($1,$2,'Certification Customer','SENT',now()+interval '1 year')
       RETURNING id`,
      [`CERT-QUOTE-${suffix}`, customer]
    );
    const estimatingRfq = await client.query<{ id: string }>(
      `INSERT INTO estimating_rfqs
         (rfq_number,customer_name_snapshot,quote_id,revision,status)
       VALUES ($1,'Certification Customer',$2,'A','COMPLETE') RETURNING id`,
      [`CERT-ESTIMATE-RFQ-${suffix}`, quote.rows[0].id]
    );
    const estimate = await client.query<{ id: string }>(
      `INSERT INTO estimate_versions(rfq_id,version_number,status)
       VALUES ($1,1,'APPROVED') RETURNING id`,
      [estimatingRfq.rows[0].id]
    );
    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO quote_snapshots
         (quote_id,quote_number,revision_number,revision_label,customer_id,
          customer_name,valid_until)
       VALUES ($1,$2,1,'Rev 1',$3,'Certification Customer',now()+interval '1 year')
       RETURNING id`,
      [quote.rows[0].id, `CERT-QUOTE-${suffix}`, customer]
    );
    await client.query(
      `UPDATE p2_purchase_orders SET source_quote_id=$1 WHERE id=$2`,
      [quote.rows[0].id, poId]
    );
    await client.query(
      `INSERT INTO quote_po_reconciliations
         (quote_id,quote_snapshot_id,p2_purchase_order_id,po_number,status)
       VALUES ($1,$3,$2,$4,'MATCH')`,
      [quote.rows[0].id, poId, snapshot.rows[0].id, poNumber]
    );
    const template = await client.query<{ id: number }>(
      `INSERT INTO contract_review_checklist_templates
         (name,status,is_active) VALUES ($1,'approved',true) RETURNING id`,
      [`Phase 8 ${suffix}`]
    );
    const contract = await client.query<{ id: string }>(
      `INSERT INTO contract_review_checklist_instances
         (checklist_template_id,project_id,p2_purchase_order_id,status)
       VALUES ($1,$2,$3,'approved') RETURNING id`,
      [template.rows[0].id, projectId, poId]
    );
    const bomParent = await client.query<{ id: string }>(
      `INSERT INTO boms(parent_part_ag_number,code,is_active)
       VALUES ($1,$2,true) RETURNING id`,
      [`PARENT-${suffix}`, `BOM-PARENT-${suffix}`]
    );
    const bomParentRevision = await client.query<{ id: string }>(
      `INSERT INTO bom_revisions(bom_id,rev_code,is_released)
       VALUES ($1,'A',true) RETURNING id`,
      [bomParent.rows[0].id]
    );
    const bomChild = await client.query<{ id: string }>(
      `INSERT INTO boms(parent_part_ag_number,code,is_active)
       VALUES ($1,$2,true) RETURNING id`,
      [`CHILD-${suffix}`, `BOM-CHILD-${suffix}`]
    );
    const bomChildRevision = await client.query<{ id: string }>(
      `INSERT INTO bom_revisions(bom_id,rev_code,is_released)
       VALUES ($1,'A',true) RETURNING id`,
      [bomChild.rows[0].id]
    );
    const bomLayup = await client.query<{ id: string }>(
      `INSERT INTO boms(parent_part_ag_number,code,is_active)
       VALUES ($1,$2,true) RETURNING id`,
      [`LAYUP-${suffix}`, `BOM-LAYUP-${suffix}`]
    );
    const bomLayupRevision = await client.query<{ id: string }>(
      `INSERT INTO bom_revisions(bom_id,rev_code,is_released)
       VALUES ($1,'A',true) RETURNING id`,
      [bomLayup.rows[0].id]
    );
    const bomCutting = await client.query<{ id: string }>(
      `INSERT INTO boms(parent_part_ag_number,code,is_active)
       VALUES ($1,$2,true) RETURNING id`,
      [`CUT-${suffix}`, `BOM-CUT-${suffix}`]
    );
    const bomCuttingRevision = await client.query<{ id: string }>(
      `INSERT INTO bom_revisions(bom_id,rev_code,is_released)
       VALUES ($1,'A',true) RETURNING id`,
      [bomCutting.rows[0].id]
    );
    await client.query(
      `INSERT INTO bom_lines(revision_id,child_part_ag_number,qty_per)
       VALUES ($1,$2,2),($1,$3,1),($1,$4,1),($1,$5,1)`,
      [
        bomParentRevision.rows[0].id,
        `CHILD-${suffix}`,
        `LAYUP-${suffix}`,
        `CUT-${suffix}`,
        `BUY-${suffix}`,
      ]
    );
    const routingTemplate = await client.query<{ id: string }>(
      `INSERT INTO production_control_templates
         (name,template_type,approval_status,created_by)
       VALUES ($1,'ROUTING','APPROVED','phase8') RETURNING id`,
      [`Phase 8 Routing ${suffix}`]
    );
    const parentRouting = await client.query<{ id: string }>(
      `INSERT INTO part_routings
         (inventory_item_id,project_id,part_number,part_name,department_sequence,
          traceability_config,created_from_template_id,created_by)
       VALUES ((SELECT id::text FROM inventory_items WHERE ag_part_number=$2),
               $1,$2,'Parent Assembly','["Assembly"]','{}',$3,'phase8')
       RETURNING id`,
      [projectId, `PARENT-${suffix}`, routingTemplate.rows[0].id]
    );
    const childRouting = await client.query<{ id: string }>(
      `INSERT INTO part_routings
         (inventory_item_id,project_id,part_number,part_name,department_sequence,
          traceability_config,created_from_template_id,created_by)
       VALUES ((SELECT id::text FROM inventory_items WHERE ag_part_number=$2),
               $1,$2,'Machined Child','["CNC"]','{}',$3,'phase8')
       RETURNING id`,
      [projectId, `CHILD-${suffix}`, routingTemplate.rows[0].id]
    );
    const layupRouting = await client.query<{ id: string }>(
      `INSERT INTO part_routings
         (inventory_item_id,project_id,part_number,part_name,department_sequence,
          traceability_config,created_from_template_id,created_by)
       VALUES ((SELECT id::text FROM inventory_items WHERE ag_part_number=$2),
               $1,$2,'Layup Detail','["Layup"]','{}',$3,'phase10')
       RETURNING id`,
      [projectId, `LAYUP-${suffix}`, routingTemplate.rows[0].id]
    );
    const cuttingRouting = await client.query<{ id: string }>(
      `INSERT INTO part_routings
         (inventory_item_id,project_id,part_number,part_name,department_sequence,
          traceability_config,created_from_template_id,created_by)
       VALUES ((SELECT id::text FROM inventory_items WHERE ag_part_number=$2),
               $1,$2,'Cut Detail','["Cutting Table"]','{}',$3,'phase10')
       RETURNING id`,
      [projectId, `CUT-${suffix}`, routingTemplate.rows[0].id]
    );
    await client.query('COMMIT');

    const rfqReview = await createCommercialReview(
      projectId,
      'rfq_risk_assessment',
      {
        sourceRecordType: 'rfq_risk_assessment',
        sourceRecordId: String(rfq.rows[0].id),
        requirements: {
          parts: [{ partNumber: `PARENT-${suffix}`, quantity: 2 }],
          requestedDueDate: '2030-01-01',
        },
        sufficientlyDefined: true,
        differencesResolved: true,
        effectivityReference: 'CFG-A',
      },
      actor
    );
    await certifyCommercialStage(
      projectId,
      'rfq_risk_assessment',
      rfqReview.review
    );
    const quoteReview = await createCommercialReview(
      projectId,
      'estimate_quote',
      {
        sourceRecordType: 'quote',
        sourceRecordId: quote.rows[0].id,
        secondarySourceId: estimate.rows[0].id,
        sufficientlyDefined: true,
        differencesResolved: true,
        effectivityReference: 'CFG-A',
      },
      actor
    );
    await certifyCommercialStage(
      projectId,
      'estimate_quote',
      quoteReview.review
    );
    const contractReview = await createCommercialReview(
      projectId,
      'contract_review',
      {
        sourceRecordType: 'contract_review_instance',
        sourceRecordId: contract.rows[0].id,
        sufficientlyDefined: true,
        differencesResolved: true,
        effectivityReference: 'CFG-A',
      },
      actor
    );
    await certifyCommercialStage(
      projectId,
      'contract_review',
      contractReview.review
    );
    const technical = await createTechnicalConfigurationReview(
      projectId,
      {
        technicalBaseline: {
          partRequirements: [
            {
              partNumber: `PARENT-${suffix}`,
              quantity: 2,
              drawingNumber: `DWG-${suffix}`,
              drawingRevision: 'A',
            },
          ],
        },
        sufficientlyDefined: true,
        effectivityReference: 'CFG-A',
      },
      actor
    );
    let technicalModel = await submitTechnicalConfigurationReview(
      projectId,
      technical.review.id,
      Number(technical.review.lock_version),
      actor
    );
    for (const [index, role] of [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
    ].entries()) {
      technicalModel = await decideTechnicalConfigurationReview(
        projectId,
        technical.review.id,
        Number(technicalModel.review.lock_version),
        role as 'PROJECT_MANAGEMENT' | 'ENGINEERING' | 'QUALITY' | 'OPERATIONS',
        'APPROVED',
        `${role} approves the controlled technical baseline`,
        '',
        certificationActor(9101 + index, role)
      );
    }
    await completeTechnicalConfigurationReview(
      projectId,
      technical.review.id,
      Number(technicalModel.review.lock_version),
      actor
    );
    const configurationRevision = `Technical Review 1:${technical.review.source_revision}`;
    const plan = await query<{ id: string }>(
      `INSERT INTO project_production_plans
         (project_id,workflow_instance_id,workflow_step_instance_id,
          revision_number,status,po_id,po_revision_number,po_number,
          configuration_baseline_id,configuration_revision,effectivity_type,
          effectivity_reference,requirement_source,planning_basis)
       VALUES ($1,$2,$3,1,'RELEASED',$4,1,$5,'TECHNICAL_REVIEW',$6,
               'PROJECT','CFG-A','CERTIFIED_BASELINE','Phase 8 certification')
       RETURNING id`,
      [
        projectId,
        workflowId,
        steps.production_planning,
        poId,
        poNumber,
        configurationRevision,
      ]
    );
    const planId = plan.rows[0].id;
    for (const item of [
      {
        part: `PARENT-${suffix}`,
        name: 'Parent Assembly',
        path: 'root',
        parent: null,
        qty: 2,
        bom: bomParent.rows[0].id,
        revision: bomParentRevision.rows[0].id,
        routing: parentRouting.rows[0].id,
        serial: true,
        makeBuy: 'MAKE',
        manufactured: true,
      },
      {
        part: `CHILD-${suffix}`,
        name: 'Machined Child',
        path: 'root/child',
        parent: `PARENT-${suffix}`,
        qty: 4,
        bom: bomChild.rows[0].id,
        revision: bomChildRevision.rows[0].id,
        routing: childRouting.rows[0].id,
        serial: false,
        makeBuy: 'MAKE',
        manufactured: true,
      },
      {
        part: `LAYUP-${suffix}`,
        name: 'Layup Detail',
        path: 'layup',
        parent: null,
        qty: 2,
        bom: bomLayup.rows[0].id,
        revision: bomLayupRevision.rows[0].id,
        routing: layupRouting.rows[0].id,
        serial: false,
        makeBuy: 'MAKE',
        manufactured: true,
      },
      {
        part: `CUT-${suffix}`,
        name: 'Cut Detail',
        path: 'cutting',
        parent: null,
        qty: 2,
        bom: bomCutting.rows[0].id,
        revision: bomCuttingRevision.rows[0].id,
        routing: cuttingRouting.rows[0].id,
        serial: false,
        makeBuy: 'MAKE',
        manufactured: true,
      },
      {
        part: `BUY-${suffix}`,
        name: 'Purchased Hardware',
        path: 'purchased',
        parent: null,
        qty: 2,
        bom: null,
        revision: null,
        routing: null,
        serial: false,
        makeBuy: 'BUY',
        manufactured: false,
      },
    ]) {
      await query(
        `INSERT INTO project_production_plan_items
           (production_plan_id,project_id,part_number,part_name,parent_part_number,
            assembly_path,extended_project_quantity,make_buy,is_manufactured,
            bom_id,bom_revision_id,bom_revision,bom_release_status,routing_id,
            routing_revision,routing_release_status,effectivity_reference,
            drawing_number,drawing_revision,
            routing_requirement,traveler_requirement,traveler_type,
            work_instruction_requirement,work_instruction_basis,
            inspection_requirement,inspection_extent,fai_requirement,fai_reason,
            traceability_level,serialization_required,lot_traceability_required,
            special_process_source,packaging_instruction_requirement,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$12,$13,$8,$9,
                 CASE WHEN $13 THEN 'A' ELSE NULL END,
                 CASE WHEN $13 THEN 'RELEASED' ELSE 'NOT_REQUIRED_APPROVED' END,
                 $10,CASE WHEN $13 THEN '1' ELSE NULL END,
                 CASE WHEN $13 THEN 'RELEASED' ELSE 'NOT_REQUIRED_APPROVED' END,
                 'CFG-A','DWG-CERT','A',
                 'REQUIRED','REQUIRED','INDIVIDUAL',
                 'DRAWING_SPEC_SUFFICIENT','Released drawing','REQUIRED',
                 'IN_PROCESS_AND_FINAL','NOT_REQUIRED','Certification fixture',
                 'SERIAL',$11,false,'NONE','NOT_REQUIRED_APPROVED',
                 'Packaging controlled by drawing')`,
        [
          planId,
          projectId,
          item.part,
          item.name,
          item.parent,
          item.path,
          item.qty,
          item.bom,
          item.revision,
          item.routing,
          item.serial,
          item.makeBuy,
          item.manufactured,
        ]
      );
    }
    const wad = await query<{ id: string }>(
      `INSERT INTO production_work_orders
         (work_order_number,project_id,part_number,quantity,status,wad_status,
          department_budgets,total_budget_hours,material_budget_amount,wizard_data)
       VALUES ($1,$2,$3,2,'RELEASED','APPROVED','{"Assembly":{"hours":8}}',
               8,100,'{}') RETURNING id`,
      [`CERT-WAD-${suffix}`, projectId, `PARENT-${suffix}`]
    );
    const inherited = (
      await query(
        `SELECT * FROM project_production_plan_items
                   WHERE production_plan_id=$1 ORDER BY assembly_path`,
        [planId]
      )
    ).rows;
    const chargeCode = await query<{ id: number }>(
      `INSERT INTO charge_codes(code,description,department,active)
       VALUES ($1,'Phase 8 certification','Assembly',true) RETURNING id`,
      [`CERT-${suffix}`]
    );
    const authorization = await query<{ id: string }>(
      `INSERT INTO project_wad_authorizations
         (project_id,workflow_instance_id,workflow_step_instance_id,
          production_plan_id,production_plan_revision,wad_work_order_id,
          wad_number,wad_revision,status,po_id,po_revision_number,
          configuration_revision,effectivity_reference,
          inherited_requirements_snapshot,budget_snapshot)
       VALUES ($1,$2,$3,$4,1,$5,$6,1,'RELEASED',$7,1,$8,'CFG-A',$9::jsonb,$10::jsonb)
       RETURNING id`,
      [
        projectId,
        workflowId,
        steps.wad_authorization,
        planId,
        wad.rows[0].id,
        `CERT-WAD-${suffix}`,
        poId,
        configurationRevision,
        JSON.stringify({ manufacturedItems: inherited }),
        JSON.stringify({
          departments: [
            {
              department: 'Assembly',
              hours: 8,
              chargeCodeId: chargeCode.rows[0].id,
              zeroBudgetJustification: null,
            },
          ],
          materialBudget: 100,
          outsideProcessingBudget: 0,
          startDate: '2030-01-01',
          dueDate: '2030-02-01',
          risks: [
            {
              description: 'Fixture',
              owner: 'Phase 8',
              control: 'Isolated DB',
            },
          ],
          responsibleOwners: ['Phase 8'],
        }),
      ]
    );
    await query(
      `UPDATE production_work_orders
       SET wizard_data=jsonb_build_object('__p2V2Authorization',
           jsonb_build_object('authorizationId',$1::text))
       WHERE id=$2`,
      [authorization.rows[0].id, wad.rows[0].id]
    );
    const readiness = await createPreproductionReadiness(
      projectId,
      {
        checklist: [
          {
            key: 'certified',
            category: 'Phase 8',
            label: 'All real readiness evidence is current',
            applicability: 'REQUIRED',
            satisfied: true,
          },
        ],
        effectivityReference: 'CFG-A',
      },
      actor
    );
    const readinessId = readiness.review.id;
    const readinessLockVersion = Number(readiness.review.lock_version);
    await submitPreproduction(
      projectId,
      readinessId,
      readinessLockVersion,
      actor
    );
    for (const [index, role] of [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'SUPPLY_CHAIN',
    ].entries()) {
      await decidePreproduction(
        projectId,
        readinessId,
        readinessLockVersion + index + 1,
        role,
        'APPROVED',
        'Phase 8 certification',
        '',
        {
          ...actor,
          userId: 9102 + index,
          displayName: `Certifier ${role}`,
          role,
        }
      );
    }
    await completePreproduction(
      projectId,
      readinessId,
      readinessLockVersion + 6,
      actor
    );
    const release = await approveProductionRelease(projectId, actor);
    return {
      projectId,
      poId,
      workflowId,
      steps,
      planId,
      wadId: authorization.rows[0].id,
      readinessId,
      releaseId: String(release.release.id),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanLaunchState(fixture: Fixture) {
  const result = await query<{
    current_stage: string;
    po_status: string;
    production_status: string;
    serials: number;
    orders: number;
    launches: number;
  }>(
    `SELECT p.current_stage,po.status po_status,s.status production_status,
       (SELECT count(*)::int FROM p2_serialized_items WHERE po_id=po.id) serials,
       (SELECT count(*)::int FROM p2_production_orders WHERE p2_po_id=po.id) orders,
       (SELECT count(*)::int FROM project_production_launches WHERE project_id=p.id) launches
     FROM projects p
     JOIN p2_purchase_orders po ON po.id=p.po_id
     JOIN project_workflow_step_instances s
       ON s.project_id=p.id AND s.step_type='production_quality'
     WHERE p.id=$1`,
    [fixture.projectId]
  );
  return result.rows[0];
}

beforeAll(async () => {
  await query(`TRUNCATE audit_events RESTART IDENTITY CASCADE`);
  await query(
    `INSERT INTO employees(id,employee_code,name,user_role)
     SELECT value,'PHASE8-'||value,'Phase 8 Certifier '||value,'ADMIN'
     FROM generate_series(9101,9110) value ON CONFLICT (id) DO NOTHING`
  );
  await query(
    `INSERT INTO users(id,username,password_hash,role,employee_id)
     SELECT value,'phase8-certifier-'||value,'not-used','ADMIN',value
     FROM generate_series(9101,9110) value ON CONFLICT (id) DO NOTHING`
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Phase 10A ten-stage migration certification', () => {
  it('uses deterministic safe-boot order, checksum, and critical 0212 migration', () => {
    expect(new Set(safeMigrationFiles).size).toBe(safeMigrationFiles.length);
    expect(
      safeMigrationFiles.filter((file) => file.startsWith('0210_'))
    ).toEqual([
      '0210_master_document_control_hardening.sql',
      '0210_project_preproduction_readiness.sql',
      '0210_repair_freezer_temperature_tracking.sql',
    ]);
    expect(
      safeMigrationFiles.indexOf('0212_project_preproduction_launch_safety.sql')
    ).toBeGreaterThan(
      safeMigrationFiles.indexOf('0210_repair_freezer_temperature_tracking.sql')
    );
    expect(
      criticalMigrationFiles.has('0212_project_preproduction_launch_safety.sql')
    ).toBe(true);
    expect(
      criticalMigrationFiles.has('0220_p2_v2_production_execution.sql')
    ).toBe(true);
    expect(
      criticalMigrationFiles.has('0225_p2_v2_shipping_project_closeout.sql')
    ).toBe(true);
    for (const migration of [
      '0199_project_workflow_version.sql',
      '0202_project_workflow_instances.sql',
      '0204_project_production_plans.sql',
      '0205_project_wad_authorizations.sql',
      '0206_project_commercial_stage_reviews.sql',
      '0209_project_technical_configuration_reviews.sql',
      '0210_project_preproduction_readiness.sql',
      '0212_project_preproduction_launch_safety.sql',
      '0220_p2_v2_production_execution.sql',
      '0222_p2_v2_quality_product_release.sql',
      '0224_p2_v2_quality_release_hardening.sql',
      '0225_p2_v2_shipping_project_closeout.sql',
      '0226_project_production_launch_composite_key.sql',
    ])
      expect(safeMigrationFiles).toContain(migration);
    const migration = readFileSync(
      path.resolve('migrations/0210_project_preproduction_readiness.sql')
    );
    expect(createHash('sha1').update(migration).digest('hex')).toBe(
      '586207c1d54f765129aa1f45944ea5f27746326b'
    );
  });

  it('has Phase 1-8 tables and the repaired launch constraints', async () => {
    await query(
      `ALTER TABLE project_production_releases
         VALIDATE CONSTRAINT project_production_releases_readiness_project_fkey;
       ALTER TABLE project_production_launches
         VALIDATE CONSTRAINT project_production_launches_release_project_fkey`
    );
    const constraints = await query<{ conname: string; convalidated: boolean }>(
      `SELECT conname,convalidated FROM pg_constraint WHERE conname IN
       ('project_production_releases_readiness_project_fkey',
        'project_production_launches_release_project_fkey')
       ORDER BY conname`
    );
    expect(constraints.rows).toHaveLength(2);
    expect(constraints.rows.every((row) => row.convalidated)).toBe(true);
    const retired = await query(
      `SELECT 1 FROM pg_constraint
       WHERE conname='project_production_launches_complete_only_check'`
    );
    expect(retired.rows).toHaveLength(0);
  });

  it('has additive Phase 9A Production evidence, hold, link, and approval tables', async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name=ANY($1::text[])
       ORDER BY table_name`,
      [
        [
          'project_production_stage_reviews',
          'project_production_evidence_links',
          'project_production_holds',
          'project_production_stage_approvals',
        ],
      ]
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'project_production_evidence_links',
      'project_production_holds',
      'project_production_stage_approvals',
      'project_production_stage_reviews',
    ]);
  });

  it('has additive Phase 9C Shipping, allocation, hold, closeout and history tables', async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name=ANY($1::text[])
       ORDER BY table_name`,
      [
        [
          'project_shipping_reviews',
          'project_shipment_authorizations',
          'project_shipment_allocation_links',
          'project_shipping_holds',
          'project_closeout_reviews',
          'project_closeout_approvals',
          'project_closeout_events',
        ],
      ]
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'project_closeout_approvals',
      'project_closeout_events',
      'project_closeout_reviews',
      'project_shipment_allocation_links',
      'project_shipment_authorizations',
      'project_shipping_holds',
      'project_shipping_reviews',
    ]);
  });
});

describe('real launch feature gate', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])(
    'fails closed for %s, returns 503, records blocked audit, and writes no launch state',
    async (value) => {
      if (value === undefined)
        delete process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED;
      else process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED = value;
      expect(isP2V2ProductionLaunchEnabled()).toBe(false);
      await expect(
        launchProduction(baseProjectId, `blocked-${String(value)}`, actor)
      ).rejects.toMatchObject({
        code: 'P2_V2_PRODUCTION_LAUNCH_DISABLED',
        status: 503,
      });
      const audit = await query<{ action: string }>(
        `SELECT action FROM audit_events
         WHERE action='P2_V2_PRODUCTION_LAUNCH_BLOCKED'
         ORDER BY id DESC LIMIT 1`
      );
      expect(audit.rows[0]?.action).toBe('P2_V2_PRODUCTION_LAUNCH_BLOCKED');
    }
  );

  it('enables only exact lowercase true', () => {
    process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED = 'true';
    expect(isP2V2ProductionLaunchEnabled()).toBe(true);
  });
});

describe('actual production launch service against PostgreSQL', () => {
  let fixture: Fixture;
  beforeAll(async () => {
    process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED = 'true';
    fixture = await createFixture();
  });

  it('keeps readiness and release current after PostgreSQL jsonb key normalization', async () => {
    const readiness = await getPreproductionReadiness(fixture.projectId);
    expect(readiness.readiness).toMatchObject({
      ready: true,
      blockers: [],
      stale: false,
    });
    const state = await query<{
      readiness_status: string;
      release_status: string;
    }>(
      `SELECT r.status readiness_status,l.status release_status
       FROM project_preproduction_readiness_reviews r
       JOIN project_production_releases l
         ON l.readiness_review_id=r.id AND l.project_id=r.project_id
       WHERE r.project_id=$1`,
      [fixture.projectId]
    );
    expect(state.rows).toEqual([
      { readiness_status: 'COMPLETE', release_status: 'APPROVED' },
    ]);
  });

  it('blocks production launch after a real baseline revision change', async () => {
    const changedFixture = await createFixture(
      '00000000-0000-4000-8000-000000000811',
      'B'
    );
    await query(
      `UPDATE project_commercial_stage_reviews
       SET revision_number=revision_number+1
       WHERE project_id=$1 AND stage_type='contract_review'`,
      [changedFixture.projectId]
    );
    await expect(
      launchProduction(changedFixture.projectId, 'changed-baseline', actor)
    ).rejects.toMatchObject({ code: 'COMPLETED_READINESS_REQUIRED' });
    expect(await cleanLaunchState(changedFixture)).toMatchObject({
      current_stage: 'READY_FOR_P2_RELEASE',
      po_status: 'READY_FOR_P2_RELEASE',
      production_status: 'NOT_STARTED',
      serials: 0,
      orders: 0,
      launches: 0,
    });
  });

  it.each([
    'AFTER_SERIALIZED_ITEMS',
    'AFTER_FIRST_PRODUCTION_ORDER',
    'AFTER_ALL_PRODUCTION_ORDERS',
    'AFTER_STAGE_8_ACTIVATION',
    'AFTER_PROJECT_STATUS_UPDATE',
  ] as const)('rolls back %s and retains only failure audit', async (point) => {
    await expect(
      launchProductionForCertification(
        fixture.projectId,
        `fault-${point}`,
        actor,
        (current) => {
          if (current === point) throw new Error(`CERTIFICATION_${point}`);
        }
      )
    ).rejects.toThrow(`CERTIFICATION_${point}`);
    expect(await cleanLaunchState(fixture)).toMatchObject({
      current_stage: 'READY_FOR_P2_RELEASE',
      po_status: 'READY_FOR_P2_RELEASE',
      production_status: 'NOT_STARTED',
      serials: 0,
      orders: 0,
      launches: 0,
    });
    const audits = await query<{ action: string }>(
      `SELECT action FROM audit_events
       WHERE payload_json->>'projectId'=$1
         AND action LIKE 'P2_V2_PRODUCTION_LAUNCH_%'
       ORDER BY id`,
      [fixture.projectId]
    );
    expect(audits.rows.some((row) => row.action.endsWith('FAILED'))).toBe(true);
    expect(audits.rows.some((row) => row.action.endsWith('LAUNCHED'))).toBe(
      false
    );
  });

  it('serializes concurrent keys, permits same-key retry, and rejects a conflict', async () => {
    const results = await Promise.allSettled([
      launchProduction(fixture.projectId, 'concurrent-key-a', actor),
      launchProduction(fixture.projectId, 'concurrent-key-b', actor),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    const launch = await query<{ idempotency_key: string }>(
      `SELECT idempotency_key FROM project_production_launches
       WHERE project_id=$1`,
      [fixture.projectId]
    );
    await expect(
      launchProduction(fixture.projectId, launch.rows[0].idempotency_key, actor)
    ).resolves.toMatchObject({ projectStatus: 'IN_PRODUCTION' });
    await expect(
      launchProduction(fixture.projectId, 'conflicting-key', actor)
    ).rejects.toBeInstanceOf(ProjectPreproductionError);
  });

  it('reconciles exact hierarchy, routing, Stage 8, statuses, audit, and deferrals', async () => {
    expect(await cleanLaunchState(fixture)).toMatchObject({
      current_stage: 'IN_PRODUCTION',
      po_status: 'IN_PRODUCTION',
      production_status: 'IN_PROGRESS',
      serials: 2,
      orders: 10,
      launches: 1,
    });
    const orders = await query<{
      sku: string;
      department: string;
      count: number;
    }>(
      `SELECT sku,department,count(*)::int count
       FROM p2_production_orders WHERE p2_po_id=$1
       GROUP BY sku,department ORDER BY sku`,
      [fixture.poId]
    );
    expect(orders.rows).toEqual([
      { sku: 'CHILD-A', department: 'CNC', count: 4 },
      { sku: 'CUT-A', department: 'Cutting Table', count: 2 },
      { sku: 'LAYUP-A', department: 'Layup', count: 2 },
      { sku: 'PARENT-A', department: 'Assembly', count: 2 },
    ]);
    expect(orders.rows.some((entry) => entry.sku === 'BUY-A')).toBe(false);
    const lifecycle = await query<{
      step_type: string;
      step_order: number;
      status: string;
    }>(
      `SELECT step_type,step_order,status
       FROM project_workflow_step_instances
       WHERE project_id=$1 ORDER BY step_order`,
      [fixture.projectId]
    );
    expect(lifecycle.rows.map((entry) => entry.step_type)).toEqual(
      certifiedStageOrder
    );
    expect(
      lifecycle.rows.slice(0, 7).every((entry) => entry.status === 'COMPLETE')
    ).toBe(true);
    expect(lifecycle.rows[7].status).toBe('IN_PROGRESS');
    const launch = await query<{
      production_evidence: Record<string, unknown>;
    }>(
      `SELECT production_evidence FROM project_production_launches
       WHERE project_id=$1`,
      [fixture.projectId]
    );
    expect(launch.rows[0].production_evidence).toMatchObject({
      travelersCreated: 0,
      inventoryDemandsCreated: 0,
      reservationsCreated: 0,
      shippingRecordsCreated: 0,
      closingRecordsCreated: 0,
    });
    const success = await query(
      `SELECT id FROM audit_events
       WHERE action='P2_V2_PRODUCTION_LAUNCHED'
         AND subject_id=(SELECT id::text FROM project_production_launches
                         WHERE project_id=$1)`,
      [fixture.projectId]
    );
    expect(success.rows).toHaveLength(1);
  });

  it('aggregates launched authoritative records without duplicating execution data', async () => {
    const dashboard = await getProductionDashboard(baseProjectId);
    expect(dashboard.productionOrders).toHaveLength(10);
    expect(dashboard.serializedItems).toHaveLength(2);
    expect(dashboard.readiness.state).toBe('BLOCKED');
    expect(dashboard.deferrals).toEqual({
      finalProductRelease: true,
      shipping: true,
      projectClosing: true,
    });
    const created = await createCompletionReview(baseProjectId, actor);
    expect(created.review?.revision_number).toBe(1);
    expect(created.review?.status).toBe('BLOCKED');
    expect(created.productionOrders).toHaveLength(10);
  });

  it('executes the complete real Quality lifecycle, partial release, concurrency, rollback and hold controls', async () => {
    await expect(
      createQualityReview(fixture.projectId, actor)
    ).rejects.toMatchObject({
      code: 'CURRENT_PRODUCTION_COMPLETION_REQUIRED',
    });
    await query(
      `UPDATE p2_serialized_items SET status='COMPLETED',
      current_department='Final QC',final_qc_completed_at=now(),completed_at=now()
      WHERE po_id=$1`,
      [fixture.poId]
    );
    await query(
      `INSERT INTO p2_final_inspection_results
      (serialized_item_id,barcode,part_number,inspection_type,overall_result,inspector_name,qa_mgr_approval)
      SELECT id,barcode,part_number,'FINAL','PASS','PG Certifier','Approved'
      FROM p2_serialized_items WHERE po_id=$1`,
      [fixture.poId]
    );
    await query(
      `UPDATE p2_production_orders
       SET status='COMPLETED',quantity_manufactured=quantity,completed_at=now()
       WHERE p2_po_id=$1`,
      [fixture.poId]
    );
    await query(
      `UPDATE project_production_plan_items
       SET traveler_requirement='NOT_REQUIRED_APPROVED',
           traveler_not_required_reason='Phase 10A fixture uses controlled no-traveler exception'
       WHERE project_id=$1 AND make_buy='MAKE'`,
      [fixture.projectId]
    );
    await query(
      `INSERT INTO p2_serialized_item_traceability
         (serialized_item_id,department,traceability_type,traceability_label,
          traceability_value,recorded_by)
       SELECT id,'Final QC','lot_number','Material lot',
              'PHASE10A-CERT-LOT','phase10a-certifier'
       FROM p2_serialized_items WHERE po_id=$1`,
      [fixture.poId]
    );
    const existingProduction = await getProductionDashboard(fixture.projectId);
    let productionLock = Number(existingProduction.review?.lock_version);
    const productionReady = await recalculateProductionReadiness(
      fixture.projectId,
      productionLock,
      actor
    );
    expect(productionReady.review?.status).toBe('READY_FOR_COMPLETION_REVIEW');
    productionLock = Number(productionReady.review?.lock_version);
    const productionSubmitted = await submitProductionCompletion(
      fixture.projectId,
      productionLock,
      actor
    );
    productionLock = Number(productionSubmitted.review?.lock_version);
    for (const [index, approvalType] of [
      'OPERATIONS',
      'QUALITY',
      'PROJECT_MANAGEMENT',
      'MANUFACTURING_ENGINEERING',
    ].entries()) {
      const productionDecision = await decideProductionCompletion(
        fixture.projectId,
        productionLock,
        approvalType as
          | 'OPERATIONS'
          | 'QUALITY'
          | 'PROJECT_MANAGEMENT'
          | 'MANUFACTURING_ENGINEERING',
        'APPROVED',
        `${approvalType} certifies Production completion`,
        '',
        {
          ...actor,
          userId: 9102 + index,
          employeeId: 9102 + index,
          username: `phase8-certifier-${9102 + index}`,
          displayName: `Phase 10A Production Certifier ${9102 + index}`,
        }
      );
      productionLock = Number(productionDecision.review?.lock_version);
    }
    await expect(
      completeProductionStage(
        fixture.projectId,
        productionLock,
        actor,
        'AFTER_COMPLETION'
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (await getProductionDashboard(fixture.projectId)).review?.status
    ).toBe('PENDING_APPROVAL');
    const productionCompleted = await completeProductionStage(
      fixture.projectId,
      productionLock,
      actor
    );
    expect(productionCompleted.review?.status).toBe('COMPLETE');
    const stage10Before = await query<{ status: string; updated_at: Date }>(
      `SELECT status,updated_at FROM project_workflow_step_instances
       WHERE project_id=$1 AND step_type='project_closing'`,
      [fixture.projectId]
    );
    const created = await createQualityReview(fixture.projectId, actor);
    expect(created.review?.status).toBe('IN_PROGRESS');
    let lock = Number(created.review?.lock_version);
    const submitted = await submitQualityReview(fixture.projectId, lock, actor);
    expect(submitted.review?.status).toBe('READY_FOR_REVIEW');
    lock = Number(submitted.review?.lock_version);
    for (const type of ['OPERATIONS', 'PROJECT_MANAGEMENT'] as const) {
      const decided = await decideQualityReview(
        fixture.projectId,
        lock,
        type,
        'APPROVED',
        `${type} certifies revision 1`,
        '',
        actor
      );
      lock = Number(decided.review?.lock_version);
    }
    await expect(
      completeQualityReview(fixture.projectId, lock, actor)
    ).rejects.toMatchObject({ code: 'QUALITY_APPROVALS_REQUIRED' });
    await expect(
      releaseProduct(
        fixture.projectId,
        {
          expectedLockVersion: lock,
          idempotencyKey: 'authority-blocked-release',
          partNumber: String(created.items[0].part_number),
          quantity: 1,
          serialNumbers: [String(created.items[0].release_serial)],
          batchLots: [],
          signatureMeaning:
            'Operations and PM are not Quality release authority',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'READY_FOR_RELEASE_REQUIRED' });
    const qualityDecision = await decideQualityReview(
      fixture.projectId,
      lock,
      'QUALITY',
      'APPROVED',
      'Quality certifies revision 1',
      '',
      actor
    );
    lock = Number(qualityDecision.review?.lock_version);
    await expect(
      completeQualityReview(fixture.projectId, lock, actor, 'AFTER_COMPLETION')
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect((await getQualityDashboard(fixture.projectId)).review?.status).toBe(
      'READY_FOR_REVIEW'
    );
    const completed = await completeQualityReview(
      fixture.projectId,
      lock,
      actor
    );
    expect(completed.review?.status).toBe('READY_FOR_RELEASE');
    lock = Number(completed.review?.lock_version);
    const firstSerial = String(created.items[0].release_serial);
    const secondSerial = String(created.items[1].release_serial);
    const partNumber = String(created.items[0].part_number);
    await expect(
      releaseProduct(
        fixture.projectId,
        {
          expectedLockVersion: lock,
          idempotencyKey: 'forced-rollback-release',
          partNumber,
          quantity: 1,
          serialNumbers: [firstSerial],
          batchLots: [],
          signatureMeaning: 'Forced rollback certification',
          certificationFailurePoint: 'AFTER_ALLOCATIONS',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query(
          `SELECT id FROM project_product_releases WHERE project_id=$1`,
          [fixture.projectId]
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await query(
          `SELECT id FROM project_product_release_allocations WHERE project_id=$1`,
          [fixture.projectId]
        )
      ).rows
    ).toHaveLength(0);
    const input = {
      expectedLockVersion: lock,
      idempotencyKey: 'phase9b-pg-cert-release-1',
      partNumber,
      quantity: 1,
      serialNumbers: [firstSerial],
      batchLots: [],
      signatureMeaning: 'Quality authorizes exact product for customer release',
    };
    const concurrent = await Promise.allSettled([
      releaseProduct(fixture.projectId, input, actor),
      releaseProduct(
        fixture.projectId,
        { ...input, idempotencyKey: 'phase9b-pg-cert-release-race' },
        actor
      ),
    ]);
    expect(
      concurrent.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      concurrent.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    const first = concurrent.find((result) => result.status === 'fulfilled');
    if (!first || first.status !== 'fulfilled')
      throw new Error('Concurrent release did not produce a winner');
    const firstResult = first.value;
    expect(firstResult.dashboard.review?.status).toBe('PARTIALLY_RELEASED');
    const winningKey = String(firstResult.release.idempotency_key);
    const winningInput =
      winningKey === input.idempotencyKey
        ? input
        : { ...input, idempotencyKey: winningKey };
    expect(
      (await releaseProduct(fixture.projectId, winningInput, actor))
        .idempotentReplay
    ).toBe(true);
    await expect(
      releaseProduct(fixture.projectId, { ...winningInput, quantity: 2 }, actor)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      releaseProduct(
        fixture.projectId,
        {
          ...input,
          expectedLockVersion: Number(
            firstResult.dashboard.review?.lock_version
          ),
          idempotencyKey: 'cumulative-over-release',
          quantity: 2,
          serialNumbers: [firstSerial, secondSerial],
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'RELEASE_EXCEEDS_ELIGIBLE_QUANTITY' });
    await expect(
      placeReleaseHold(
        fixture.projectId,
        String(firstResult.release.id),
        'Forced hold-placement rollback',
        1,
        [firstSerial],
        [],
        actor,
        'AFTER_HOLD'
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect((await getQualityDashboard(fixture.projectId)).holds).toHaveLength(
      0
    );
    const held = await placeReleaseHold(
      fixture.projectId,
      String(firstResult.release.id),
      'Certification containment',
      1,
      [firstSerial],
      [],
      actor
    );
    expect(held.releases[0].shipping_status).toBe('BLOCKED');
    const activeHold = held.holds.find((entry) => entry.status === 'ACTIVE');
    await expect(
      releaseProductHold(
        fixture.projectId,
        String(firstResult.release.id),
        String(activeHold?.id),
        'Forced hold-release rollback',
        actor,
        'AFTER_HOLD_RELEASE'
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (await getQualityDashboard(fixture.projectId)).holds.find(
        (entry) => entry.id === activeHold?.id
      )?.status
    ).toBe('ACTIVE');
    const holdReleased = await releaseProductHold(
      fixture.projectId,
      String(firstResult.release.id),
      String(activeHold?.id),
      'Certification disposition complete',
      actor
    );
    expect(holdReleased.releases[0].shipping_status).toBe('AVAILABLE');
    await expect(
      query(
        `UPDATE project_product_releases SET released_quantity=99 WHERE id=$1`,
        [firstResult.release.id]
      )
    ).rejects.toThrow(/immutable/i);
    const afterFirst = await getQualityDashboard(fixture.projectId);
    await expect(
      releaseProduct(
        fixture.projectId,
        {
          expectedLockVersion: Number(afterFirst.review?.lock_version),
          idempotencyKey: 'forced-final-release-rollback',
          partNumber,
          quantity: 1,
          serialNumbers: [secondSerial],
          batchLots: [],
          signatureMeaning: 'Forced final Product Release rollback',
          certificationFailurePoint: 'AFTER_ALLOCATIONS',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect((await getQualityDashboard(fixture.projectId)).review?.status).toBe(
      'PARTIALLY_RELEASED'
    );
    const final = await releaseProduct(
      fixture.projectId,
      {
        expectedLockVersion: Number(afterFirst.review?.lock_version),
        idempotencyKey: 'phase9b-pg-cert-release-2',
        partNumber,
        quantity: 1,
        serialNumbers: [secondSerial],
        batchLots: [],
        signatureMeaning: 'Quality authorizes final exact product',
      },
      actor
    );
    expect(final.dashboard.review?.status).toBe('COMPLETE');
    const stage = await query<{ status: string }>(
      `SELECT status FROM project_workflow_step_instances
       WHERE project_id=$1 AND step_type='final_release_shipping'`,
      [fixture.projectId]
    );
    expect(stage.rows[0].status).toBe('COMPLETE');
    const shippingStage = await query<{ status: string; updated_at: Date }>(
      `SELECT status,updated_at FROM project_workflow_step_instances
       WHERE project_id=$1 AND step_type='project_closing'`,
      [fixture.projectId]
    );
    expect(shippingStage.rows).toEqual(stage10Before.rows);
    const shipmentCount = await query<{ count: number }>(
      `SELECT count(*)::int count FROM shipment_records WHERE po_numbers=$1`,
      [fixture.projectId]
    );
    expect(shipmentCount.rows[0].count).toBe(0);
    const unchanged = await query<{ status: string; current_stage: string }>(
      `SELECT status,current_stage FROM projects WHERE id=$1`,
      [fixture.projectId]
    );
    expect(unchanged.rows[0].status).not.toBe('CLOSED');
    expect(unchanged.rows[0].current_stage).toBe('IN_PRODUCTION');
    expect(
      (
        await query(
          `SELECT id FROM project_product_releases WHERE project_id=$1`,
          [fixture.projectId]
        )
      ).rows
    ).toHaveLength(2);
  });

  it('executes real Shipping, partial delivery reconciliation, controlled closeout, immutability and reopen', async () => {
    const before = await getShippingCloseoutDashboard(fixture.projectId);
    expect(before.eligibleAllocations).toHaveLength(2);
    const [firstAllocation, secondAllocation] = before.eligibleAllocations;
    const shippingInput = (allocationId: string, suffix: string) => ({
      allocationIds: [allocationId],
      packaging: {
        packagingMethod: 'Individual clean bag in rigid carton',
        preservationMethod: 'Dry/FOD protected with handling labels',
        packageCount: 1,
        packageIdentifiers: [`CERT-PKG-${suffix}`],
        weightLbs: 4,
        dimensions: { length: 12, width: 8, height: 4 },
        cushioningProtection: 'Closed-cell cushioning',
        moistureFodControls: 'Verified clean and dry',
        shelfLifeMarking: 'Not applicable',
        handlingLabels: ['PO', 'Part', 'Revision', 'Serial'],
        customerBagTagRequirements: 'Customer PO bag/tag applied',
      },
      shipTo: {
        name: 'Certification Customer Receiving',
        line1: '1 Certification Way',
        city: 'Tulsa',
        region: 'OK',
        postalCode: '74101',
        country: 'US',
      },
      carrier: {
        carrier: 'MANUAL',
        serviceLevel: 'CERTIFICATION',
        manualTrackingAllowed: true,
        partialShipmentAllowed: true,
        deliveryRequired: true,
      },
      documentManifest: [
        {
          documentId: `cert-doc-${suffix}`,
          documentNumber: `COC-CERT-${suffix}`,
          revision: 'A',
          status: 'RELEASED',
          checksum: createHash('sha256').update(suffix).digest('hex'),
          inclusionReason: 'Customer certificate and traceability package',
          required: true,
        },
      ],
    });

    const firstReview = await saveShippingReview(
      fixture.projectId,
      shippingInput(String(firstAllocation.id), '1'),
      actor
    );
    expect(firstReview.review?.status).toBe('READY_TO_SHIP');
    expect(firstReview.ctx.shippingStep.status).toBe('IN_PROGRESS');
    const shippingHold = await placeShippingHold(
      fixture.projectId,
      {
        scope: 'PROJECT',
        reason: 'Certification Shipping containment',
        reviewId: String(firstReview.review?.id),
      },
      actor
    );
    const activeShippingHold = shippingHold.shippingHolds.find(
      (entry) => entry.status === 'ACTIVE'
    );
    await expect(
      authorizeShipment(
        fixture.projectId,
        {
          expectedLockVersion: Number(firstReview.review?.lock_version),
          idempotencyKey: 'phase9c-held-authorization',
          signatureMeaning: 'Shipping authorization must remain blocked',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'SHIPPING_HOLD_ACTIVE' });
    await releaseShippingHold(
      fixture.projectId,
      String(activeShippingHold?.id),
      'Quality and Shipping containment disposition complete',
      actor
    );
    const authorizationInput = {
      expectedLockVersion: Number(firstReview.review?.lock_version),
      idempotencyKey: 'phase9c-shipment-authorization-1',
      signatureMeaning:
        'Shipping authorizes exact partial Product Release allocation',
    };
    await expect(
      authorizeShipment(
        fixture.projectId,
        {
          ...authorizationInput,
          idempotencyKey: 'phase10a-authorization-insert-rollback',
          certificationFailurePoint: 'AFTER_AUTHORIZATION' as const,
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    await expect(
      authorizeShipment(
        fixture.projectId,
        {
          ...authorizationInput,
          idempotencyKey: 'phase10a-allocation-rollback',
          certificationFailurePoint: 'AFTER_ALLOCATIONS' as const,
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query(
          `SELECT id FROM project_shipment_authorizations
           WHERE idempotency_key IN
             ('phase10a-authorization-insert-rollback','phase10a-allocation-rollback')`
        )
      ).rows
    ).toHaveLength(0);
    const concurrent = await Promise.allSettled([
      authorizeShipment(fixture.projectId, authorizationInput, actor),
      authorizeShipment(
        fixture.projectId,
        {
          ...authorizationInput,
          idempotencyKey: 'phase9c-shipment-authorization-race',
        },
        actor
      ),
    ]);
    expect(
      concurrent.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      concurrent.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    const authorizationWinner = concurrent.find(
      (result) => result.status === 'fulfilled'
    );
    if (!authorizationWinner || authorizationWinner.status !== 'fulfilled')
      throw new Error('Concurrent shipment authorization produced no winner');
    const firstAuthorization = authorizationWinner.value.authorization;
    const winningAuthorizationInput = {
      ...authorizationInput,
      idempotencyKey: String(firstAuthorization.idempotency_key),
    };
    expect(
      (
        await authorizeShipment(
          fixture.projectId,
          winningAuthorizationInput,
          actor
        )
      ).idempotentReplay
    ).toBe(true);
    await expect(
      authorizeShipment(
        fixture.projectId,
        {
          ...winningAuthorizationInput,
          signatureMeaning: 'Conflicting authorization evidence',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      (
        await query(
          `SELECT count(*)::int count FROM shipment_records
           WHERE reference=$1`,
          [firstAuthorization.authorization_number]
        )
      ).rows[0]
    ).toMatchObject({ count: 0 });

    await expect(
      confirmShipment(
        fixture.projectId,
        String(firstAuthorization.id),
        {
          idempotencyKey: 'phase9c-confirm-rollback',
          trackingNumber: 'MANUAL-CERT-ROLLBACK',
          manualTracking: true,
          certificationFailurePoint: 'AFTER_ALLOCATIONS',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query(
          `SELECT count(*)::int count FROM shipment_records
           WHERE reference=$1`,
          [firstAuthorization.authorization_number]
        )
      ).rows[0]
    ).toMatchObject({ count: 0 });
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM project_shipment_allocation_links
           WHERE shipment_authorization_id=$1`,
          [firstAuthorization.id]
        )
      ).rows.every((entry) => entry.status === 'AUTHORIZED')
    ).toBe(true);

    const confirmation = await confirmShipment(
      fixture.projectId,
      String(firstAuthorization.id),
      {
        idempotencyKey: 'phase9c-confirm-1',
        trackingNumber: 'MANUAL-CERT-0001',
        manualTracking: true,
      },
      actor
    );
    expect(confirmation.authorization.status).toBe('CONFIRMED');
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM projects WHERE id=$1`,
          [fixture.projectId]
        )
      ).rows[0].status
    ).not.toBe('completed');
    await expect(
      recordDelivery(
        fixture.projectId,
        String(firstAuthorization.id),
        {
          status: 'DELIVERED',
          evidenceSource: 'CARRIER',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'PROOF_OF_DELIVERY_REQUIRED' });
    await recordDelivery(
      fixture.projectId,
      String(firstAuthorization.id),
      {
        status: 'DELIVERED',
        evidenceSource: 'MANUAL_POD',
        proofOfDeliveryReference: 'POD-CERT-0001',
      },
      actor
    );
    await expect(
      recordDelivery(
        fixture.projectId,
        String(firstAuthorization.id),
        {
          status: 'DELIVERY_EXCEPTION',
          evidenceSource: 'CARRIER',
          exception: 'Forced POD transaction rollback',
          certificationFailurePoint: 'AFTER_DELIVERY',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM project_shipment_authorizations WHERE id=$1`,
          [firstAuthorization.id]
        )
      ).rows[0].status
    ).toBe('DELIVERED');
    const afterPartial = await getShippingCloseoutDashboard(fixture.projectId);
    expect(
      afterPartial.links.filter((entry) => entry.status === 'DELIVERED')
    ).toHaveLength(1);
    expect(afterPartial.eligibleAllocations).toHaveLength(1);

    const secondReview = await saveShippingReview(
      fixture.projectId,
      shippingInput(String(secondAllocation.id), '2'),
      actor
    );
    const secondAuthorized = await authorizeShipment(
      fixture.projectId,
      {
        expectedLockVersion: Number(secondReview.review?.lock_version),
        idempotencyKey: 'phase9c-shipment-authorization-2',
        signatureMeaning: 'Shipping authorizes remaining released allocation',
      },
      actor
    );
    await confirmShipment(
      fixture.projectId,
      String(secondAuthorized.authorization.id),
      {
        idempotencyKey: 'phase9c-confirm-2',
        trackingNumber: 'MANUAL-CERT-0002',
        manualTracking: true,
      },
      actor
    );
    await recordDelivery(
      fixture.projectId,
      String(secondAuthorized.authorization.id),
      {
        status: 'DELIVERY_EXCEPTION',
        evidenceSource: 'CARRIER',
        exception: 'Certification carrier exception',
      },
      actor
    );
    const blockedCloseoutInput = {
      deliveryRequired: true,
      financeTransferredOrComplete: true,
      financeDisposition: 'Transferred to Finance',
      productionReconciled: true,
      qualityReconciled: true,
      supplierAndPropertyReconciled: true,
      openActions: [],
      documentArchiveManifest: [
        {
          documentId: 'closeout-cert-archive',
          documentNumber: 'CLOSEOUT-CERT',
          revision: 'A',
          status: 'RELEASED',
          checksum: createHash('sha256').update('closeout').digest('hex'),
          inclusionReason: 'Immutable project closeout archive',
        },
      ],
    };
    const blockedCloseout = await saveCloseoutReview(
      fixture.projectId,
      blockedCloseoutInput,
      actor
    );
    expect(blockedCloseout.closeout?.status).toBe('BLOCKED');
    expect(blockedCloseout.closeout?.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/delivery evidence/i),
        expect.stringMatching(/delivery exception/i),
      ])
    );
    await recordDelivery(
      fixture.projectId,
      String(secondAuthorized.authorization.id),
      {
        status: 'DELIVERED',
        evidenceSource: 'MANUAL_POD',
        proofOfDeliveryReference: 'POD-CERT-0002',
      },
      actor
    );
    const closeoutReady = await saveCloseoutReview(
      fixture.projectId,
      {
        ...blockedCloseoutInput,
        expectedLockVersion: Number(blockedCloseout.closeout?.lock_version),
      },
      actor
    );
    expect(closeoutReady.closeout?.status).toBe('READY_FOR_CLOSEOUT_REVIEW');
    const submitted = await submitCloseoutReview(
      fixture.projectId,
      Number(closeoutReady.closeout?.lock_version),
      actor
    );
    expect(submitted.closeout?.status).toBe('PENDING_APPROVAL');
    const approvalActors = [9101, 9102, 9103, 9104].map((userId) => ({
      ...actor,
      userId,
      employeeId: userId,
      username: `phase8-certifier-${userId}`,
      displayName: `Phase 9C Certifier ${userId}`,
    }));
    let closeoutLock = Number(submitted.closeout?.lock_version);
    for (const [index, type] of [
      'PROJECT_MANAGEMENT',
      'QUALITY',
      'OPERATIONS',
      'SHIPPING_LOGISTICS',
    ].entries()) {
      const decided = await decideCloseoutReview(
        fixture.projectId,
        closeoutLock,
        type,
        'APPROVED',
        `${type} approves exact closeout revision`,
        '',
        approvalActors[index]
      );
      closeoutLock = Number(decided.closeout?.lock_version);
    }
    await expect(
      decideCloseoutReview(
        fixture.projectId,
        closeoutLock,
        'FINANCE',
        'APPROVED',
        'Duplicate actor approval',
        '',
        approvalActors[0]
      )
    ).rejects.toMatchObject({ code: 'SEGREGATION_OF_DUTIES_REQUIRED' });
    const closeInput = {
      expectedLockVersion: closeoutLock,
      idempotencyKey: 'phase9c-close-project-1',
      signatureMeaning: 'Authorized complete customer-order reconciliation',
    };
    await expect(
      closeProject(
        fixture.projectId,
        { ...closeInput, certificationFailurePoint: 'AFTER_CLOSE' },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM projects WHERE id=$1`,
          [fixture.projectId]
        )
      ).rows[0].status
    ).not.toBe('completed');
    const closed = await closeProject(fixture.projectId, closeInput, {
      ...actor,
      userId: 9105,
      employeeId: 9105,
      username: 'phase8-certifier-9105',
      displayName: 'Phase 9C Close Authority',
    });
    expect(closed.closeout.status).toBe('CLOSED');
    expect(
      (
        await query<{ status: string; current_stage: string }>(
          `SELECT status,current_stage FROM projects WHERE id=$1`,
          [fixture.projectId]
        )
      ).rows[0]
    ).toEqual({ status: 'completed', current_stage: 'PROJECT_CLOSED' });
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM p2_purchase_orders WHERE id=$1`,
          [fixture.poId]
        )
      ).rows[0].status
    ).toBe('CLOSED');
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM project_workflow_instances WHERE id=$1`,
          [fixture.workflowId]
        )
      ).rows[0].status
    ).toBe('COMPLETE');
    await expect(
      query(
        `UPDATE project_closeout_reviews
         SET reconciliation_snapshot='{"tampered":true}'::jsonb
         WHERE id=$1`,
        [closed.closeout.id]
      )
    ).rejects.toThrow(/immutable/i);
    expect(
      (await closeProject(fixture.projectId, closeInput, actor))
        .idempotentReplay
    ).toBe(true);
    await expect(
      saveShippingReview(
        fixture.projectId,
        shippingInput(String(firstAllocation.id), 'closed'),
        actor
      )
    ).rejects.toMatchObject({ code: 'WORKFLOW_CLOSED' });
    await expect(
      reopenProject(
        fixture.projectId,
        {
          reason: 'Forced controlled-reopen rollback',
          responsibleOwner: 'Project Management',
          certificationFailurePoint: 'AFTER_REOPEN',
        },
        actor
      )
    ).rejects.toMatchObject({ code: 'CERTIFICATION_FORCED_ROLLBACK' });
    expect(
      (
        await query<{ status: string }>(
          `SELECT status FROM projects WHERE id=$1`,
          [fixture.projectId]
        )
      ).rows[0].status
    ).toBe('completed');
    const reopened = await reopenProject(
      fixture.projectId,
      {
        reason: 'Controlled certification follow-up',
        responsibleOwner: 'Project Management',
      },
      {
        ...actor,
        userId: 9106,
        employeeId: 9106,
        username: 'phase8-certifier-9106',
        displayName: 'Phase 9C Reopen Authority',
      }
    );
    expect(reopened.closeout?.status).toBe('REOPENED');
    expect(reopened.closeoutEvents.map((entry) => entry.event_type)).toEqual([
      'CLOSED',
      'REOPENED',
    ]);
    expect(reopened.eligibleAllocations).toHaveLength(0);
    expect(reopened.links.every((entry) => entry.status === 'DELIVERED')).toBe(
      true
    );
  });

  it('keeps null and legacy workflow versions isolated', async () => {
    for (const [index, workflowVersion] of [null, 'legacy_v1'].entries()) {
      const id = `00000000-0000-4000-8000-00000000080${index + 2}`;
      await query(
        `INSERT INTO projects
           (id,project_code,project_name,customer_id,workflow_version,current_stage)
         VALUES ($1,$2,'Legacy isolation','CERT-A',$3,'READY_FOR_P2_RELEASE')`,
        [id, `LEGACY-${index}`, workflowVersion]
      );
      await expect(
        launchProduction(id, `legacy-${index}`, actor)
      ).rejects.toMatchObject({
        code: expect.stringMatching(
          /P2_V2_REQUIRED|UNKNOWN_WORKFLOW_VERSION|WORKFLOW_INSTANCE_REQUIRED/
        ),
      });
    }
    const changed = await query(
      `SELECT id FROM projects
       WHERE id IN
       ('00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000803')
       AND current_stage<>'READY_FOR_P2_RELEASE'`
    );
    expect(changed.rows).toHaveLength(0);
  });

  it('fails closed for an unknown workflow version at the database boundary', async () => {
    const id = '00000000-0000-4000-8000-000000000804';
    await expect(
      query(
        `INSERT INTO projects
         (id,project_code,project_name,customer_id,workflow_version,current_stage)
         VALUES ($1,'UNKNOWN-V2','Unknown isolation','CERT-A','future_v9','IN_PRODUCTION')`,
        [id]
      )
    ).rejects.toMatchObject({
      constraint: 'projects_workflow_version_check',
    });
    expect(
      (await query(`SELECT id FROM projects WHERE id=$1`, [id])).rows
    ).toHaveLength(0);
    await expect(createQualityReview(id, actor)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });
});
