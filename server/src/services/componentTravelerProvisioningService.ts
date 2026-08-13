import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db, pgPool } from '../../db';
import { storage } from '../../storage';
import { isP2V2ComponentTravelerProvisioningEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type ComponentTravelerProvisioningInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class ComponentTravelerProvisioningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function provisionP2ComponentTravelers(
  projectId: string,
  launchId: string,
  input: ComponentTravelerProvisioningInput,
  actor: PlanningActor
) {
  if (!isP2V2ComponentTravelerProvisioningEnabled())
    throw new ComponentTravelerProvisioningError(
      'P2_V2_COMPONENT_TRAVELER_PROVISIONING_DISABLED',
      'P2 component traveler provisioning is disabled.',
      503
    );
  const requestHash = digest({
    projectId,
    launchId,
    idempotencyKey: input.idempotencyKey.trim(),
    expectedLaunchDigest: input.expectedLaunchDigest,
  });
  const lockClient = await pgPool.connect();
  try {
    await lockClient.query(
      'SELECT pg_advisory_lock(hashtext($1),hashtext($2))',
      ['p2-v2-component-travelers', projectId]
    );
    const launch = rows(
      await db.execute(sql`
      SELECT pl.id,pl.status,pl.preview_digest,wa.status AS wad_status,
        pwo.wad_status AS work_order_wad_status
      FROM project_production_launches pl
      JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
      JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
      JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
      WHERE pl.id=${launchId} AND pl.project_id=${projectId}`)
    )[0];
    if (!launch)
      throw new ComponentTravelerProvisioningError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      launch.status !== 'COMPLETE' ||
      launch.wad_status !== 'RELEASED' ||
      launch.work_order_wad_status !== 'APPROVED'
    )
      throw new ComponentTravelerProvisioningError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must remain complete and released.'
      );
    if (String(launch.preview_digest) !== input.expectedLaunchDigest)
      throw new ComponentTravelerProvisioningError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await db.execute(sql`
      SELECT * FROM project_production_launch_events
      WHERE production_launch_id=${launchId}
        AND event_type='P2_COMPONENT_TRAVELERS_PROVISIONED' LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new ComponentTravelerProvisioningError(
          'COMPONENT_TRAVELER_IDEMPOTENCY_CONFLICT',
          'Component travelers were already provisioned with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }
    const workOrderEvent = rows(
      await db.execute(sql`
      SELECT id FROM project_production_launch_events
      WHERE production_launch_id=${launchId} AND event_type='P2_WORK_ORDERS_PROVISIONED' LIMIT 1`)
    )[0];
    if (!workOrderEvent)
      throw new ComponentTravelerProvisioningError(
        'WORK_ORDER_PROVISIONING_REQUIRED',
        'Component work orders must be provisioned first.'
      );

    const targets = rows(
      await db.execute(sql`
      SELECT d.id AS demand_id,d.assembly_path,d.part_number,d.routing_id,
        d.first_department_snapshot,d.shortage_quantity,d.demand_status,
        wo.production_work_order_id,pwo.work_order_number,pwo.part_number AS work_order_part_number,
        pwo.quantity AS work_order_quantity,pwo.status AS work_order_status,
        pwo.wad_status AS work_order_wad_status,pwo.assigned_department,
        tl.traveler_id,ro.department_name AS routing_first_department
      FROM project_production_demands d
      JOIN project_production_demand_execution_links wo
        ON wo.demand_id=d.id AND wo.project_id=d.project_id AND wo.link_type='WORK_ORDER'
      JOIN production_work_orders pwo ON pwo.id=wo.production_work_order_id
      LEFT JOIN project_production_demand_execution_links tl
        ON tl.demand_id=d.id AND tl.project_id=d.project_id AND tl.link_type='TRAVELER'
      LEFT JOIN LATERAL (
        SELECT department_name FROM routing_operations
        WHERE part_routing_id=d.routing_id ORDER BY step_number,id LIMIT 1
      ) ro ON true
      WHERE d.project_id=${projectId} AND d.production_launch_id=${launchId}
        AND d.disposition='MAKE' AND d.shortage_quantity>0
        AND d.parent_demand_id IS NOT NULL
      ORDER BY d.path_depth,d.assembly_path`)
    );
    if (!targets.length)
      throw new ComponentTravelerProvisioningError(
        'MANUFACTURED_CHILD_WORK_ORDERS_REQUIRED',
        'No manufactured child work orders are available for traveler provisioning.'
      );
    const invalid = targets.filter(
      (target) =>
        target.demand_status !== 'IN_PROCESS' ||
        target.work_order_status !== 'PLANNED' ||
        target.work_order_wad_status !== 'DRAFT' ||
        target.traveler_id ||
        !target.routing_id ||
        String(target.part_number).trim().toLowerCase() !==
          String(target.work_order_part_number).trim().toLowerCase() ||
        Number(target.shortage_quantity) !==
          Number(target.work_order_quantity) ||
        String(target.routing_first_department ?? '').trim() !==
          String(target.first_department_snapshot ?? '').trim() ||
        String(target.assigned_department ?? '').trim() !==
          String(target.first_department_snapshot ?? '').trim()
    );
    if (invalid.length)
      throw new ComponentTravelerProvisioningError(
        'COMPONENT_WORK_ORDER_NOT_TRAVELER_READY',
        'Every manufactured child must retain a draft work order and exact frozen routing evidence.',
        409,
        { paths: invalid.map((target) => target.assembly_path) }
      );

    const existing = rows(
      await db.execute(sql`
      SELECT t.id FROM travelers t
      WHERE t.production_work_order_id IN (${sql.join(
        targets.map(
          (target) => sql`${String(target.production_work_order_id)}`
        ),
        sql`,`
      )})
         OR t.work_order_id IN (${sql.join(
           targets.map((target) => sql`${String(target.work_order_number)}`),
           sql`,`
         )})
      LIMIT 1`)
    );
    if (existing.length)
      throw new ComponentTravelerProvisioningError(
        'EXISTING_COMPONENT_TRAVELER_REQUIRES_RECONCILIATION',
        'An unlinked traveler already exists for a component work order.'
      );

    const travelerIds: string[] = [];
    const linkIds: string[] = [];
    for (const target of targets) {
      let traveler = await storage.generateTravelerFromRouting(
        String(target.routing_id),
        {
          lotNumber: String(target.work_order_number),
          quantity: Number(target.work_order_quantity),
          createdBy: actor.displayName,
        }
      );
      traveler = await storage.updateTraveler(traveler.id, {
        status: 'DRAFT',
        projectId,
        productionWorkOrderId: String(target.production_work_order_id),
        workOrderId: String(target.work_order_number),
      });
      const linkId = randomUUID();
      await db.execute(sql`
        INSERT INTO project_production_demand_execution_links
          (id,project_id,demand_id,traveler_id,link_type)
        VALUES (${linkId},${projectId},${String(target.demand_id)},${traveler.id},'TRAVELER')`);
      travelerIds.push(traveler.id);
      linkIds.push(linkId);
    }
    const started = rows(
      await db.execute(sql`
      SELECT t.id FROM travelers t
      JOIN project_production_demand_execution_links l ON l.traveler_id=t.id
      LEFT JOIN traveler_steps ts ON ts.traveler_id=t.id AND ts.status<>'NOT_STARTED'
      WHERE l.project_id=${projectId} AND l.link_type='TRAVELER'
        AND l.demand_id IN (${sql.join(
          targets.map((target) => sql`${String(target.demand_id)}`),
          sql`,`
        )})
        AND (t.status<>'DRAFT' OR ts.id IS NOT NULL) LIMIT 1`)
    );
    if (started.length)
      throw new ComponentTravelerProvisioningError(
        'COMPONENT_TRAVELER_ACTIVATION_BOUNDARY_VIOLATED',
        'Component travelers must remain draft with all steps not started.'
      );

    const eventId = randomUUID();
    const evidence = {
      launchId,
      demandIds: targets.map((target) => target.demand_id),
      workOrderIds: targets.map((target) => target.production_work_order_id),
      travelerIds,
      createsCncJobs: false,
      createsQueues: false,
      releasesFloorWork: false,
    };
    await db.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'P2_COMPONENT_TRAVELERS_PROVISIONED',
        ${requestHash},${digest(evidence)},${JSON.stringify({ travelerIds, linkIds })}::jsonb,
        ${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},${actor.role},${input.signatureMeaning.trim()})`);
    return {
      replayed: false,
      eventId,
      travelerIds,
      provisionedDemandIds: evidence.demandIds,
    };
  } finally {
    try {
      await lockClient.query(
        'SELECT pg_advisory_unlock(hashtext($1),hashtext($2))',
        ['p2-v2-component-travelers', projectId]
      );
    } finally {
      lockClient.release();
    }
  }
}
