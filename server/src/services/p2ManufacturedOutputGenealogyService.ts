import { createHash } from 'node:crypto';

import { pool } from '../../db';
import { areP2ManufacturedOutputCustodyWritesEnabled } from '../lib/featureFlags';
import { receiveP2ManufacturedOutputCustodyInTransaction } from './p2ManufacturedOutputCustodyService';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class P2ManufacturedOutputError extends Error {
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
    throw new P2ManufacturedOutputError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  return actor.employeeId;
};

export async function createP2ManufacturedOutput(
  authorityId: string,
  input: {
    outputIdentity: string;
    outputQuantity: number;
    idempotencyKey: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const requestHash = digest({ authorityId, ...input });
  const existing = await pool.query(
    'SELECT * FROM p2_manufactured_output_authorities WHERE request_key=$1',
    [input.idempotencyKey]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].request_hash !== requestHash)
      throw new P2ManufacturedOutputError(
        'OUTPUT_IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with different output authority.'
      );
    return { replayed: true, output: existing.rows[0] };
  }
  const source = await pool.query(
    `SELECT * FROM p2_manufacturing_work_order_authorities WHERE id=$1`,
    [authorityId]
  );
  if (source.rows.length !== 1)
    throw new P2ManufacturedOutputError(
      'P2_WORK_ORDER_NOT_FOUND',
      'The P2 work order was not found.',
      404
    );
  const row = source.rows[0];
  if (row.status !== 'COMPLETE')
    throw new P2ManufacturedOutputError(
      'COMPLETED_OUTPUT_REQUIRED',
      'Manufactured output can be recorded only after controlled work completion.'
    );
  if (
    !(input.outputQuantity > 0) ||
    input.outputQuantity > Number(row.completed_quantity)
  )
    throw new P2ManufacturedOutputError(
      'INVALID_OUTPUT_QUANTITY',
      'Output quantity must be positive and cannot exceed completed quantity.',
      400
    );
  const snapshot = {
    workOrderAuthorityId: row.id,
    frozenDemandBaselineId: row.frozen_demand_baseline_id,
    frozenDemandNodeId: row.frozen_demand_node_id,
    inventoryItemId: row.inventory_item_id,
    assemblyPathIdentity: row.assembly_path_identity,
    partNumber: row.part_number_snapshot,
    traceability: row.traceability_snapshot,
    outputIdentity: input.outputIdentity.trim(),
    outputQuantity: input.outputQuantity,
  };
  const inserted = await pool.query(
    `INSERT INTO p2_manufactured_output_authorities
      (work_order_authority_id,project_id,frozen_demand_baseline_id,frozen_demand_node_id,
       inventory_item_id,assembly_path_identity,part_number_snapshot,traceability_snapshot,
       output_identity,output_quantity,authority_snapshot,authority_checksum,request_key,request_hash,
       created_by_user_id,created_by_employee_id,created_by_display_name,created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      row.id,
      row.project_id,
      row.frozen_demand_baseline_id,
      row.frozen_demand_node_id,
      row.inventory_item_id,
      row.assembly_path_identity,
      row.part_number_snapshot,
      row.traceability_snapshot,
      input.outputIdentity.trim(),
      input.outputQuantity,
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
  return { replayed: false, output: inserted.rows[0] };
}

export async function releaseP2ManufacturedOutput(
  outputId: string,
  expectedConcurrencyVersion: number,
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT * FROM p2_manufactured_output_authorities WHERE id=$1 FOR UPDATE',
      [outputId]
    );
    if (found.rows.length !== 1)
      throw new P2ManufacturedOutputError(
        'OUTPUT_NOT_FOUND',
        'The manufactured output was not found.',
        404
      );
    const output = found.rows[0];
    if (output.status === 'RELEASED') {
      if (areP2ManufacturedOutputCustodyWritesEnabled())
        await receiveP2ManufacturedOutputCustodyInTransaction(
          client,
          output.id,
          actor
        );
      await client.query('COMMIT');
      return output;
    }
    if (Number(output.concurrency_version) !== expectedConcurrencyVersion)
      throw new P2ManufacturedOutputError(
        'STALE_OUTPUT',
        'The output changed. Refresh before release.'
      );
    if (Number(output.created_by_employee_id) === Number(employeeId))
      throw new P2ManufacturedOutputError(
        'INDEPENDENT_RELEASE_REQUIRED',
        'The output creator cannot independently release it.',
        403
      );
    const edges = await client.query(
      `SELECT e.*,mr.assembly_path_identity FROM p2_material_consumption_events e
       JOIN p2_manufacturing_work_order_material_requirements mr ON mr.id=e.material_requirement_id
       WHERE e.work_order_authority_id=$1 AND e.event_type='CONSUMED'
         AND NOT EXISTS (SELECT 1 FROM p2_material_consumption_events r WHERE r.original_event_id=e.id AND r.event_type='REVERSED')`,
      [output.work_order_authority_id]
    );
    if (!edges.rows.length)
      throw new P2ManufacturedOutputError(
        'MATERIAL_GENEALOGY_REQUIRED',
        'Released output requires unreversed controlled material-consumption evidence.'
      );
    for (const edge of edges.rows) {
      const snapshot = {
        consumptionEventId: edge.id,
        materialRequirementId: edge.material_requirement_id,
        inventoryItemId: edge.inventory_item_id,
        receivedUnitId: edge.received_unit_id,
        materialLotId: edge.material_lot_id,
        quantity: Number(edge.quantity),
        assemblyPathIdentity: edge.assembly_path_identity,
      };
      await client.query(
        `INSERT INTO p2_material_genealogy_edges
          (output_authority_id,consumption_event_id,material_requirement_id,inventory_item_id,received_unit_id,
           material_lot_id,consumed_quantity,assembly_path_identity,edge_snapshot,edge_checksum)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) ON CONFLICT DO NOTHING`,
        [
          output.id,
          edge.id,
          edge.material_requirement_id,
          edge.inventory_item_id,
          edge.received_unit_id,
          edge.material_lot_id,
          edge.quantity,
          edge.assembly_path_identity,
          JSON.stringify(snapshot),
          digest(snapshot),
        ]
      );
    }
    const released = await client.query(
      `UPDATE p2_manufactured_output_authorities SET status='RELEASED',concurrency_version=concurrency_version+1,
       validated_at=now(),released_by_user_id=$2,released_by_employee_id=$3,released_by_display_name=$4,
       released_by_role=$5,released_at=now() WHERE id=$1 RETURNING *`,
      [outputId, actor.userId, employeeId, actor.displayName, actor.role]
    );
    if (areP2ManufacturedOutputCustodyWritesEnabled())
      await receiveP2ManufacturedOutputCustodyInTransaction(
        client,
        output.id,
        actor
      );
    await client.query('COMMIT');
    return released.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getP2ManufacturedOutputGenealogy(authorityId: string) {
  const outputs = await pool.query(
    'SELECT * FROM p2_manufactured_output_authorities WHERE work_order_authority_id=$1 ORDER BY created_at',
    [authorityId]
  );
  const edges = await pool.query(
    `SELECT g.* FROM p2_material_genealogy_edges g JOIN p2_manufactured_output_authorities o ON o.id=g.output_authority_id WHERE o.work_order_authority_id=$1 ORDER BY g.created_at`,
    [authorityId]
  );
  return { outputs: outputs.rows, edges: edges.rows };
}
