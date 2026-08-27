import { createHash } from 'node:crypto';

import { pool } from '../../db';
import { MaterialIssueService } from './materialIssueService';
import { reverseInventoryLedgerEntry } from './inventoryTransactionLedgerService';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';

type Row = Record<string, unknown>;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();

export class P2MaterialConsumptionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: unknown
  ) {
    super(message);
  }
}

export type P2MaterialConsumptionInput = {
  travelerBarcode: string;
  materialBarcode: string;
  travelerStepId: string;
  quantity: number;
  idempotencyKey: string;
  operatorSessionToken: string;
  materialRequirementId: string;
};

export async function resolveP2MaterialScan(input: {
  travelerBarcode: string;
  materialBarcode: string;
  travelerStepId: string;
}) {
  const result = await pool.query(
    `SELECT mr.id material_requirement_id,mr.assembly_path_identity,
       mr.part_number_snapshot,mr.required_quantity,mr.issued_quantity,
       dn.unit_of_measure
     FROM p2_traveler_provisioning_authorities tp
     JOIN p2_manufacturing_work_order_authorities wo ON wo.id=tp.work_order_authority_id
     JOIN traveler_steps ts ON ts.traveler_id=tp.traveler_id AND ts.id=$3
     JOIN p2_manufacturing_work_order_operations op
       ON op.authority_id=wo.id AND op.operation_sequence=ts.step_number
     JOIN p2_manufacturing_work_order_material_requirements mr ON mr.successor_authority_id=wo.id
     JOIN p2_frozen_production_demand_nodes dn ON dn.id=mr.frozen_demand_node_id
     JOIN p2_receiving_barcode_identities bi ON lower(bi.barcode_value)=lower($2)
     JOIN received_units ru ON ru.id=bi.received_unit_id
     JOIN material_lots ml ON ml.id=ru.material_lot_id
     WHERE lower(tp.barcode_value)=lower($1)
       AND tp.status='ACTIVE'
       AND mr.inventory_item_id=bi.inventory_item_id
       AND mr.status <> 'CANCELLED'
     ORDER BY mr.assembly_path_identity`,
    [input.travelerBarcode, input.materialBarcode, input.travelerStepId]
  );
  return {
    candidates: result.rows.map((row) => ({
      materialRequirementId: row.material_requirement_id,
      assemblyPathIdentity: row.assembly_path_identity,
      partNumber: row.part_number_snapshot,
      requiredQuantity: Number(row.required_quantity),
      issuedQuantity: Number(row.issued_quantity),
      outstandingQuantity:
        Number(row.required_quantity) - Number(row.issued_quantity),
      unitOfMeasure: row.unit_of_measure,
    })),
  };
}

function eventResponse(row: Row, replayed: boolean) {
  return { replayed, event: row };
}

export async function consumeP2ScannedMaterial(
  input: P2MaterialConsumptionInput,
  actor: P2WorkOrderActor
) {
  if (!actor.employeeId)
    throw new P2MaterialConsumptionError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );

  const requestHash = hash({
    travelerBarcode: input.travelerBarcode,
    materialBarcode: input.materialBarcode,
    travelerStepId: input.travelerStepId,
    quantity: input.quantity,
    idempotencyKey: input.idempotencyKey,
    materialRequirementId: input.materialRequirementId,
  });
  const existing = await pool.query(
    `SELECT * FROM p2_material_consumption_events
      WHERE event_type='CONSUMED' AND request_key=$1`,
    [input.idempotencyKey]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].request_hash !== requestHash)
      throw new P2MaterialConsumptionError(
        'MATERIAL_CONSUMPTION_IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with different material authority.'
      );
    return eventResponse(existing.rows[0], true);
  }

  const source = await pool.query(
    `SELECT
       wo.id work_order_authority_id,wo.project_id,wo.production_work_order_id,
       wo.status work_order_status,wo.current_operation_sequence,
       tp.id traveler_provisioning_authority_id,tp.traveler_id,tp.status traveler_authority_status,
       op.id work_order_operation_id,op.operation_sequence,op.status operation_status,
       ts.id traveler_step_id,ts.status traveler_step_status,
       mr.id material_requirement_id,mr.frozen_demand_node_id,mr.inventory_item_id,
       mr.assembly_path_identity,mr.part_number_snapshot,mr.required_quantity,mr.issued_quantity,
       dn.unit_of_measure,dn.traceability_policy_id,dn.traceability_snapshot,dn.bom_snapshot,
       bi.id receiving_barcode_identity_id,bi.received_unit_id,bi.inventory_item_id received_inventory_item_id,
       bi.traceability_policy_id received_traceability_policy_id,bi.authority_snapshot receiving_snapshot,
       ru.material_lot_id,ru.quantity received_quantity,ru.disposition,ru.target_project_id,
       ml.remaining_qty lot_remaining_quantity,ml.status lot_status,ml.expiration_date,
       ml.internal_control_number,ml.storage_location
     FROM p2_traveler_provisioning_authorities tp
     JOIN p2_manufacturing_work_order_authorities wo ON wo.id=tp.work_order_authority_id
     JOIN traveler_steps ts ON ts.traveler_id=tp.traveler_id AND ts.id=$3
     JOIN p2_manufacturing_work_order_operations op
       ON op.authority_id=wo.id AND op.operation_sequence=ts.step_number
     JOIN p2_manufacturing_work_order_material_requirements mr ON mr.successor_authority_id=wo.id
     JOIN p2_frozen_production_demand_nodes dn ON dn.id=mr.frozen_demand_node_id
     JOIN p2_receiving_barcode_identities bi ON lower(bi.barcode_value)=lower($2)
     JOIN received_units ru ON ru.id=bi.received_unit_id
     JOIN material_lots ml ON ml.id=ru.material_lot_id
     WHERE lower(tp.barcode_value)=lower($1)
       AND mr.inventory_item_id=bi.inventory_item_id
       AND mr.id=$4`,
    [
      input.travelerBarcode,
      input.materialBarcode,
      input.travelerStepId,
      input.materialRequirementId,
    ]
  );
  if (source.rows.length !== 1)
    throw new P2MaterialConsumptionError(
      'MATERIAL_AUTHORITY_MISMATCH',
      'The scanned traveler, operation, released BOM demand, and Receiving identity did not resolve to one exact material authority.',
      422
    );
  const row = source.rows[0];
  const blockers: string[] = [];
  if (row.traveler_authority_status !== 'ACTIVE')
    blockers.push('traveler authority is not active');
  if (!['READY', 'IN_PROGRESS'].includes(clean(row.work_order_status)))
    blockers.push('work order is not ready or in progress');
  if (Number(row.operation_sequence) !== Number(row.current_operation_sequence))
    blockers.push(
      'traveler step is not the current released routing operation'
    );
  if (!['READY', 'IN_PROGRESS'].includes(clean(row.operation_status)))
    blockers.push('routing operation is not active');
  if (!['NOT_STARTED', 'IN_PROGRESS'].includes(clean(row.traveler_step_status)))
    blockers.push('traveler step is closed');
  if (Number(row.received_inventory_item_id) !== Number(row.inventory_item_id))
    blockers.push('Inventory Item identity does not match released BOM demand');
  if (
    clean(row.received_traceability_policy_id) !==
    clean(row.traceability_policy_id)
  )
    blockers.push(
      'Receiving identity does not match the frozen traceability policy'
    );
  if (row.disposition !== 'accepted')
    blockers.push('received unit is not accepted');
  if (
    row.target_project_id &&
    clean(row.target_project_id) !== clean(row.project_id)
  )
    blockers.push('received unit is restricted to another project');
  if (!row.material_lot_id)
    blockers.push('received unit has no accepted material lot');
  if (!['ACCEPTED', 'ISSUED'].includes(clean(row.lot_status)))
    blockers.push(
      `material lot status is ${clean(row.lot_status) || 'unknown'}`
    );
  if (row.expiration_date && new Date(String(row.expiration_date)) < new Date())
    blockers.push('material lot is expired');
  const outstanding =
    Number(row.required_quantity) - Number(row.issued_quantity);
  if (input.quantity > outstanding)
    blockers.push(
      `quantity exceeds remaining released demand (${outstanding})`
    );
  if (input.quantity > Number(row.received_quantity))
    blockers.push('quantity exceeds received-unit custody quantity');
  if (input.quantity > Number(row.lot_remaining_quantity))
    blockers.push('quantity exceeds material-lot quantity');
  if (blockers.length)
    throw new P2MaterialConsumptionError(
      'MATERIAL_CONSUMPTION_BLOCKED',
      'The material scan failed closed.',
      422,
      blockers
    );

  const priorLedger = await pool.query(
    `SELECT * FROM inventory_transaction_ledger
      WHERE metadata->>'p2MaterialConsumptionRequestKey'=$1`,
    [input.idempotencyKey]
  );
  let ledger = priorLedger.rows[0] as Row | undefined;
  const verifyLedgerReplay = (entry: Row | undefined) => {
    const metadata =
      entry?.metadata && typeof entry.metadata === 'object'
        ? (entry.metadata as Row)
        : {};
    if (
      entry &&
      clean(metadata.p2MaterialConsumptionRequestHash) !== requestHash
    )
      throw new P2MaterialConsumptionError(
        'MATERIAL_CONSUMPTION_IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with different material authority.'
      );
  };
  verifyLedgerReplay(ledger);
  if (!ledger) {
    try {
      const result = await MaterialIssueService.consume({
        materialLotId: clean(row.material_lot_id),
        quantity: input.quantity,
        travelerId: clean(row.traveler_id),
        travelerStepId: clean(row.traveler_step_id),
        productionWorkOrderId: clean(row.production_work_order_id),
        operator: { userId: actor.employeeId, displayName: actor.displayName },
        operatorAuth: { sessionToken: input.operatorSessionToken },
        reasonCode: 'P2_CONTROLLED_MATERIAL_CONSUMPTION',
        notes: `P2 scan consumption for ${clean(row.assembly_path_identity)}`,
        p2MaterialConsumptionRequestKey: input.idempotencyKey,
        p2MaterialConsumptionRequestHash: requestHash,
        p2ReceivedUnitId: Number(row.received_unit_id),
        p2MaterialRequirementId: input.materialRequirementId,
      });
      if (!result.ok)
        throw new P2MaterialConsumptionError(
          'MATERIAL_ISSUE_BLOCKED',
          'The authoritative material-issue service rejected the scan.',
          422,
          result.blockers
        );
      const savedLedger = await pool.query(
        `SELECT * FROM inventory_transaction_ledger WHERE id=$1`,
        [result.ledgerEntryId]
      );
      ledger = savedLedger.rows[0];
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? clean((error as Row).code)
          : '';
      if (code !== '23505') throw error;
      ledger = (
        await pool.query(
          `SELECT * FROM inventory_transaction_ledger
           WHERE metadata->>'p2MaterialConsumptionRequestKey'=$1`,
          [input.idempotencyKey]
        )
      ).rows[0];
    }
    verifyLedgerReplay(ledger);
  }
  if (!ledger)
    throw new P2MaterialConsumptionError(
      'MATERIAL_LEDGER_EVIDENCE_MISSING',
      'Consumption did not produce authoritative inventory-ledger evidence.',
      500
    );

  const snapshot = {
    workOrderAuthorityId: row.work_order_authority_id,
    travelerProvisioningAuthorityId: row.traveler_provisioning_authority_id,
    travelerId: row.traveler_id,
    travelerStepId: row.traveler_step_id,
    workOrderOperationId: row.work_order_operation_id,
    materialRequirementId: row.material_requirement_id,
    frozenDemandNodeId: row.frozen_demand_node_id,
    inventoryItemId: row.inventory_item_id,
    assemblyPathIdentity: row.assembly_path_identity,
    partNumber: row.part_number_snapshot,
    quantity: input.quantity,
    unitOfMeasure: row.unit_of_measure,
    bomSnapshot: row.bom_snapshot,
    traceabilitySnapshot: row.traceability_snapshot,
    receivingIdentitySnapshot: row.receiving_snapshot,
    inventoryLedgerEntryId: ledger.id,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-material-consumption:${row.work_order_authority_id}:${input.idempotencyKey}`,
    ]);
    const replay = await client.query(
      `SELECT * FROM p2_material_consumption_events WHERE work_order_authority_id=$1 AND request_key=$2`,
      [row.work_order_authority_id, input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new P2MaterialConsumptionError(
          'MATERIAL_CONSUMPTION_IDEMPOTENCY_CONFLICT',
          'This idempotency key was used with different material authority.'
        );
      await client.query('COMMIT');
      return eventResponse(replay.rows[0], true);
    }
    const saved = await client.query(
      `INSERT INTO p2_material_consumption_events
       (event_type,work_order_authority_id,traveler_provisioning_authority_id,traveler_id,traveler_step_id,work_order_operation_id,material_requirement_id,frozen_demand_node_id,inventory_item_id,assembly_path_identity,material_lot_id,received_unit_id,receiving_barcode_identity_id,traceability_policy_id,inventory_ledger_entry_id,quantity,unit_of_measure,request_key,request_hash,authority_snapshot,authority_checksum,actor_user_id,actor_employee_id,actor_display_name,actor_role)
       VALUES ('CONSUMED',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24) RETURNING *`,
      [
        row.work_order_authority_id,
        row.traveler_provisioning_authority_id,
        row.traveler_id,
        row.traveler_step_id,
        row.work_order_operation_id,
        row.material_requirement_id,
        row.frozen_demand_node_id,
        row.inventory_item_id,
        row.assembly_path_identity,
        row.material_lot_id,
        row.received_unit_id,
        row.receiving_barcode_identity_id,
        row.traceability_policy_id,
        ledger.id,
        input.quantity,
        row.unit_of_measure,
        input.idempotencyKey,
        requestHash,
        JSON.stringify(snapshot),
        hash(snapshot),
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query('COMMIT');
    return eventResponse(saved.rows[0], false);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reverseP2MaterialConsumption(
  eventId: string,
  input: { reasonCode: string; reasonText: string; idempotencyKey: string },
  actor: P2WorkOrderActor
) {
  if (!actor.employeeId)
    throw new P2MaterialConsumptionError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  const requestHash = hash({ eventId, ...input });
  const replay = await pool.query(
    `SELECT * FROM p2_material_consumption_events WHERE request_key=$1`,
    [input.idempotencyKey]
  );
  if (replay.rows[0]) {
    if (replay.rows[0].request_hash !== requestHash)
      throw new P2MaterialConsumptionError(
        'MATERIAL_REVERSAL_IDEMPOTENCY_CONFLICT',
        'This idempotency key was used with different reversal evidence.'
      );
    return eventResponse(replay.rows[0], true);
  }
  const source = await pool.query(
    `SELECT e.*,l.transaction_number
     FROM p2_material_consumption_events e
     JOIN inventory_transaction_ledger l ON l.id=e.inventory_ledger_entry_id
     WHERE e.id=$1 AND e.event_type='CONSUMED'`,
    [eventId]
  );
  const original = source.rows[0];
  if (!original)
    throw new P2MaterialConsumptionError(
      'MATERIAL_CONSUMPTION_NOT_FOUND',
      'The original controlled consumption event was not found.',
      404
    );
  const alreadyReversed = await pool.query(
    `SELECT * FROM p2_material_consumption_events WHERE original_event_id=$1 AND event_type='REVERSED'`,
    [eventId]
  );
  if (alreadyReversed.rows[0])
    throw new P2MaterialConsumptionError(
      'MATERIAL_CONSUMPTION_ALREADY_REVERSED',
      'The controlled consumption event was already reversed.'
    );
  let reversalLedger = (
    await pool.query(
      `SELECT * FROM inventory_transaction_ledger WHERE reversed_transaction_id=$1`,
      [original.inventory_ledger_entry_id]
    )
  ).rows[0];
  if (!reversalLedger) {
    reversalLedger = await reverseInventoryLedgerEntry({
      transactionId: original.inventory_ledger_entry_id,
      performedByDisplayName: actor.displayName,
      reasonCode: input.reasonCode,
      notes: input.reasonText,
      approvedByUserId: actor.userId,
      approvedByDisplayName: actor.displayName,
      restoreMaterialCustody: {
        materialLotId: original.material_lot_id,
        receivedUnitId: Number(original.received_unit_id),
        quantity: Number(original.quantity),
        materialRequirementId: original.material_requirement_id,
      },
    });
  }
  const snapshot = {
    originalEventId: eventId,
    originalLedgerEntryId: original.inventory_ledger_entry_id,
    originalTransactionNumber: original.transaction_number,
    reversalLedgerEntryId: reversalLedger.id,
    reasonCode: input.reasonCode,
    reasonText: input.reasonText,
    originalAuthorityChecksum: original.authority_checksum,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-material-reversal:${eventId}`,
    ]);
    const saved = await client.query(
      `INSERT INTO p2_material_consumption_events
       (event_type,original_event_id,work_order_authority_id,traveler_provisioning_authority_id,traveler_id,traveler_step_id,work_order_operation_id,material_requirement_id,frozen_demand_node_id,inventory_item_id,assembly_path_identity,material_lot_id,received_unit_id,receiving_barcode_identity_id,traceability_policy_id,inventory_ledger_entry_id,quantity,unit_of_measure,request_key,request_hash,reason_code,reason_text,authority_snapshot,authority_checksum,actor_user_id,actor_employee_id,actor_display_name,actor_role)
       VALUES ('REVERSED',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26,$27) RETURNING *`,
      [
        eventId,
        original.work_order_authority_id,
        original.traveler_provisioning_authority_id,
        original.traveler_id,
        original.traveler_step_id,
        original.work_order_operation_id,
        original.material_requirement_id,
        original.frozen_demand_node_id,
        original.inventory_item_id,
        original.assembly_path_identity,
        original.material_lot_id,
        original.received_unit_id,
        original.receiving_barcode_identity_id,
        original.traceability_policy_id,
        reversalLedger.id,
        original.quantity,
        original.unit_of_measure,
        input.idempotencyKey,
        requestHash,
        input.reasonCode,
        input.reasonText,
        JSON.stringify(snapshot),
        hash(snapshot),
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query('COMMIT');
    return eventResponse(saved.rows[0], false);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
