import { createHash, randomUUID } from 'node:crypto';

import { pool } from '../../db';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';
import { P2WorkOrderError } from './p2ManufacturingWorkOrderService';
import {
  planTravelerCoverage as planCoverage,
  TravelerCoveragePlanError,
} from './p2TravelerCoveragePlanner';

type Row = Record<string, unknown>;
const clean = (value: unknown) => String(value ?? '').trim();
const record = (value: unknown): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function provisionP2Travelers(
  authorityId: string,
  input: {
    idempotencyKey: string;
    expectedConcurrencyVersion: number;
    batchQuantity?: number;
  },
  actor: P2WorkOrderActor
) {
  if (!actor.employeeId)
    throw new P2WorkOrderError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  const requestHash = hash(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `${authorityId}:p2-traveler-provision`,
    ]);
    const replay = await client.query(
      `SELECT * FROM p2_traveler_provisioning_events WHERE work_order_authority_id=$1 AND event_type='TRAVELERS_PROVISIONED' AND request_key=$2`,
      [authorityId, input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new P2WorkOrderError(
          'TRAVELER_PROVISIONING_IDEMPOTENCY_CONFLICT',
          'This idempotency key was used with different provisioning authority.'
        );
      await client.query('COMMIT');
      return { replayed: true, ...record(replay.rows[0].evidence) };
    }
    const locked = await client.query(
      `SELECT a.*,b.purchase_order_snapshot
       FROM p2_manufacturing_work_order_authorities a
       JOIN p2_frozen_production_demand_baselines b ON b.id=a.frozen_demand_baseline_id
       WHERE a.id=$1 FOR UPDATE OF a`,
      [authorityId]
    );
    if (!locked.rows[0])
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_NOT_FOUND',
        'P2 work-order authority was not found.',
        404
      );
    const authority = locked.rows[0];
    if (
      Number(authority.concurrency_version) !== input.expectedConcurrencyVersion
    )
      throw new P2WorkOrderError(
        'STALE_WORK_ORDER',
        'Work-order authority changed; refresh before provisioning.'
      );
    if (authority.status !== 'PLANNED' && authority.status !== 'BLOCKED')
      throw new P2WorkOrderError(
        'TRAVELER_SPLIT_EXECUTION_STARTED',
        'Traveler coverage cannot change after work execution has started.'
      );
    const decision = record(authority.wad_decision_snapshot);
    const requirement = clean(decision.traveler_type ?? decision.travelerType);
    if (
      clean(decision.traveler_requirement ?? decision.travelerRequirement) !==
      'REQUIRED'
    )
      throw new P2WorkOrderError(
        'TRAVELER_NOT_REQUIRED',
        'The released WAD decision does not require a traveler.'
      );
    const traceability = record(authority.traceability_snapshot);
    const policy = clean(
      traceability.policy_type ?? traceability.policyType ?? traceability.type
    );
    if (policy === 'LOT' || requirement === 'LOT')
      throw new P2WorkOrderError(
        'LOT_TRAVELER_PROVISIONING_NOT_IMPLEMENTED',
        'Automatic Lot traveler provisioning is not implemented.'
      );
    if (!['INDIVIDUAL', 'BATCH'].includes(requirement))
      throw new P2WorkOrderError(
        'TRAVELER_TYPE_UNSUPPORTED',
        'The released WAD traveler type is unsupported.'
      );
    const coverage = await client.query(
      `SELECT unit_ordinal FROM p2_traveler_coverage_units WHERE work_order_authority_id=$1 ORDER BY unit_ordinal FOR SHARE`,
      [authorityId]
    );
    let plans;
    try {
      plans = planCoverage(
        Number(authority.required_quantity),
        requirement,
        coverage.rows.map((row) => Number(row.unit_ordinal)),
        input.batchQuantity
      );
    } catch (error) {
      if (error instanceof TravelerCoveragePlanError)
        throw new P2WorkOrderError(error.code, error.message);
      throw error;
    }
    const routing = record(authority.routing_snapshot);
    const operations = Array.isArray(routing.operations)
      ? routing.operations.map(record)
      : [];
    const created: Array<{
      travelerId: string;
      travelerNumber: string;
      outputIdentity: string;
      quantity: number;
    }> = [];
    for (const plan of plans) {
      const travelerId = randomUUID();
      const suffix =
        requirement === 'INDIVIDUAL'
          ? `U${String(plan.start).padStart(4, '0')}`
          : `B${String(plan.start).padStart(4, '0')}-${String(plan.end).padStart(4, '0')}`;
      const travelerNumber = `P2-TRV-${clean(authority.production_work_order_id).slice(0, 8).toUpperCase()}-${suffix}`;
      const outputIdentity = `P2-OUT:${authorityId}:${suffix}`;
      const barcodeValue = `P2TRV:${travelerId}`;
      const snapshot = {
        workOrderAuthorityId: authorityId,
        productionWorkOrderId: authority.production_work_order_id,
        frozenDemandBaselineId: authority.frozen_demand_baseline_id,
        frozenDemandNodeId: authority.frozen_demand_node_id,
        inventoryItemId: authority.inventory_item_id,
        assemblyPathIdentity: authority.assembly_path_identity,
        travelerType: requirement,
        coverage: plan,
        routingSnapshot: authority.routing_snapshot,
        wadDecisionSnapshot: authority.wad_decision_snapshot,
        traceabilitySnapshot: authority.traceability_snapshot,
        purchaseOrderSnapshot: authority.purchase_order_snapshot,
        outputIdentity,
      };
      await client.query(
        `INSERT INTO travelers (id,traveler_number,inventory_item_id,part_number,part_name,production_work_order_id,project_id,serial_number,lot_number,internal_control_number,quantity,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT',$12)`,
        [
          travelerId,
          travelerNumber,
          String(authority.inventory_item_id),
          authority.part_number_snapshot,
          authority.description_snapshot,
          authority.production_work_order_id,
          authority.project_id,
          requirement === 'INDIVIDUAL' ? outputIdentity : null,
          requirement === 'BATCH' ? outputIdentity : null,
          barcodeValue,
          plan.quantity,
          String(actor.userId),
        ]
      );
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        await client.query(
          `INSERT INTO traveler_steps (traveler_id,department_name,step_number,status) VALUES ($1,$2,$3,'NOT_STARTED')`,
          [
            travelerId,
            clean(
              operation.department_name_snapshot ??
                operation.departmentNameSnapshot ??
                operation.department_name ??
                operation.departmentName
            ),
            Number(operation.step_number ?? operation.stepNumber ?? index + 1),
          ]
        );
      }
      const provisioned = await client.query(
        `INSERT INTO p2_traveler_provisioning_authorities (work_order_authority_id,traveler_id,traveler_type,coverage_quantity,coverage_start_ordinal,coverage_end_ordinal,output_identity,barcode_value,authority_snapshot,authority_checksum,created_by_user_id,created_by_employee_id,created_by_display_name,created_by_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING id`,
        [
          authorityId,
          travelerId,
          requirement,
          plan.quantity,
          plan.start,
          plan.end,
          outputIdentity,
          barcodeValue,
          JSON.stringify(snapshot),
          hash(snapshot),
          actor.userId,
          actor.employeeId,
          actor.displayName,
          actor.role,
        ]
      );
      for (let ordinal = plan.start; ordinal <= plan.end; ordinal += 1)
        await client.query(
          `INSERT INTO p2_traveler_coverage_units (work_order_authority_id,provisioning_authority_id,traveler_id,unit_ordinal,output_identity) VALUES ($1,$2,$3,$4,$5)`,
          [
            authorityId,
            provisioned.rows[0].id,
            travelerId,
            ordinal,
            `${outputIdentity}:${ordinal}`,
          ]
        );
      created.push({
        travelerId,
        travelerNumber,
        outputIdentity,
        quantity: plan.quantity,
      });
    }
    const total = await client.query(
      `SELECT count(*)::int AS covered FROM p2_traveler_coverage_units WHERE work_order_authority_id=$1`,
      [authorityId]
    );
    const evidence = {
      travelers: created,
      coveredQuantity: total.rows[0].covered,
      requiredQuantity: Number(authority.required_quantity),
      remainingQuantity:
        Number(authority.required_quantity) - Number(total.rows[0].covered),
      changesInventory: false,
      printsBarcode: false,
    };
    await client.query(
      `INSERT INTO p2_traveler_provisioning_events (work_order_authority_id,event_type,request_key,request_hash,actor_user_id,actor_employee_id,actor_display_name,actor_role,evidence) VALUES ($1,'TRAVELERS_PROVISIONED',$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        authorityId,
        input.idempotencyKey,
        requestHash,
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify(evidence),
      ]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_authorities SET traveler_id=COALESCE(traveler_id,$2),concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1`,
      [authorityId, created[0]?.travelerId ?? null]
    );
    await client.query('COMMIT');
    return { replayed: false, ...evidence };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
