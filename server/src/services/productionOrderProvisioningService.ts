import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2ProductionOrderProvisioningEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type ProductionOrderProvisioningInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class ProductionOrderProvisioningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function provisionP2ProductionOrders(
  projectId: string,
  launchId: string,
  input: ProductionOrderProvisioningInput,
  actor: PlanningActor
) {
  if (!isP2V2ProductionOrderProvisioningEnabled())
    throw new ProductionOrderProvisioningError(
      'P2_V2_PRODUCTION_ORDER_PROVISIONING_DISABLED',
      'P2 production order provisioning is disabled.',
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
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:p2-order-provisioning`},0))`
    );
    const launch = rows(
      await tx.execute(sql`
        SELECT pl.id,pl.status,pl.preview_digest,pl.wad_authorization_id,
          wa.status AS wad_status,wa.wad_work_order_id,
          pwo.wad_status AS work_order_wad_status
        FROM project_production_launches pl
        JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
        JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
        JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
        WHERE pl.id=${launchId} AND pl.project_id=${projectId}
        FOR UPDATE OF pl,p,wa,pwo`)
    )[0];
    if (!launch)
      throw new ProductionOrderProvisioningError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      launch.status !== 'COMPLETE' ||
      launch.wad_status !== 'RELEASED' ||
      launch.work_order_wad_status !== 'APPROVED'
    )
      throw new ProductionOrderProvisioningError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must remain complete and released.'
      );
    if (String(launch.preview_digest) !== input.expectedLaunchDigest)
      throw new ProductionOrderProvisioningError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await tx.execute(sql`
        SELECT * FROM project_production_launch_events
        WHERE production_launch_id=${launchId}
          AND event_type='P2_PRODUCTION_ORDERS_PROVISIONED'
        LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new ProductionOrderProvisioningError(
          'P2_ORDER_PROVISIONING_IDEMPOTENCY_CONFLICT',
          'P2 production orders were already provisioned with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }

    const demands = rows(
      await tx.execute(sql`
        SELECT d.*,pi.part_name,
          ro.department_name AS routing_first_department,
          wl.id AS wad_link_id
        FROM project_production_demands d
        JOIN p2_purchase_order_items pi ON pi.id=d.po_item_id AND pi.po_id=d.po_id
        LEFT JOIN project_production_demand_execution_links wl
          ON wl.demand_id=d.id AND wl.project_id=d.project_id
          AND wl.link_type='WAD'
          AND wl.production_work_order_id=${String(launch.wad_work_order_id)}
        LEFT JOIN LATERAL (
          SELECT department_name FROM routing_operations
          WHERE part_routing_id=d.routing_id
          ORDER BY step_number,id LIMIT 1
        ) ro ON true
        WHERE d.project_id=${projectId} AND d.production_launch_id=${launchId}
          AND d.disposition='MAKE' AND d.shortage_quantity>0
        ORDER BY d.path_depth,d.assembly_path
        FOR UPDATE OF d`)
    );
    if (!demands.length)
      throw new ProductionOrderProvisioningError(
        'AUTHORIZED_MAKE_DEMAND_REQUIRED',
        'No shortage-backed MAKE demand is available for provisioning.'
      );

    const invalid = demands.filter((demand) => {
      const quantity = Number(demand.shortage_quantity);
      return (
        demand.demand_status !== 'AUTHORIZED' ||
        !demand.wad_link_id ||
        !demand.routing_id ||
        !demand.routing_first_department ||
        !demand.first_department_snapshot ||
        String(demand.routing_first_department).trim() !==
          String(demand.first_department_snapshot).trim() ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      );
    });
    if (invalid.length)
      throw new ProductionOrderProvisioningError(
        'P2_ORDER_DEMAND_NOT_PROVISIONABLE',
        'Every demand must be authorized, whole-unit, and retain its frozen first routing department.',
        409,
        { paths: invalid.map((demand) => demand.assembly_path) }
      );

    const existing = rows(
      await tx.execute(sql`
        SELECT l.demand_id,l.p2_production_order_id
        FROM project_production_demand_execution_links l
        JOIN project_production_demands d ON d.id=l.demand_id
        WHERE d.production_launch_id=${launchId}
          AND l.link_type='P2_PRODUCTION_ORDER'`)
    );
    if (existing.length)
      throw new ProductionOrderProvisioningError(
        'EXISTING_P2_ORDERS_REQUIRE_RECONCILIATION',
        'P2 production order links already exist and require explicit reconciliation.'
      );

    const productionOrderIds: number[] = [];
    const linkIds: string[] = [];
    for (const demand of demands) {
      const orderId = `P2V2-${String(demand.id)}`;
      const created = rows(
        await tx.execute(sql`
          INSERT INTO p2_production_orders
            (order_id,p2_po_id,p2_po_item_id,project_id,sku,part_name,quantity,
             department,status,priority,due_date,notes)
          VALUES (${orderId},${Number(demand.po_id)},${Number(demand.po_item_id)},
            ${projectId},${String(demand.part_number)},
            ${String(demand.part_name ?? demand.description ?? demand.part_number)},
            ${Number(demand.shortage_quantity)},${String(demand.routing_first_department).trim()},
            'PENDING',50,${demand.required_by_date ?? null},
            ${`Provisioned from controlled Production Launch demand ${String(demand.id)}`})
          RETURNING id`)
      )[0];
      const productionOrderId = Number(created.id);
      productionOrderIds.push(productionOrderId);
      const linkId = randomUUID();
      linkIds.push(linkId);
      await tx.execute(sql`
        INSERT INTO project_production_demand_execution_links
          (id,project_id,demand_id,p2_production_order_id,link_type)
        VALUES (${linkId},${projectId},${String(demand.id)},${productionOrderId},
          'P2_PRODUCTION_ORDER')`);
    }

    await tx.execute(sql`
      UPDATE project_production_demands
      SET demand_status='IN_PROCESS',
        status_reason='P2 production order provisioned',updated_at=now()
      WHERE project_id=${projectId} AND production_launch_id=${launchId}
        AND disposition='MAKE' AND shortage_quantity>0
        AND demand_status='AUTHORIZED'`);

    const eventId = randomUUID();
    const evidence = {
      launchId,
      demandIds: demands.map((demand) => demand.id),
      productionOrderIds,
      createsSerializedItems: false,
      createsTravelers: false,
    };
    await tx.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,
         actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'P2_PRODUCTION_ORDERS_PROVISIONED',
        ${requestHash},${digest(evidence)},
        ${JSON.stringify({ productionOrderIds, linkIds })}::jsonb,
        ${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},
        ${actor.role},${input.signatureMeaning.trim()})`);
    return {
      replayed: false,
      eventId,
      productionOrderIds,
      provisionedDemandIds: evidence.demandIds,
    };
  });
}
