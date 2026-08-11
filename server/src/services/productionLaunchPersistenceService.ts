import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2ProductionLaunchPersistenceEnabled } from '../lib/featureFlags';
import {
  compileProductionDemandGraph,
  ProductionDemandGraphError,
  type FrozenProductionPlanItem,
} from './productionDemandGraph';
import { demandPlanningChecksum } from './p2DemandPlanningDeterminism';
import { buildProductionLaunchPreview } from './productionLaunchPreviewService';
import type { ProductionLaunchPreviewNode } from './productionLaunchPreviewResolver';
import {
  ProjectProductionPlanningError,
  type PlanningActor,
} from './projectProductionPlanningService';

type Row = Record<string, unknown>;
type Executor = Pick<typeof db, 'execute'>;
const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);

export type ProductionLaunchPersistenceInput = {
  idempotencyKey: string;
  expectedPreviewDigest: string;
  signatureMeaning: string;
};

const clean = (value: string) => value.trim();
const fail = (
  code: string,
  message: string,
  status = 409,
  details: Record<string, unknown> = {}
) => new ProjectProductionPlanningError(code, message, status, details);

function validateInput(input: ProductionLaunchPersistenceInput) {
  if (clean(input.idempotencyKey).length < 8)
    throw fail(
      'IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required.',
      400
    );
  if (!/^[0-9a-f]{64}$/.test(clean(input.expectedPreviewDigest)))
    throw fail(
      'EXPECTED_PREVIEW_DIGEST_REQUIRED',
      'A valid expected preview digest is required.',
      400
    );
  if (!clean(input.signatureMeaning))
    throw fail(
      'SIGNATURE_MEANING_REQUIRED',
      'Confirmation signature meaning is required.',
      400
    );
}

function graphFailure(error: ProductionDemandGraphError) {
  return fail(error.code, error.message, 409, {
    correctionCategory: 'PRODUCTION_PLAN',
  });
}

export async function persistProductionLaunch(
  projectId: string,
  input: ProductionLaunchPersistenceInput,
  actor: PlanningActor
) {
  validateInput(input);
  if (!isP2V2ProductionLaunchPersistenceEnabled())
    throw fail(
      'P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_DISABLED',
      'Recursive Production Launch persistence is disabled.',
      503
    );

  return db.transaction(async (tx) => {
    const executor: Executor = tx;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`p2-production-launch:${projectId}`},0))`
    );

    const authority = rows(
      await tx.execute(sql`
        SELECT p.id project_id,p.workflow_version,p.po_id,
          wi.id workflow_instance_id,
          release.id production_release_id,release.configuration_baseline_id,
          release.production_plan_id,release.production_plan_revision,
          release.wad_authorization_id,release.wad_revision,
          plan.status production_plan_status,plan.revision_number current_plan_revision,
          plan.configuration_baseline_id current_plan_baseline,
          wad.status wad_status,wad.wad_revision current_wad_revision
        FROM projects p
        JOIN project_workflow_instances wi ON wi.project_id=p.id AND wi.status='ACTIVE'
        JOIN project_production_releases release ON release.project_id=p.id AND release.status='APPROVED'
        JOIN project_production_plans plan ON plan.id=release.production_plan_id AND plan.project_id=p.id
        JOIN project_wad_authorizations wad ON wad.id=release.wad_authorization_id AND wad.project_id=p.id
        WHERE p.id=${projectId}
        FOR UPDATE OF p,wi,release,plan,wad`)
    );
    if (authority.length !== 1)
      throw fail(
        'PRODUCTION_AUTHORITY_AMBIGUOUS',
        'Exactly one active workflow, approved Production Release, released Production Plan, and current WAD are required.',
        409,
        { correctionCategory: 'PRODUCTION_RELEASE' }
      );
    const evidence = authority[0];
    if (evidence.workflow_version !== 'p2_v2')
      throw fail(
        'P2_V2_REQUIRED',
        'Production Launch applies only to p2_v2 projects.'
      );
    if (evidence.production_plan_status !== 'RELEASED')
      throw fail(
        'STALE_PRODUCTION_PLAN',
        'The Production Plan is not released.'
      );
    if (evidence.wad_status !== 'RELEASED')
      throw fail('STALE_WAD', 'The WAD authorization is no longer current.');
    if (
      Number(evidence.production_plan_revision) !==
        Number(evidence.current_plan_revision) ||
      String(evidence.configuration_baseline_id) !==
        String(evidence.current_plan_baseline)
    )
      throw fail(
        'STALE_BASELINE',
        'The approved Production Release no longer matches the released Production Plan baseline.'
      );
    if (Number(evidence.wad_revision) !== Number(evidence.current_wad_revision))
      throw fail(
        'STALE_WAD',
        'The approved Production Release references a stale WAD revision.'
      );

    const preview = await buildProductionLaunchPreview(
      projectId,
      new Date(),
      executor,
      'UPDATE'
    );
    if (preview.resultChecksum !== clean(input.expectedPreviewDigest))
      throw fail(
        'STALE_PREVIEW',
        'The Production Launch preview changed after confirmation.',
        409,
        {
          expected: input.expectedPreviewDigest,
          actual: preview.resultChecksum,
        }
      );
    if (preview.blockers.length)
      throw fail(
        'UNRESOLVED_PRODUCTION_DEMAND',
        'Production Launch cannot persist while preview blockers remain.',
        409,
        { blockers: preview.blockers, correctionCategory: 'PREVIEW' }
      );

    const planItems = rows(
      await tx.execute(sql`
        SELECT id,assembly_path,part_number,production_plan_id,project_id
        FROM project_production_plan_items
        WHERE production_plan_id=${String(evidence.production_plan_id)} AND project_id=${projectId}
        ORDER BY assembly_path,id FOR UPDATE`)
    ).map(
      (row): FrozenProductionPlanItem => ({
        id: String(row.id),
        assemblyPath: String(row.assembly_path),
        partNumber: String(row.part_number),
        productionPlanId: String(row.production_plan_id),
        projectId: String(row.project_id),
      })
    );
    let graph: ReturnType<typeof compileProductionDemandGraph>;
    try {
      graph = compileProductionDemandGraph(
        preview.nodes as unknown as ProductionLaunchPreviewNode[],
        planItems
      );
    } catch (error) {
      if (error instanceof ProductionDemandGraphError)
        throw graphFailure(error);
      throw error;
    }
    if (!graph.demands.length)
      throw fail(
        'EMPTY_PRODUCTION_DEMAND',
        'The authoritative preview produced no Production Launch demand.',
        409,
        { correctionCategory: 'PREVIEW' }
      );
    const unresolved = graph.demands.find(
      (demand) =>
        demand.disposition === 'UNRESOLVED' || demand.demandStatus === 'BLOCKED'
    );
    if (unresolved)
      throw fail(
        'UNRESOLVED_PRODUCTION_DEMAND',
        `${unresolved.partNumber} at ${unresolved.assemblyPath} is unresolved.`,
        409,
        {
          assemblyPath: unresolved.assemblyPath,
          correctionCategory: 'CLASSIFICATION',
        }
      );

    const requestEvidence = {
      projectId,
      baselineId: String(evidence.configuration_baseline_id),
      productionReleaseId: String(evidence.production_release_id),
      productionPlanId: String(evidence.production_plan_id),
      wadAuthorizationId: String(evidence.wad_authorization_id),
      previewDigest: preview.resultChecksum,
      signatureMeaning: clean(input.signatureMeaning),
    };
    const requestHash = demandPlanningChecksum(requestEvidence);
    const prior = rows(
      await tx.execute(sql`
        SELECT * FROM project_production_launches
        WHERE project_id=${projectId} AND idempotency_key=${clean(input.idempotencyKey)}
        FOR UPDATE`)
    )[0];
    if (prior) {
      if (
        prior.request_hash === requestHash &&
        prior.configuration_baseline_id ===
          evidence.configuration_baseline_id &&
        prior.status === 'COMPLETE'
      )
        return { replayed: true, launch: prior };
      throw fail(
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used with different Production Launch evidence.'
      );
    }
    const conflicting = rows(
      await tx.execute(sql`
        SELECT id FROM project_production_launches
        WHERE project_id=${projectId} AND status='COMPLETE' FOR UPDATE`)
    )[0];
    if (conflicting)
      throw fail(
        'EXISTING_CONFLICTING_LAUNCH',
        'An existing completed Production Launch requires controlled reconciliation.',
        409,
        { productionLaunchId: String(conflicting.id) }
      );

    const launchId = randomUUID();
    const demandIds = new Map(
      graph.demands.map((demand) => [demand.key, randomUUID()])
    );
    const allocationIds: string[] = [];
    const dependencyIds: string[] = [];
    const graphEvidence = { requestEvidence, preview, graph };
    const evidenceDigest = demandPlanningChecksum(graphEvidence);
    await tx.execute(sql`
      INSERT INTO project_production_launches
        (id,project_id,production_release_id,idempotency_key,status,production_evidence,
         launched_by,launched_by_display_name,workflow_instance_id,configuration_baseline_id,
         production_plan_id,wad_authorization_id,request_hash,preview_digest,evidence_digest,signature_meaning)
      VALUES (${launchId},${projectId},${String(evidence.production_release_id)},${clean(input.idempotencyKey)},'COMPLETE',
        ${JSON.stringify(graphEvidence)}::jsonb,${actor.userId},${actor.displayName},
        ${String(evidence.workflow_instance_id)},${String(evidence.configuration_baseline_id)},
        ${String(evidence.production_plan_id)},${String(evidence.wad_authorization_id)},${requestHash},
        ${preview.resultChecksum},${evidenceDigest},${clean(input.signatureMeaning)})`);

    for (const demand of graph.demands) {
      const demandId = demandIds.get(demand.key)!;
      await tx.execute(sql`
        INSERT INTO project_production_demands
          (id,project_id,production_release_id,production_launch_id,production_plan_id,
           production_plan_item_id,po_id,po_item_id,demand_line_identity,demand_key,parent_demand_id,
           assembly_path,path_depth,inventory_item_id,part_number,part_revision,description,classification,
           disposition,quantity_per_parent,gross_required_quantity,available_quantity_snapshot,
           allocated_quantity_snapshot,shortage_quantity,original_customer_quantity,effective_customer_quantity,
           customer_demand_event_digest,customer_demand_snapshot,unit_of_measure,required_by_date,bom_id,
           bom_revision_id,bom_revision_snapshot,routing_id,routing_revision_snapshot,first_department_snapshot,
           wad_authorization_id,demand_status,blocker_snapshot,authority_snapshot)
        VALUES (${demandId},${projectId},${String(evidence.production_release_id)},${launchId},
          ${demand.productionPlanId},${demand.productionPlanItemId},${preview.project.poId},${demand.poItemId},
          ${demand.demandLineIdentity},${demand.demandKey},${demand.parentKey ? demandIds.get(demand.parentKey)! : null},
          ${demand.assemblyPath},${demand.pathDepth},${demand.inventoryItemId},${demand.partNumber},
          ${demand.partRevision},${demand.description},${demand.classification},${demand.disposition},
          ${String(demand.quantityPerParent)}::numeric,${String(demand.grossRequiredQuantity)}::numeric,
          ${String(demand.availableQuantitySnapshot)}::numeric,${String(demand.allocatedQuantitySnapshot)}::numeric,
          ${String(demand.shortageQuantity)}::numeric,${String(demand.originalCustomerQuantity)}::numeric,
          ${String(demand.effectiveCustomerQuantity)}::numeric,${demand.customerDemandEventDigest},
          ${JSON.stringify(demand.customerDemandSnapshot)}::jsonb,${demand.unitOfMeasure},${demand.requiredByDate},
          ${demand.bomId},${demand.bomRevisionId},${demand.bomRevisionSnapshot},${demand.routingId},
          ${demand.routingRevisionSnapshot},${demand.firstDepartmentSnapshot},${String(evidence.wad_authorization_id)},
          ${demand.demandStatus},${JSON.stringify(demand.blockerSnapshot)}::jsonb,
          ${JSON.stringify({ ...requestEvidence, demandKey: demand.demandKey })}::jsonb)`);
      const netted = demand.grossRequiredQuantity - demand.shortageQuantity;
      if (demand.inventoryItemId != null && netted > 0) {
        const allocationId = randomUUID();
        allocationIds.push(allocationId);
        await tx.execute(sql`
          INSERT INTO project_production_demand_allocations
            (id,project_id,demand_id,inventory_item_id,allocation_type,quantity,status,evidence)
          VALUES (${allocationId},${projectId},${demandId},${demand.inventoryItemId},'NETTING_SNAPSHOT',
            ${String(netted)}::numeric,'PLANNED',${JSON.stringify({ previewDigest: preview.resultChecksum, createsReservation: false })}::jsonb)`);
      }
    }
    for (const dependency of graph.dependencies) {
      const dependencyId = randomUUID();
      dependencyIds.push(dependencyId);
      await tx.execute(sql`
        INSERT INTO project_production_demand_dependencies
          (id,project_id,predecessor_demand_id,successor_demand_id,dependency_type,status,evidence)
        VALUES (${dependencyId},${projectId},${demandIds.get(dependency.predecessorKey)!},
          ${demandIds.get(dependency.successorKey)!},${dependency.dependencyType},'OPEN',
          ${JSON.stringify({ previewDigest: preview.resultChecksum })}::jsonb)`);
    }
    const createdRecordIds = {
      launchId,
      demandIds: [...demandIds.values()],
      allocationIds,
      dependencyIds,
    };
    await tx.execute(sql`
      INSERT INTO project_production_launch_events
        (project_id,production_launch_id,event_type,request_hash,evidence_digest,created_record_ids,
         evidence_snapshot,actor_user_id,actor_display_name,actor_role,signature_meaning)
      VALUES (${projectId},${launchId},'RECURSIVE_DEMAND_GRAPH_PERSISTED',${requestHash},${evidenceDigest},
        ${JSON.stringify(createdRecordIds)}::jsonb,${JSON.stringify(requestEvidence)}::jsonb,
        ${actor.userId},${actor.displayName},${actor.role},${clean(input.signatureMeaning)})`);
    return {
      replayed: false,
      launch: { id: launchId, status: 'COMPLETE', evidenceDigest },
      createdRecordIds,
    };
  });
}
