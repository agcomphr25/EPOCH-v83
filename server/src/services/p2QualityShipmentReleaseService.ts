import { createHash } from 'node:crypto';

import { pool } from '../../db';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();

export class P2QualityShipmentReleaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409
  ) {
    super(message);
  }
}
const employee = (actor: P2WorkOrderActor) => {
  if (!actor.employeeId)
    throw new P2QualityShipmentReleaseError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee is required.',
      403
    );
  return actor.employeeId;
};

export async function recordP2OutputQualityDisposition(
  workOrderAuthorityId: string,
  outputId: string,
  input: {
    custodyId: string;
    disposition: 'ACCEPTED' | 'REJECTED';
    inspectionReference: string;
    reasonText: string;
    idempotencyKey: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `p2-quality:${outputId}`,
    ]);
    const requestHash = digest({ workOrderAuthorityId, outputId, ...input });
    const replay = await client.query(
      'SELECT * FROM p2_manufactured_output_quality_acceptances WHERE request_key=$1',
      [input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new P2QualityShipmentReleaseError(
          'QUALITY_IDEMPOTENCY_CONFLICT',
          'Quality idempotency key conflicts.'
        );
      await client.query('COMMIT');
      return { replayed: true, qualityAcceptance: replay.rows[0] };
    }
    const found = await client.query(
      `SELECT o.*,c.id custody_id,c.custody_status,c.received_quantity,c.issued_quantity,c.reversed_quantity,c.available_quantity
       FROM p2_manufactured_output_authorities o JOIN p2_manufactured_output_custodies c ON c.output_authority_id=o.id
       WHERE o.id=$1 AND o.work_order_authority_id=$2 AND c.id=$3 FOR UPDATE OF o,c`,
      [outputId, workOrderAuthorityId, input.custodyId]
    );
    const row = found.rows[0];
    if (!row)
      throw new P2QualityShipmentReleaseError(
        'QUALITY_AUTHORITY_NOT_FOUND',
        'Exact manufactured output custody was not found.',
        404
      );
    if (row.status !== 'RELEASED' || !row.released_at)
      throw new P2QualityShipmentReleaseError(
        'RELEASED_OUTPUT_REQUIRED',
        'Quality disposition requires released output.'
      );
    if (
      row.custody_status !== 'AVAILABLE' ||
      Number(row.issued_quantity) !== 0 ||
      Number(row.reversed_quantity) !== 0 ||
      Number(row.available_quantity) !== Number(row.received_quantity)
    )
      throw new P2QualityShipmentReleaseError(
        'QUALITY_CUSTODY_BLOCKED',
        'Quality disposition requires unreversed, unissued, fully available custody.'
      );
    if (
      row.created_by_user_id === actor.userId ||
      row.released_by_user_id === actor.userId
    )
      throw new P2QualityShipmentReleaseError(
        'INDEPENDENT_QUALITY_REQUIRED',
        'Output creator and releaser cannot perform Quality acceptance.',
        403
      );
    const snapshot = {
      outputAuthorityId: row.id,
      custodyId: row.custody_id,
      inventoryItemId: row.inventory_item_id,
      outputIdentity: row.output_identity,
      projectId: row.project_id,
      baselineId: row.frozen_demand_baseline_id,
      assemblyPathIdentity: row.assembly_path_identity,
      disposition: input.disposition,
      inspectionReference: clean(input.inspectionReference),
      reasonText: clean(input.reasonText),
      receivedQuantity: Number(row.received_quantity),
      issuedQuantity: Number(row.issued_quantity),
      reversedQuantity: Number(row.reversed_quantity),
    };
    const saved = await client.query(
      `INSERT INTO p2_manufactured_output_quality_acceptances
       (output_authority_id,custody_id,disposition,inspection_reference,reason_text,authority_snapshot,authority_checksum,
        request_key,request_hash,accepted_by_user_id,accepted_by_employee_id,accepted_by_display_name,accepted_by_role)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        row.id,
        row.custody_id,
        input.disposition,
        clean(input.inspectionReference),
        clean(input.reasonText),
        JSON.stringify(snapshot),
        digest(snapshot),
        input.idempotencyKey,
        requestHash,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query('COMMIT');
    return { replayed: false, qualityAcceptance: saved.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseP2OutputForShipment(
  workOrderAuthorityId: string,
  outputId: string,
  input: {
    custodyId: string;
    qualityAcceptanceId: string;
    releaseReference: string;
    idempotencyKey: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `p2-shipment-release:${outputId}`,
    ]);
    const requestHash = digest({ workOrderAuthorityId, outputId, ...input });
    const replay = await client.query(
      'SELECT * FROM p2_manufactured_output_shipment_releases WHERE request_key=$1',
      [input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new P2QualityShipmentReleaseError(
          'SHIPMENT_RELEASE_IDEMPOTENCY_CONFLICT',
          'Shipment-release idempotency key conflicts.'
        );
      await client.query('COMMIT');
      return { replayed: true, shipmentRelease: replay.rows[0] };
    }
    const found = await client.query(
      `SELECT o.id output_id,o.status output_status,o.project_id,o.frozen_demand_baseline_id,o.inventory_item_id,o.output_identity,o.assembly_path_identity,
              c.id custody_id,c.custody_status,c.received_quantity,c.issued_quantity,c.reversed_quantity,c.available_quantity,
              q.id quality_id,q.disposition,q.accepted_by_user_id,q.authority_checksum quality_checksum
       FROM p2_manufactured_output_authorities o JOIN p2_manufactured_output_custodies c ON c.output_authority_id=o.id
       JOIN p2_manufactured_output_quality_acceptances q ON q.output_authority_id=o.id AND q.custody_id=c.id
       WHERE o.id=$1 AND o.work_order_authority_id=$2 AND c.id=$3 AND q.id=$4 FOR UPDATE OF o,c`,
      [
        outputId,
        workOrderAuthorityId,
        input.custodyId,
        input.qualityAcceptanceId,
      ]
    );
    const row = found.rows[0];
    if (!row)
      throw new P2QualityShipmentReleaseError(
        'SHIPMENT_RELEASE_AUTHORITY_NOT_FOUND',
        'Exact accepted output custody was not found.',
        404
      );
    if (
      row.output_status !== 'RELEASED' ||
      row.disposition !== 'ACCEPTED' ||
      row.custody_status !== 'AVAILABLE' ||
      Number(row.issued_quantity) !== 0 ||
      Number(row.reversed_quantity) !== 0 ||
      Number(row.available_quantity) !== Number(row.received_quantity)
    )
      throw new P2QualityShipmentReleaseError(
        'SHIPMENT_RELEASE_BLOCKED',
        'Shipment release requires accepted, unreversed, unissued, fully available custody.'
      );
    if (row.accepted_by_user_id === actor.userId)
      throw new P2QualityShipmentReleaseError(
        'INDEPENDENT_SHIPMENT_RELEASE_REQUIRED',
        'Quality acceptor cannot release shipment eligibility.',
        403
      );
    const snapshot = {
      outputAuthorityId: row.output_id,
      custodyId: row.custody_id,
      qualityAcceptanceId: row.quality_id,
      qualityChecksum: row.quality_checksum,
      inventoryItemId: row.inventory_item_id,
      outputIdentity: row.output_identity,
      projectId: row.project_id,
      baselineId: row.frozen_demand_baseline_id,
      assemblyPathIdentity: row.assembly_path_identity,
      quantity: Number(row.available_quantity),
      releaseReference: clean(input.releaseReference),
      releaseScope: 'SHIPMENT_ELIGIBILITY_ONLY',
    };
    const saved = await client.query(
      `INSERT INTO p2_manufactured_output_shipment_releases
       (output_authority_id,custody_id,quality_acceptance_id,release_scope,release_reference,authority_snapshot,authority_checksum,
        request_key,request_hash,released_by_user_id,released_by_employee_id,released_by_display_name,released_by_role)
       VALUES ($1,$2,$3,'SHIPMENT_ELIGIBILITY_ONLY',$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        row.output_id,
        row.custody_id,
        row.quality_id,
        clean(input.releaseReference),
        JSON.stringify(snapshot),
        digest(snapshot),
        input.idempotencyKey,
        requestHash,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query('COMMIT');
    return { replayed: false, shipmentRelease: saved.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getP2OutputQualityShipmentAuthority(
  workOrderAuthorityId: string,
  outputId: string
) {
  const result = await pool.query(
    `SELECT o.id output_id,q.*,s.id shipment_release_id,s.release_scope,s.release_reference,s.authority_checksum shipment_release_checksum,s.released_at shipment_released_at
     FROM p2_manufactured_output_authorities o LEFT JOIN p2_manufactured_output_quality_acceptances q ON q.output_authority_id=o.id
     LEFT JOIN p2_manufactured_output_shipment_releases s ON s.output_authority_id=o.id
     WHERE o.id=$1 AND o.work_order_authority_id=$2`,
    [outputId, workOrderAuthorityId]
  );
  return result.rows[0] ?? null;
}
