import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { pool } from '../../db';
import type { P2WorkOrderActor } from './p2ManufacturingWorkOrderService';

type Row = Record<string, unknown>;
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();

export class P2ManufacturedComponentIssueError extends Error {
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
    throw new P2ManufacturedComponentIssueError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  return actor.employeeId;
};

const insertLedger = async (client: PoolClient, input: Row) => {
  const id = randomUUID();
  const eventHash = digest({ id, ...input });
  const result = await client.query(
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
      input.userId,
      input.displayName,
      input.projectId,
      input.productionWorkOrderId,
      input.travelerId,
      input.reasonCode,
      input.notes,
      'p2-manufactured-component-issue',
      input.sourceRecordId,
      eventHash,
      input.reversedTransactionId,
      JSON.stringify(input.metadata),
    ]
  );
  return result.rows[0];
};

export async function issueP2ManufacturedComponent(
  parentAuthorityId: string,
  input: {
    custodyId: string;
    materialRequirementId: string;
    quantity: number;
    idempotencyKey: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-component-issue:${input.custodyId}:${input.materialRequirementId}`,
    ]);
    const requestHash = digest({ parentAuthorityId, ...input });
    const prior = await client.query(
      'SELECT * FROM p2_manufactured_component_issues WHERE request_key=$1',
      [input.idempotencyKey]
    );
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== requestHash)
        throw new P2ManufacturedComponentIssueError(
          'COMPONENT_ISSUE_IDEMPOTENCY_CONFLICT',
          'This issue key was used with different authority.'
        );
      await client.query('COMMIT');
      return { replayed: true, issue: prior.rows[0] };
    }
    const found = await client.query(
      `SELECT c.*,o.id child_output_authority_id,o.status output_status,o.project_id,
              o.frozen_demand_baseline_id,o.assembly_path_identity child_assembly_path_identity,
              r.id material_requirement_id,r.successor_authority_id,r.inventory_item_id requirement_item_id,
              r.assembly_path_identity requirement_assembly_path,r.required_quantity,r.issued_quantity requirement_issued_quantity,
              r.status requirement_status,p.assembly_path_identity parent_assembly_path_identity,
              p.status parent_status,p.project_id parent_project_id,
              p.frozen_demand_baseline_id parent_baseline_id,
              p.production_work_order_id parent_production_work_order_id,p.traveler_id parent_traveler_id,
              i.ag_part_number
       FROM p2_manufactured_output_custodies c
       JOIN p2_manufactured_output_authorities o ON o.id=c.output_authority_id
       JOIN p2_manufacturing_work_order_material_requirements r ON r.id=$2
       JOIN p2_manufacturing_work_order_authorities p ON p.id=r.successor_authority_id
       JOIN inventory_items i ON i.id=c.inventory_item_id
       WHERE c.id=$1 AND r.successor_authority_id=$3
       FOR UPDATE OF c,r,p`,
      [input.custodyId, input.materialRequirementId, parentAuthorityId]
    );
    const row = found.rows[0];
    if (!row)
      throw new P2ManufacturedComponentIssueError(
        'COMPONENT_ISSUE_AUTHORITY_NOT_FOUND',
        'Custody and an exact parent material requirement are required.',
        404
      );
    const quantity = Number(input.quantity);
    const available = Number(row.available_quantity);
    const demandRemaining =
      Number(row.required_quantity) - Number(row.requirement_issued_quantity);
    if (row.output_status !== 'RELEASED' || row.custody_status === 'REVERSED')
      throw new P2ManufacturedComponentIssueError(
        'RELEASED_AVAILABLE_CUSTODY_REQUIRED',
        'Issue requires released, available manufactured-output custody.'
      );
    if (
      row.requirement_status !== 'OPEN' ||
      row.inventory_item_id !== row.requirement_item_id ||
      !['READY', 'IN_PROGRESS', 'BLOCKED', 'HOLD'].includes(
        row.parent_status
      ) ||
      row.project_id !== row.parent_project_id ||
      row.frozen_demand_baseline_id !== row.parent_baseline_id
    )
      throw new P2ManufacturedComponentIssueError(
        'PARENT_DEMAND_MISMATCH',
        'The parent demand must be active and identify the exact project, baseline, and Inventory Item.'
      );
    if (!(quantity > 0) || quantity > available || quantity > demandRemaining)
      throw new P2ManufacturedComponentIssueError(
        'COMPONENT_ISSUE_QUANTITY_INVALID',
        'Issue quantity exceeds custody availability or parent demand.',
        422
      );
    if (
      row.traceability_mode === 'SERIAL' &&
      (quantity !== 1 || available !== 1)
    )
      throw new P2ManufacturedComponentIssueError(
        'SERIAL_COMPONENT_ISSUE_INVALID',
        'A serial-controlled manufactured output must be issued exactly once at quantity one.',
        422
      );
    const ledgerBalance = await client.query(
      `SELECT COALESCE(SUM(quantity_delta),0) quantity FROM inventory_transaction_ledger
       WHERE inventory_item_id=$1 AND source_module IN ('p2-manufactured-output-custody','p2-manufactured-component-issue')
       AND (source_record_id=$2 OR metadata->>'custodyId'=$2)`,
      [row.inventory_item_id, row.output_authority_id]
    );
    if (Number(ledgerBalance.rows[0].quantity) !== available)
      throw new P2ManufacturedComponentIssueError(
        'COMPONENT_LEDGER_CUSTODY_DISAGREEMENT',
        'Inventory ledger and manufactured custody disagree.',
        500
      );
    const snapshot = {
      custodyId: row.id,
      childOutputAuthorityId: row.child_output_authority_id,
      parentWorkOrderAuthorityId: parentAuthorityId,
      parentMaterialRequirementId: row.material_requirement_id,
      inventoryItemId: row.inventory_item_id,
      outputIdentity: row.output_identity,
      traceabilityMode: row.traceability_mode,
      childAssemblyPathIdentity: row.child_assembly_path_identity,
      parentAssemblyPathIdentity: row.parent_assembly_path_identity,
      baselineId: row.frozen_demand_baseline_id,
      quantity,
      unit: row.unit_of_measure,
    };
    const ledger = await insertLedger(client, {
      transactionType: 'ISSUE',
      inventoryItemId: row.inventory_item_id,
      agPartNumber: row.ag_part_number,
      locationId: row.location_id,
      quantityDelta: -quantity,
      quantityBefore: available,
      quantityAfter: available - quantity,
      unitOfMeasure: row.unit_of_measure,
      statusBefore: row.custody_status,
      statusAfter: available - quantity === 0 ? 'ISSUED' : 'PARTIALLY_ISSUED',
      userId: actor.userId,
      displayName: actor.displayName,
      projectId: row.project_id,
      productionWorkOrderId: row.parent_production_work_order_id,
      travelerId: row.parent_traveler_id,
      reasonCode: 'P2_MANUFACTURED_COMPONENT_ISSUE',
      notes: `Controlled issue of ${clean(row.output_identity)} to parent work order`,
      sourceRecordId: row.child_output_authority_id,
      reversedTransactionId: null,
      metadata: {
        p2ManufacturedComponentIssueKey: input.idempotencyKey,
        p2ManufacturedComponentIssueHash: requestHash,
        ...snapshot,
      },
    });
    const saved = await client.query(
      `INSERT INTO p2_manufactured_component_issues
       (custody_id,child_output_authority_id,parent_work_order_authority_id,parent_material_requirement_id,
        inventory_item_id,child_assembly_path_identity,parent_assembly_path_identity,output_identity,
        traceability_mode,quantity,unit_of_measure,issue_ledger_entry_id,request_key,request_hash,
        authority_snapshot,authority_checksum,actor_user_id,actor_employee_id,actor_display_name,actor_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20) RETURNING *`,
      [
        row.id,
        row.child_output_authority_id,
        parentAuthorityId,
        row.material_requirement_id,
        row.inventory_item_id,
        row.child_assembly_path_identity,
        row.parent_assembly_path_identity,
        row.output_identity,
        row.traceability_mode,
        quantity,
        row.unit_of_measure,
        ledger.id,
        input.idempotencyKey,
        requestHash,
        JSON.stringify(snapshot),
        digest(snapshot),
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    const edge = { issueId: saved.rows[0].id, ...snapshot };
    await client.query(
      `INSERT INTO p2_manufactured_component_genealogy_edges
       (issue_id,child_output_authority_id,parent_work_order_authority_id,parent_material_requirement_id,
        inventory_item_id,quantity,unit_of_measure,child_assembly_path_identity,parent_assembly_path_identity,
        edge_snapshot,edge_checksum) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        saved.rows[0].id,
        row.child_output_authority_id,
        parentAuthorityId,
        row.material_requirement_id,
        row.inventory_item_id,
        quantity,
        row.unit_of_measure,
        row.child_assembly_path_identity,
        row.parent_assembly_path_identity,
        JSON.stringify(edge),
        digest(edge),
      ]
    );
    await client.query(
      `UPDATE p2_manufactured_output_custodies SET issued_quantity=issued_quantity+$2,
       custody_status=CASE WHEN available_quantity-$2=0 THEN 'ISSUED' ELSE 'PARTIALLY_ISSUED' END,
       concurrency_version=concurrency_version+1 WHERE id=$1`,
      [row.id, quantity]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_material_requirements SET issued_quantity=issued_quantity+$2,
       status=CASE WHEN issued_quantity+$2=required_quantity THEN 'SATISFIED' ELSE 'OPEN' END,
       updated_at=now() WHERE id=$1`,
      [row.material_requirement_id, quantity]
    );
    await client.query('COMMIT');
    return { replayed: false, issue: saved.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reverseP2ManufacturedComponentIssue(
  parentAuthorityId: string,
  issueId: string,
  input: { reasonCode: string; reasonText: string; idempotencyKey: string },
  actor: P2WorkOrderActor
) {
  const employeeId = employee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `p2-component-issue-reversal:${issueId}`,
    ]);
    const requestHash = digest({ parentAuthorityId, issueId, ...input });
    const replay = await client.query(
      'SELECT * FROM p2_manufactured_component_issue_reversals WHERE request_key=$1',
      [input.idempotencyKey]
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new P2ManufacturedComponentIssueError(
          'COMPONENT_REVERSAL_IDEMPOTENCY_CONFLICT',
          'This reversal key conflicts.'
        );
      await client.query('COMMIT');
      return { replayed: true, reversal: replay.rows[0] };
    }
    const found = await client.query(
      `SELECT x.*,c.available_quantity,c.location_id,i.ag_part_number,o.project_id,
              p.production_work_order_id,p.traveler_id
       FROM p2_manufactured_component_issues x
       JOIN p2_manufactured_output_custodies c ON c.id=x.custody_id
       JOIN p2_manufactured_output_authorities o ON o.id=x.child_output_authority_id
       JOIN p2_manufacturing_work_order_authorities p ON p.id=x.parent_work_order_authority_id
       JOIN inventory_items i ON i.id=x.inventory_item_id
       WHERE x.id=$1 AND x.parent_work_order_authority_id=$2 FOR UPDATE OF x,c`,
      [issueId, parentAuthorityId]
    );
    const row = found.rows[0];
    if (!row)
      throw new P2ManufacturedComponentIssueError(
        'COMPONENT_ISSUE_NOT_FOUND',
        'Manufactured-component issue was not found.',
        404
      );
    if (row.status !== 'ISSUED')
      throw new P2ManufacturedComponentIssueError(
        'COMPONENT_ISSUE_ALREADY_REVERSED',
        'The issue is not active.'
      );
    const before = Number(row.available_quantity);
    const quantity = Number(row.quantity);
    const ledger = await insertLedger(client, {
      transactionType: 'REVERSAL',
      inventoryItemId: row.inventory_item_id,
      agPartNumber: row.ag_part_number,
      locationId: row.location_id,
      quantityDelta: quantity,
      quantityBefore: before,
      quantityAfter: before + quantity,
      unitOfMeasure: row.unit_of_measure,
      statusBefore: 'ISSUED',
      statusAfter: 'AVAILABLE',
      userId: actor.userId,
      displayName: actor.displayName,
      projectId: row.project_id,
      productionWorkOrderId: row.production_work_order_id,
      travelerId: row.traveler_id,
      reasonCode: input.reasonCode,
      notes: input.reasonText,
      sourceRecordId: row.id,
      reversedTransactionId: row.issue_ledger_entry_id,
      metadata: {
        p2ManufacturedComponentIssueReversalKey: input.idempotencyKey,
        p2ManufacturedComponentIssueReversalHash: requestHash,
        custodyId: row.custody_id,
      },
    });
    const snapshot = {
      issueId,
      custodyId: row.custody_id,
      issueLedgerEntryId: row.issue_ledger_entry_id,
      reversalLedgerEntryId: ledger.id,
      quantity,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
    };
    const saved = await client.query(
      `INSERT INTO p2_manufactured_component_issue_reversals
       (issue_id,reversal_ledger_entry_id,reason_code,reason_text,request_key,request_hash,actor_user_id,
        actor_employee_id,actor_display_name,actor_role,reversal_snapshot,reversal_checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING *`,
      [
        row.id,
        ledger.id,
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
      `UPDATE p2_manufactured_component_issues SET status='REVERSED',reversed_at=now() WHERE id=$1`,
      [row.id]
    );
    await client.query(
      `UPDATE p2_manufactured_output_custodies SET issued_quantity=issued_quantity-$2,
      custody_status='AVAILABLE',concurrency_version=concurrency_version+1 WHERE id=$1`,
      [row.custody_id, quantity]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_material_requirements SET issued_quantity=issued_quantity-$2,
      status='OPEN',updated_at=now() WHERE id=$1`,
      [row.parent_material_requirement_id, quantity]
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

export async function getP2ManufacturedComponentGenealogy(
  parentAuthorityId: string
) {
  const result = await pool.query(
    `SELECT g.*,x.status issue_status,x.output_identity FROM p2_manufactured_component_genealogy_edges g
     JOIN p2_manufactured_component_issues x ON x.id=g.issue_id
     WHERE g.parent_work_order_authority_id=$1 ORDER BY g.created_at`,
    [parentAuthorityId]
  );
  return result.rows;
}
