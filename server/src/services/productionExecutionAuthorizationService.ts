import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2ExecutionAuthorizationEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type ExecutionAuthorizationInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class ProductionExecutionAuthorizationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function authorizeProductionExecution(
  projectId: string,
  launchId: string,
  input: ExecutionAuthorizationInput,
  actor: PlanningActor
) {
  if (!isP2V2ExecutionAuthorizationEnabled())
    throw new ProductionExecutionAuthorizationError(
      'P2_V2_EXECUTION_AUTHORIZATION_DISABLED',
      'Production execution authorization is disabled.',
      503
    );
  const requestHash = digest({
    projectId,
    launchId,
    idempotencyKey: input.idempotencyKey.trim(),
    expectedLaunchDigest: input.expectedLaunchDigest,
  });

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:execution-authorization`},0))`
    );
    const context = rows(
      await tx.execute(sql`
        SELECT pl.id,pl.project_id,pl.status,pl.preview_digest,
          pl.configuration_baseline_id,pl.wad_authorization_id,
          wa.status AS wad_status,wa.wad_work_order_id,
          pwo.status AS work_order_status,pwo.wad_status AS work_order_wad_status
        FROM project_production_launches pl
        JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
        JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
        JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
        WHERE pl.id=${launchId} AND pl.project_id=${projectId}
        FOR UPDATE OF pl,p,wa,pwo`)
    )[0];
    if (!context)
      throw new ProductionExecutionAuthorizationError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      context.status !== 'COMPLETE' ||
      context.wad_status !== 'RELEASED' ||
      context.work_order_wad_status !== 'APPROVED'
    )
      throw new ProductionExecutionAuthorizationError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must be complete and released.'
      );
    if (String(context.preview_digest) !== input.expectedLaunchDigest)
      throw new ProductionExecutionAuthorizationError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await tx.execute(sql`
        SELECT * FROM project_production_launch_events
        WHERE production_launch_id=${launchId} AND event_type='EXECUTION_AUTHORIZED'
        LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new ProductionExecutionAuthorizationError(
          'EXECUTION_AUTHORIZATION_IDEMPOTENCY_CONFLICT',
          'Execution was already authorized with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }

    const demands = rows(
      await tx.execute(sql`
        SELECT * FROM project_production_demands
        WHERE project_id=${projectId} AND production_launch_id=${launchId}
        ORDER BY path_depth,assembly_path FOR UPDATE`)
    );
    const makeDemands = demands.filter(
      (demand) =>
        demand.disposition === 'MAKE' && Number(demand.shortage_quantity) > 0
    );
    if (!makeDemands.length)
      throw new ProductionExecutionAuthorizationError(
        'MAKE_DEMAND_REQUIRED',
        'No shortage-backed MAKE demand is available for authorization.'
      );
    const invalid = makeDemands.filter(
      (demand) =>
        demand.demand_status !== 'PLANNED' ||
        !demand.routing_id ||
        !demand.wad_authorization_id ||
        String(demand.wad_authorization_id) !==
          String(context.wad_authorization_id)
    );
    if (invalid.length)
      throw new ProductionExecutionAuthorizationError(
        'DEMAND_NOT_AUTHORIZABLE',
        'Every MAKE demand must be planned and retain the frozen routing and WAD authority.',
        409,
        { paths: invalid.map((demand) => demand.assembly_path) }
      );
    const existingFloorLinks = rows(
      await tx.execute(sql`
        SELECT l.demand_id,l.link_type FROM project_production_demand_execution_links l
        JOIN project_production_demands d ON d.id=l.demand_id
        WHERE d.production_launch_id=${launchId} AND l.link_type<>'WAD'`)
    );
    if (existingFloorLinks.length)
      throw new ProductionExecutionAuthorizationError(
        'EXISTING_EXECUTION_REQUIRES_RECONCILIATION',
        'Execution records already exist and require explicit reconciliation.'
      );

    const linkIds: string[] = [];
    for (const demand of makeDemands) {
      const linkId = randomUUID();
      linkIds.push(linkId);
      await tx.execute(sql`
        INSERT INTO project_production_demand_execution_links
          (id,project_id,demand_id,production_work_order_id,link_type)
        VALUES (${linkId},${projectId},${String(demand.id)},${String(context.wad_work_order_id)},'WAD')
        ON CONFLICT DO NOTHING`);
    }
    await tx.execute(sql`
      UPDATE project_production_demands SET demand_status='AUTHORIZED',
        status_reason='Authorized against released WAD',updated_at=now()
      WHERE production_launch_id=${launchId} AND project_id=${projectId}
        AND disposition='MAKE' AND shortage_quantity>0 AND demand_status='PLANNED'`);
    const eventId = randomUUID();
    const evidence = {
      launchId,
      wadAuthorizationId: context.wad_authorization_id,
      wadWorkOrderId: context.wad_work_order_id,
      demandIds: makeDemands.map((demand) => demand.id),
      createsFloorRecords: false,
    };
    await tx.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'EXECUTION_AUTHORIZED',${requestHash},
        ${digest(evidence)},${JSON.stringify({ linkIds })}::jsonb,${JSON.stringify(evidence)}::jsonb,
        ${actor.userId},${actor.displayName},${actor.role},${input.signatureMeaning.trim()})
      RETURNING *`);
    return {
      replayed: false,
      eventId,
      authorizedDemandIds: evidence.demandIds,
    };
  });
}
