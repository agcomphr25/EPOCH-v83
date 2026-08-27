import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { pool } from '../../db';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';

type Row = Record<string, unknown>;
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();

export class P2ManufacturedOutputCustodyError extends Error {
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
    throw new P2ManufacturedOutputCustodyError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  return actor.employeeId;
};

const policyType = (snapshot: unknown) => {
  const value =
    snapshot && typeof snapshot === 'object' ? (snapshot as Row) : {};
  const type = clean(
    value.policy_type ?? value.policyType ?? value.type
  ).toUpperCase();
  if (
    ![
      'SERIAL',
      'LOT',
      'BATCH',
      'STANDARD_QUANTITY',
      'CUSTOMER_SUPPLIED',
      'NONE_APPROVED',
    ].includes(type)
  )
    throw new P2ManufacturedOutputCustodyError(
      'OUTPUT_TRACEABILITY_UNRESOLVED',
      'A released traceability policy is required for manufactured custody.',
      422
    );
  return type;
};

const insertLedger = async (client: PoolClient, input: Row) => {
  const id = randomUUID();
  const eventHash = digest({ id, ...input });
  const saved = await client.query(
    `INSERT INTO inventory_transaction_ledger
      (id,transaction_type,inventory_item_id,ag_part_number,location_id,quantity_delta,quantity_before,
       quantity_after,unit_of_measure,status_before,status_after,performed_by_user_id,
       performed_by_display_name,approved_by_user_id,approved_by_display_name,project_id,
       production_work_order_id,traveler_id,reason_code,notes,source_module,source_record_id,
       event_hash,reversed_transaction_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb)
     RETURNING *`,
    [
      id,
      input.transactionType,
      input.inventoryItemId,
      input.agPartNumber,
      input.locationId,
      input.quantityDelta,
      input.quantityBefore,
      input.quantityAfter,
      input.unitOfMeasure,
      input.statusBefore,
      input.statusAfter,
      input.userId,
      input.displayName,
      input.approvedByUserId,
      input.approvedByDisplayName,
      input.projectId,
      input.productionWorkOrderId,
      input.travelerId,
      input.reasonCode,
      input.notes,
      'p2-manufactured-output-custody',
      input.sourceRecordId,
      eventHash,
      input.reversedTransactionId,
      JSON.stringify(input.metadata),
    ]
  );
  return saved.rows[0];
};

/** Called only inside the Phase 10 release transaction after the output row is released. */
export async function receiveP2ManufacturedOutputCustodyInTransaction(
  client: PoolClient,
  outputId: string,
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `p2-output-custody:${outputId}`,
  ]);
  const found = await client.query(
    `SELECT o.*,wo.production_work_order_id,wo.traveler_id,dn.unit_of_measure,i.ag_part_number
     FROM p2_manufactured_output_authorities o
     JOIN p2_manufacturing_work_order_authorities wo ON wo.id=o.work_order_authority_id
     JOIN p2_frozen_production_demand_nodes dn ON dn.id=o.frozen_demand_node_id
     JOIN inventory_items i ON i.id=o.inventory_item_id
     WHERE o.id=$1 FOR UPDATE OF o`,
    [outputId]
  );
  if (found.rows.length !== 1)
    throw new P2ManufacturedOutputCustodyError(
      'OUTPUT_NOT_FOUND',
      'The manufactured output was not found.',
      404
    );
  const output = found.rows[0];
  if (output.status !== 'RELEASED' || !output.released_at)
    throw new P2ManufacturedOutputCustodyError(
      'RELEASED_OUTPUT_REQUIRED',
      'Custody receipt requires a validly released manufactured output.'
    );
  const quantity = Number(output.output_quantity);
  const unit = clean(output.unit_of_measure);
  const identity = clean(output.output_identity);
  if (
    !(quantity > 0) ||
    !unit ||
    !identity ||
    !output.inventory_item_id ||
    !output.production_work_order_id
  )
    throw new P2ManufacturedOutputCustodyError(
      'OUTPUT_CUSTODY_AUTHORITY_INVALID',
      'Output identity, quantity, unit, Inventory Item, and work-order authority are required.',
      422
    );
  const traceabilityMode = policyType(output.traceability_snapshot);
  if (traceabilityMode === 'SERIAL' && quantity !== 1)
    throw new P2ManufacturedOutputCustodyError(
      'SERIAL_OUTPUT_QUANTITY_INVALID',
      'Serial-controlled output custody must have quantity one.',
      422
    );
  const requestKey = `p2-output-receipt:${output.id}`;
  const snapshot = {
    outputAuthorityId: output.id,
    workOrderAuthorityId: output.work_order_authority_id,
    projectId: output.project_id,
    baselineId: output.frozen_demand_baseline_id,
    frozenDemandNodeId: output.frozen_demand_node_id,
    inventoryItemId: output.inventory_item_id,
    outputIdentity: identity,
    traceabilityMode,
    quantity,
    unit,
    locationId: 'P2-MANUFACTURED-CUSTODY',
    productionWorkOrderId: output.production_work_order_id,
    travelerId: output.traveler_id,
  };
  const requestHash = digest(snapshot);
  const replay = await client.query(
    'SELECT * FROM p2_manufactured_output_custodies WHERE output_authority_id=$1',
    [output.id]
  );
  if (replay.rows[0]) {
    if (replay.rows[0].receipt_request_hash !== requestHash)
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_RECEIPT_CONFLICT',
        'Existing custody conflicts with released output authority.'
      );
    const ledger = await client.query(
      'SELECT * FROM inventory_transaction_ledger WHERE id=$1',
      [replay.rows[0].receipt_ledger_entry_id]
    );
    if (!ledger.rows[0] || Number(ledger.rows[0].quantity_delta) !== quantity)
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_LEDGER_CUSTODY_DISAGREEMENT',
        'Receipt ledger and custody state disagree.',
        500
      );
    return { replayed: true, custody: replay.rows[0] };
  }
  const ledger = await insertLedger(client, {
    transactionType: 'RECEIVE',
    inventoryItemId: output.inventory_item_id,
    agPartNumber: output.ag_part_number,
    locationId: 'P2-MANUFACTURED-CUSTODY',
    quantityDelta: quantity,
    quantityBefore: 0,
    quantityAfter: quantity,
    unitOfMeasure: unit,
    statusBefore: null,
    statusAfter: 'AVAILABLE',
    userId: actor.userId,
    displayName: actor.displayName,
    approvedByUserId: actor.userId,
    approvedByDisplayName: actor.displayName,
    projectId: output.project_id,
    productionWorkOrderId: output.production_work_order_id,
    travelerId: output.traveler_id,
    reasonCode: 'P2_MANUFACTURED_OUTPUT_RELEASE',
    notes: `Controlled receipt for ${identity}`,
    sourceRecordId: output.id,
    reversedTransactionId: null,
    metadata: {
      p2ManufacturedOutputReceiptKey: requestKey,
      p2ManufacturedOutputReceiptHash: requestHash,
      ...snapshot,
    },
  });
  const saved = await client.query(
    `INSERT INTO p2_manufactured_output_custodies
      (output_authority_id,inventory_item_id,output_identity,traceability_mode,unit_of_measure,location_id,
       received_quantity,receipt_ledger_entry_id,receipt_request_key,receipt_request_hash,authority_snapshot,
       authority_checksum,created_by_user_id,created_by_employee_id,created_by_display_name,created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16) RETURNING *`,
    [
      output.id,
      output.inventory_item_id,
      identity,
      traceabilityMode,
      unit,
      'P2-MANUFACTURED-CUSTODY',
      quantity,
      ledger.id,
      requestKey,
      requestHash,
      JSON.stringify(snapshot),
      digest(snapshot),
      actor.userId,
      employeeId,
      actor.displayName,
      actor.role,
    ]
  );
  return { replayed: false, custody: saved.rows[0] };
}

export async function reverseP2ManufacturedOutputCustody(
  authorityId: string,
  outputId: string,
  custodyId: string,
  input: {
    quantity: number;
    reasonCode: string;
    reasonText: string;
    idempotencyKey: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-output-custody-reversal:${custodyId}`,
    ]);
    const prior = await client.query(
      'SELECT * FROM p2_manufactured_output_custody_reversals WHERE request_key=$1',
      [input.idempotencyKey]
    );
    const requestHash = digest({ authorityId, outputId, custodyId, ...input });
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== requestHash)
        throw new P2ManufacturedOutputCustodyError(
          'OUTPUT_REVERSAL_IDEMPOTENCY_CONFLICT',
          'This reversal key was used with different authority.'
        );
      await client.query('COMMIT');
      return { replayed: true, reversal: prior.rows[0] };
    }
    const found = await client.query(
      `SELECT c.*,l.ag_part_number,l.project_id,l.production_work_order_id,l.traveler_id
       FROM p2_manufactured_output_custodies c
       JOIN p2_manufactured_output_authorities o ON o.id=c.output_authority_id
       JOIN inventory_transaction_ledger l ON l.id=c.receipt_ledger_entry_id
       WHERE c.id=$1 AND c.output_authority_id=$2 AND o.work_order_authority_id=$3 FOR UPDATE OF c`,
      [custodyId, outputId, authorityId]
    );
    if (!found.rows[0])
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_CUSTODY_NOT_FOUND',
        'Manufactured custody was not found.',
        404
      );
    const custody = found.rows[0];
    const quantity = Number(input.quantity);
    if (!(quantity > 0) || quantity > Number(custody.available_quantity))
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_REVERSAL_QUANTITY_INVALID',
        'Reversal cannot exceed unissued available custody.',
        422
      );
    if (Number(custody.issued_quantity) > 0)
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_CUSTODY_ALREADY_ISSUED',
        'Issued manufactured custody must be validly reversed downstream first.'
      );
    const available = Number(custody.available_quantity);
    const ledgerState = await client.query(
      `SELECT COALESCE(SUM(quantity_delta),0) quantity
       FROM inventory_transaction_ledger
       WHERE id=$1 OR reversed_transaction_id=$1`,
      [custody.receipt_ledger_entry_id]
    );
    if (Number(ledgerState.rows[0].quantity) !== available)
      throw new P2ManufacturedOutputCustodyError(
        'OUTPUT_LEDGER_CUSTODY_DISAGREEMENT',
        'Receipt ledger and custody state disagree.',
        500
      );
    const reversal = await insertLedger(client, {
      transactionType: 'REVERSAL',
      inventoryItemId: custody.inventory_item_id,
      agPartNumber: custody.ag_part_number,
      locationId: custody.location_id,
      quantityDelta: -quantity,
      quantityBefore: available,
      quantityAfter: available - quantity,
      unitOfMeasure: custody.unit_of_measure,
      statusBefore: custody.custody_status,
      statusAfter: available - quantity === 0 ? 'REVERSED' : 'AVAILABLE',
      userId: actor.userId,
      displayName: actor.displayName,
      approvedByUserId: actor.userId,
      approvedByDisplayName: actor.displayName,
      projectId: custody.project_id,
      productionWorkOrderId: custody.production_work_order_id,
      travelerId: custody.traveler_id,
      reasonCode: input.reasonCode,
      notes: input.reasonText,
      sourceRecordId: custody.id,
      reversedTransactionId: custody.receipt_ledger_entry_id,
      metadata: {
        p2ManufacturedOutputReversalKey: input.idempotencyKey,
        p2ManufacturedOutputReversalHash: requestHash,
      },
    });
    const snapshot = {
      custodyId,
      receiptLedgerEntryId: custody.receipt_ledger_entry_id,
      reversalLedgerEntryId: reversal.id,
      quantity,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
    };
    const saved = await client.query(
      `INSERT INTO p2_manufactured_output_custody_reversals
      (custody_id,receipt_ledger_entry_id,reversal_ledger_entry_id,quantity,reason_code,reason_text,request_key,
       request_hash,actor_user_id,actor_employee_id,actor_display_name,actor_role,authority_snapshot,authority_checksum)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,
      [
        custody.id,
        custody.receipt_ledger_entry_id,
        reversal.id,
        quantity,
        input.reasonCode,
        input.reasonText,
        input.idempotencyKey,
        requestHash,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify(snapshot),
        digest(snapshot),
      ]
    );
    await client.query(
      `UPDATE p2_manufactured_output_custodies SET reversed_quantity=reversed_quantity+$2,
      custody_status=CASE WHEN available_quantity-$2=0 THEN 'REVERSED' ELSE 'AVAILABLE' END,
      concurrency_version=concurrency_version+1 WHERE id=$1`,
      [custody.id, quantity]
    );
    await client.query('COMMIT');
    return { replayed: false, reversal: saved.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getP2ManufacturedOutputCustody(
  authorityId: string,
  outputId: string
) {
  const result = await pool.query(
    `SELECT c.* FROM p2_manufactured_output_custodies c
     JOIN p2_manufactured_output_authorities o ON o.id=c.output_authority_id
     WHERE c.output_authority_id=$1 AND o.work_order_authority_id=$2`,
    [outputId, authorityId]
  );
  return result.rows[0] ?? null;
}
