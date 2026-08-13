import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2WorkOrderProvisioningEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type WorkOrderProvisioningInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class WorkOrderProvisioningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function provisionP2WorkOrders(
  projectId: string,
  launchId: string,
  input: WorkOrderProvisioningInput,
  actor: PlanningActor
) {
  if (!isP2V2WorkOrderProvisioningEnabled())
    throw new WorkOrderProvisioningError(
      'P2_V2_WORK_ORDER_PROVISIONING_DISABLED',
      'P2 work-order provisioning is disabled.',
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
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:p2-work-order-provisioning`},0))`
    );
    const launch = rows(
      await tx.execute(sql`
      SELECT pl.id,pl.status,pl.preview_digest,wa.status AS wad_status,
        wa.wad_work_order_id,pwo.work_order_number,pwo.part_number AS wad_part_number,
        pwo.quantity AS wad_quantity,pwo.wad_status AS work_order_wad_status
      FROM project_production_launches pl
      JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
      JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
      JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
      WHERE pl.id=${launchId} AND pl.project_id=${projectId}
      FOR UPDATE OF pl,p,wa,pwo`)
    )[0];
    if (!launch)
      throw new WorkOrderProvisioningError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      launch.status !== 'COMPLETE' ||
      launch.wad_status !== 'RELEASED' ||
      launch.work_order_wad_status !== 'APPROVED'
    )
      throw new WorkOrderProvisioningError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must remain complete and released.'
      );
    if (String(launch.preview_digest) !== input.expectedLaunchDigest)
      throw new WorkOrderProvisioningError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await tx.execute(sql`
      SELECT * FROM project_production_launch_events
      WHERE production_launch_id=${launchId} AND event_type='P2_WORK_ORDERS_PROVISIONED' LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new WorkOrderProvisioningError(
          'WORK_ORDER_PROVISIONING_IDEMPOTENCY_CONFLICT',
          'Work orders were already provisioned with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }

    const demands = rows(
      await tx.execute(sql`
      SELECT d.*,wl.id AS wad_link_id,pol.id AS p2_order_link_id,
        ro.department_name AS routing_first_department
      FROM project_production_demands d
      LEFT JOIN project_production_demand_execution_links wl
        ON wl.demand_id=d.id AND wl.link_type='WAD'
        AND wl.production_work_order_id=${String(launch.wad_work_order_id)}
      LEFT JOIN project_production_demand_execution_links pol
        ON pol.demand_id=d.id AND pol.link_type='P2_PRODUCTION_ORDER'
      LEFT JOIN LATERAL (
        SELECT department_name FROM routing_operations
        WHERE part_routing_id=d.routing_id ORDER BY step_number,id LIMIT 1
      ) ro ON true
      WHERE d.project_id=${projectId} AND d.production_launch_id=${launchId}
        AND d.disposition='MAKE' AND d.shortage_quantity>0
      ORDER BY d.path_depth,d.assembly_path FOR UPDATE OF d`)
    );
    if (!demands.length)
      throw new WorkOrderProvisioningError(
        'AUTHORIZED_MAKE_DEMAND_REQUIRED',
        'No shortage-backed MAKE demand is available for work-order provisioning.'
      );
    const roots = demands.filter((demand) => !demand.parent_demand_id);
    if (roots.length !== 1)
      throw new WorkOrderProvisioningError(
        'SINGLE_ROOT_ASSEMBLY_REQUIRED',
        'The current WAD authority must resolve to exactly one root assembly.',
        409,
        { rootPaths: roots.map((demand) => demand.assembly_path) }
      );
    const invalid = demands.filter(
      (demand) =>
        demand.demand_status !== 'IN_PROCESS' ||
        !demand.wad_link_id ||
        !demand.p2_order_link_id ||
        !demand.routing_id ||
        !demand.routing_first_department ||
        String(demand.routing_first_department).trim() !==
          String(demand.first_department_snapshot ?? '').trim() ||
        !Number.isSafeInteger(Number(demand.shortage_quantity)) ||
        Number(demand.shortage_quantity) <= 0
    );
    if (invalid.length)
      throw new WorkOrderProvisioningError(
        'WORK_ORDER_DEMAND_NOT_PROVISIONABLE',
        'Every MAKE demand must retain authorized P2 demand, released WAD, and frozen routing evidence.',
        409,
        { paths: invalid.map((demand) => demand.assembly_path) }
      );
    const root = roots[0];
    if (
      String(root.part_number).trim().toLowerCase() !==
        String(launch.wad_part_number).trim().toLowerCase() ||
      Number(root.shortage_quantity) !== Number(launch.wad_quantity)
    )
      throw new WorkOrderProvisioningError(
        'ROOT_WAD_MISMATCH',
        'The released WAD does not exactly represent the root assembly part and quantity.'
      );

    const existing = rows(
      await tx.execute(sql`
      SELECT l.demand_id FROM project_production_demand_execution_links l
      JOIN project_production_demands d ON d.id=l.demand_id
      WHERE d.production_launch_id=${launchId} AND l.link_type='WORK_ORDER'`)
    );
    if (existing.length)
      throw new WorkOrderProvisioningError(
        'EXISTING_WORK_ORDERS_REQUIRE_RECONCILIATION',
        'Work-order links already exist and require explicit reconciliation.'
      );

    const workOrderIds: string[] = [];
    const linkIds: string[] = [];
    for (const demand of demands) {
      let workOrderId = String(launch.wad_work_order_id);
      if (demand.id !== root.id) {
        const workOrderNumber = `P2WO-${String(demand.id)}`;
        const created = rows(
          await tx.execute(sql`
          INSERT INTO production_work_orders
            (work_order_number,project_id,part_number,description,quantity,status,
             wad_status,due_date,assigned_department,wizard_data)
          VALUES (${workOrderNumber},${projectId},${String(demand.part_number)},
            ${String(demand.description ?? demand.part_number)},${Number(demand.shortage_quantity)},
            'PLANNED','DRAFT',${demand.required_by_date ?? null},
            ${String(demand.routing_first_department).trim()},
            ${JSON.stringify({ source: 'P2_V2_PRODUCTION_DEMAND', launchId, demandId: demand.id, parentDemandId: demand.parent_demand_id, routingId: demand.routing_id, assemblyPath: demand.assembly_path })}::jsonb)
          RETURNING id`)
        )[0];
        workOrderId = String(created.id);
      }
      workOrderIds.push(workOrderId);
      const linkId = randomUUID();
      linkIds.push(linkId);
      await tx.execute(sql`
        INSERT INTO project_production_demand_execution_links
          (id,project_id,demand_id,production_work_order_id,link_type)
        VALUES (${linkId},${projectId},${String(demand.id)},${workOrderId},'WORK_ORDER')`);
    }

    const eventId = randomUUID();
    const evidence = {
      launchId,
      rootDemandId: root.id,
      rootWorkOrderId: launch.wad_work_order_id,
      demandIds: demands.map((demand) => demand.id),
      workOrderIds,
      createsTravelers: false,
      releasesFloorWork: false,
    };
    await tx.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'P2_WORK_ORDERS_PROVISIONED',${requestHash},
        ${digest(evidence)},${JSON.stringify({ workOrderIds, linkIds })}::jsonb,
        ${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},${actor.role},${input.signatureMeaning.trim()})`);
    return {
      replayed: false,
      eventId,
      workOrderIds,
      provisionedDemandIds: evidence.demandIds,
    };
  });
}
