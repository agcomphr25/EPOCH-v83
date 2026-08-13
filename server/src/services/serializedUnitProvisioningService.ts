import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { storage } from '../../storage';
import { isP2V2SerializedUnitProvisioningEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const intArray = (values: number[]) =>
  values.length
    ? sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`,`
      )}]::int[]`
    : sql`ARRAY[]::int[]`;

export type SerializedUnitProvisioningInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class SerializedUnitProvisioningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function provisionP2SerializedUnits(
  projectId: string,
  launchId: string,
  input: SerializedUnitProvisioningInput,
  actor: PlanningActor
) {
  if (!isP2V2SerializedUnitProvisioningEnabled())
    throw new SerializedUnitProvisioningError(
      'P2_V2_SERIALIZED_UNIT_PROVISIONING_DISABLED',
      'P2 serialized-unit provisioning is disabled.',
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
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:p2-serialized-provisioning`},0))`
    );
    const launch = rows(
      await tx.execute(sql`
        SELECT pl.id,pl.status,pl.preview_digest,wa.status AS wad_status,
          wa.wad_work_order_id,pwo.wad_status AS work_order_wad_status
        FROM project_production_launches pl
        JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
        JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
        JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
        WHERE pl.id=${launchId} AND pl.project_id=${projectId}
        FOR UPDATE OF pl,p,wa,pwo`)
    )[0];
    if (!launch)
      throw new SerializedUnitProvisioningError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      launch.status !== 'COMPLETE' ||
      launch.wad_status !== 'RELEASED' ||
      launch.work_order_wad_status !== 'APPROVED'
    )
      throw new SerializedUnitProvisioningError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must remain complete and released.'
      );
    if (String(launch.preview_digest) !== input.expectedLaunchDigest)
      throw new SerializedUnitProvisioningError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await tx.execute(sql`
        SELECT * FROM project_production_launch_events
        WHERE production_launch_id=${launchId}
          AND event_type='P2_SERIALIZED_UNITS_PROVISIONED'
        LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new SerializedUnitProvisioningError(
          'SERIALIZED_UNIT_PROVISIONING_IDEMPOTENCY_CONFLICT',
          'Serialized units were already provisioned with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }

    const demands = rows(
      await tx.execute(sql`
        SELECT d.*,pol.p2_production_order_id,po.quantity AS order_quantity,
          po.status AS order_status,po.project_id AS order_project_id,
          po.p2_po_id AS order_po_id,po.p2_po_item_id AS order_po_item_id,
          po.sku AS order_sku
        FROM project_production_demands d
        JOIN project_production_demand_execution_links pol
          ON pol.demand_id=d.id AND pol.project_id=d.project_id
          AND pol.link_type='P2_PRODUCTION_ORDER'
        JOIN p2_production_orders po ON po.id=pol.p2_production_order_id
        WHERE d.project_id=${projectId} AND d.production_launch_id=${launchId}
          AND d.parent_demand_id IS NULL AND d.path_depth=0
          AND d.classification='MANUFACTURED' AND d.disposition='MAKE'
          AND d.shortage_quantity>0
        ORDER BY d.assembly_path FOR UPDATE OF d,po`)
    );
    if (!demands.length)
      throw new SerializedUnitProvisioningError(
        'ROOT_MANUFACTURED_DEMAND_REQUIRED',
        'No root manufactured customer demand is available for serialization.'
      );

    const invalid = demands.filter((demand) => {
      const quantity = Number(demand.shortage_quantity);
      return (
        demand.demand_status !== 'IN_PROCESS' ||
        demand.order_status !== 'PENDING' ||
        String(demand.order_project_id) !== projectId ||
        Number(demand.order_po_id) !== Number(demand.po_id) ||
        Number(demand.order_po_item_id) !== Number(demand.po_item_id) ||
        String(demand.order_sku) !== String(demand.part_number) ||
        Number(demand.order_quantity) !== quantity ||
        !demand.routing_id ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      );
    });
    if (invalid.length)
      throw new SerializedUnitProvisioningError(
        'ROOT_DEMAND_NOT_SERIALIZABLE',
        'Every root demand must retain its exact pending P2 order, routing, and whole-unit quantity.',
        409,
        { paths: invalid.map((demand) => demand.assembly_path) }
      );

    const targetPoItemIds = demands.map((demand) => Number(demand.po_item_id));
    const legacySerials = rows(
      await tx.execute(sql`
        SELECT si.id,si.po_item_id FROM p2_serialized_items si
        LEFT JOIN project_production_demand_serialized_units link
          ON link.serialized_item_id=si.id
        WHERE si.po_item_id=ANY(${intArray(targetPoItemIds)})
          AND link.id IS NULL FOR UPDATE OF si`)
    );
    if (legacySerials.length)
      throw new SerializedUnitProvisioningError(
        'EXISTING_SERIALS_REQUIRE_RECONCILIATION',
        'Unlinked serialized units already exist for a target PO item.'
      );

    const serializedItemIds: string[] = [];
    const linkIds: string[] = [];
    for (const demand of demands) {
      const created = await storage.addP2SerializedItemsForPoItem(
        Number(demand.po_item_id),
        Number(demand.shortage_quantity),
        tx
      );
      const mismatched = created.filter(
        (item) =>
          item.poId !== Number(demand.po_id) ||
          item.poItemId !== Number(demand.po_item_id) ||
          item.partNumber !== String(demand.part_number) ||
          item.partRoutingId !== String(demand.routing_id) ||
          item.currentDepartment !== 'Pending Layup'
      );
      if (
        created.length !== Number(demand.shortage_quantity) ||
        mismatched.length
      )
        throw new SerializedUnitProvisioningError(
          'SERIALIZED_UNIT_AUTHORITY_MISMATCH',
          'The authoritative serial allocator did not preserve the frozen demand identity.'
        );
      for (const item of created) {
        serializedItemIds.push(item.id);
        const linkId = randomUUID();
        linkIds.push(linkId);
        await tx.execute(sql`
          INSERT INTO project_production_demand_serialized_units
            (id,project_id,demand_id,p2_production_order_id,serialized_item_id)
          VALUES (${linkId},${projectId},${String(demand.id)},
            ${Number(demand.p2_production_order_id)},${item.id})`);
      }
    }

    const eventId = randomUUID();
    const evidence = {
      launchId,
      demandIds: demands.map((demand) => demand.id),
      serializedItemIds,
      createsTravelers: false,
    };
    await tx.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,
         actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'P2_SERIALIZED_UNITS_PROVISIONED',
        ${requestHash},${digest(evidence)},
        ${JSON.stringify({ serializedItemIds, linkIds })}::jsonb,
        ${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},
        ${actor.role},${input.signatureMeaning.trim()})`);
    return {
      replayed: false,
      eventId,
      serializedItemIds,
      serializedDemandIds: evidence.demandIds,
    };
  });
}
