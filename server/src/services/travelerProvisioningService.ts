import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db, pgPool } from '../../db';
import { storage } from '../../storage';
import { isP2V2TravelerProvisioningEnabled } from '../lib/featureFlags';
import type { PlanningActor } from './projectProductionPlanningService';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? (value as Row[])
    : ((value as { rows?: Row[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type TravelerProvisioningInput = {
  idempotencyKey: string;
  expectedLaunchDigest: string;
  signatureMeaning: string;
};

export class TravelerProvisioningError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export async function provisionP2DraftTravelers(
  projectId: string,
  launchId: string,
  input: TravelerProvisioningInput,
  actor: PlanningActor
) {
  if (!isP2V2TravelerProvisioningEnabled())
    throw new TravelerProvisioningError(
      'P2_V2_TRAVELER_PROVISIONING_DISABLED',
      'P2 draft traveler provisioning is disabled.',
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
      ['p2-v2-traveler-provisioning', projectId]
    );

    const launch = rows(
      await db.execute(sql`
        SELECT pl.id,pl.status,pl.preview_digest,wa.status AS wad_status,
          wa.wad_work_order_id,pwo.wad_status AS work_order_wad_status
        FROM project_production_launches pl
        JOIN projects p ON p.id=pl.project_id AND p.workflow_version='p2_v2'
        JOIN project_wad_authorizations wa ON wa.id=pl.wad_authorization_id
        JOIN production_work_orders pwo ON pwo.id=wa.wad_work_order_id
        WHERE pl.id=${launchId} AND pl.project_id=${projectId}`)
    )[0];
    if (!launch)
      throw new TravelerProvisioningError(
        'PRODUCTION_LAUNCH_NOT_FOUND',
        'The completed Production Launch was not found.',
        404
      );
    if (
      launch.status !== 'COMPLETE' ||
      launch.wad_status !== 'RELEASED' ||
      launch.work_order_wad_status !== 'APPROVED'
    )
      throw new TravelerProvisioningError(
        'EXECUTION_AUTHORITY_NOT_RELEASED',
        'The launch and exact WAD authority must remain complete and released.'
      );
    if (String(launch.preview_digest) !== input.expectedLaunchDigest)
      throw new TravelerProvisioningError(
        'STALE_PRODUCTION_LAUNCH',
        'The expected Production Launch digest is stale.'
      );

    const priorEvent = rows(
      await db.execute(sql`
        SELECT * FROM project_production_launch_events
        WHERE production_launch_id=${launchId}
          AND event_type='P2_DRAFT_TRAVELERS_PROVISIONED' LIMIT 1`)
    )[0];
    if (priorEvent) {
      if (String(priorEvent.request_hash) !== requestHash)
        throw new TravelerProvisioningError(
          'TRAVELER_PROVISIONING_IDEMPOTENCY_CONFLICT',
          'Draft travelers were already provisioned with different evidence.'
        );
      return { replayed: true, event: priorEvent };
    }

    const targets = rows(
      await db.execute(sql`
        SELECT su.id AS serialized_unit_link_id,su.demand_id,
          si.id AS serialized_item_id,si.serial_number,si.po_number,
          si.part_routing_id,si.part_number,si.status AS serialized_status,
          d.routing_id,d.demand_status,st.traveler_id
        FROM project_production_demand_serialized_units su
        JOIN project_production_demands d ON d.id=su.demand_id
          AND d.project_id=su.project_id AND d.production_launch_id=${launchId}
        JOIN p2_serialized_items si ON si.id=su.serialized_item_id
        LEFT JOIN project_production_serialized_unit_travelers st
          ON st.serialized_unit_link_id=su.id
        WHERE su.project_id=${projectId}
        ORDER BY si.serial_number`)
    );
    if (!targets.length)
      throw new TravelerProvisioningError(
        'SERIALIZED_ROOT_UNITS_REQUIRED',
        'No audited serialized root units are available for traveler provisioning.'
      );

    const invalid = targets.filter(
      (target) =>
        target.demand_status !== 'IN_PROCESS' ||
        target.serialized_status !== 'ACTIVE' ||
        !target.serial_number ||
        !target.routing_id ||
        String(target.part_routing_id) !== String(target.routing_id)
    );
    if (invalid.length)
      throw new TravelerProvisioningError(
        'SERIALIZED_UNIT_NOT_TRAVELER_READY',
        'Every serialized unit must retain pending status and its exact frozen routing.',
        409,
        {
          serializedItemIds: invalid.map((target) => target.serialized_item_id),
        }
      );

    const travelerIds: string[] = [];
    for (const target of targets) {
      if (target.traveler_id) {
        travelerIds.push(String(target.traveler_id));
        continue;
      }
      const existing = rows(
        await db.execute(sql`
          SELECT id FROM travelers
          WHERE lower(trim(serial_number))=lower(trim(${String(target.serial_number)}))
          LIMIT 1`)
      );
      if (existing.length)
        throw new TravelerProvisioningError(
          'EXISTING_TRAVELER_REQUIRES_RECONCILIATION',
          'An unlinked traveler already exists for a target serialized unit.'
        );

      let traveler = await storage.generateTravelerFromRouting(
        String(target.routing_id),
        {
          serialNumber: String(target.serial_number),
          lotNumber: target.po_number ? String(target.po_number) : undefined,
          quantity: 1,
          createdBy: actor.displayName,
        }
      );
      traveler = await storage.updateTraveler(traveler.id, {
        status: 'DRAFT',
        projectId,
        productionWorkOrderId: String(launch.wad_work_order_id),
      });
      await db.execute(sql`
        INSERT INTO project_production_serialized_unit_travelers
          (id,project_id,serialized_unit_link_id,traveler_id)
        VALUES (${randomUUID()},${projectId},${String(target.serialized_unit_link_id)},${traveler.id})`);
      travelerIds.push(traveler.id);
    }

    const activeRecords = rows(
      await db.execute(sql`
        SELECT t.id FROM travelers t
        JOIN project_production_serialized_unit_travelers st ON st.traveler_id=t.id
        JOIN project_production_demand_serialized_units su ON su.id=st.serialized_unit_link_id
        LEFT JOIN traveler_steps ts ON ts.traveler_id=t.id AND ts.status<>'NOT_STARTED'
        WHERE su.project_id=${projectId}
          AND (t.status<>'DRAFT' OR ts.id IS NOT NULL) LIMIT 1`)
    );
    if (activeRecords.length)
      throw new TravelerProvisioningError(
        'TRAVELER_ACTIVATION_BOUNDARY_VIOLATED',
        'Provisioned travelers must remain draft with all steps not started.'
      );

    const eventId = randomUUID();
    const evidence = {
      launchId,
      travelerIds,
      createsQueues: false,
      activatesWork: false,
    };
    await db.execute(sql`
      INSERT INTO project_production_launch_events
        (id,project_id,production_launch_id,event_type,request_hash,evidence_digest,
         created_record_ids,evidence_snapshot,actor_user_id,actor_display_name,
         actor_role,signature_meaning)
      VALUES (${eventId},${projectId},${launchId},'P2_DRAFT_TRAVELERS_PROVISIONED',
        ${requestHash},${digest(evidence)},${JSON.stringify({ travelerIds })}::jsonb,
        ${JSON.stringify(evidence)}::jsonb,${actor.userId},${actor.displayName},
        ${actor.role},${input.signatureMeaning.trim()})`);
    return { replayed: false, eventId, travelerIds };
  } finally {
    try {
      await lockClient.query(
        'SELECT pg_advisory_unlock(hashtext($1),hashtext($2))',
        ['p2-v2-traveler-provisioning', projectId]
      );
    } finally {
      lockClient.release();
    }
  }
}
