import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db';

type ProductionSystem = 'P1' | 'P2' | null;
type Queryable = Pick<PoolClient, 'query'>;
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const resolveProductionSystem = (
  row: Record<string, unknown>
): ProductionSystem => {
  if (
    row.stock_build_production_system === 'P1' ||
    row.stock_build_production_system === 'P2'
  )
    return row.stock_build_production_system;
  if (row.utilized_in_pl1 === true && row.utilized_in_pl2 !== true) return 'P1';
  if (row.utilized_in_pl2 === true && row.utilized_in_pl1 !== true) return 'P2';
  return null;
};

const classificationBlocker = (row: Record<string, unknown>) => {
  if (row.utilized_in_pl1 === true && row.utilized_in_pl2 === true)
    return 'Production system is ambiguous: this part is assigned to both P1 and P2.';
  return 'Production system is missing: assign this manufactured part to P1 or P2.';
};

async function loadActiveManufacturedStockBuildParts(tx: Queryable) {
  const result = await tx.query(
    `SELECT i.id,i.ag_part_number,i.name,i.description,i.manufactured_category,
            i.manufacturing_level,i.default_department_id,i.utilized_in_pl1,
            i.utilized_in_pl2,i.stock_build_production_system,d.name AS default_department_name,
            COALESCE((SELECT sum(COALESCE(ib.quantity_available,0)) FROM inventory_balances ib
                      WHERE ib.ag_part_number=i.ag_part_number),0) AS available_quantity,
            COALESCE((SELECT count(*) FROM boms b JOIN bom_revisions br ON br.bom_id=b.id
                      WHERE (b.parent_inventory_item_id=i.id OR b.parent_part_ag_number=i.ag_part_number)
                        AND b.is_active=true AND br.is_released=true
                        AND COALESCE(br.lifecycle_status,'RELEASED')='RELEASED'
                        AND (br.effective_from IS NULL OR br.effective_from<=now())
                        AND (br.effective_to IS NULL OR br.effective_to>now())),0)::int AS released_bom_count,
            COALESCE((SELECT count(*) FROM part_routings pr WHERE pr.is_active=true AND pr.project_id IS NULL
                        AND (pr.inventory_item_fk=i.id OR pr.inventory_item_id=i.id::text
                             OR lower(pr.part_number)=lower(i.ag_part_number))),0)::int AS active_routing_count,
            COALESCE((SELECT count(*) FROM inventory_item_traceability_policies tp
                      WHERE tp.inventory_item_id=i.id AND tp.status='RELEASED'
                        AND (tp.effective_from IS NULL OR tp.effective_from<=now())
                        AND (tp.effective_to IS NULL OR tp.effective_to>now())),0)::int AS released_traceability_policy_count
       FROM inventory_items i LEFT JOIN inventory_departments d ON d.id=i.default_department_id
      WHERE i.is_active=true AND i.item_type='MANUFACTURED' ORDER BY i.ag_part_number,i.name`
  );
  return result.rows.map((row) => {
    const productionSystem = resolveProductionSystem(row);
    const blockers: string[] = [];
    if (!productionSystem) blockers.push(classificationBlocker(row));
    if (!row.default_department_id)
      blockers.push('A default manufacturing department is required.');
    if (Number(row.released_bom_count) !== 1)
      blockers.push(
        Number(row.released_bom_count) === 0
          ? 'A released effective BOM is required.'
          : 'More than one released effective BOM is available; revision authority is ambiguous.'
      );
    if (Number(row.active_routing_count) !== 1)
      blockers.push(
        Number(row.active_routing_count) === 0
          ? 'An active stock routing is required.'
          : 'More than one active stock routing is available; routing authority is ambiguous.'
      );
    if (Number(row.released_traceability_policy_count) !== 1)
      blockers.push(
        Number(row.released_traceability_policy_count) === 0
          ? 'A released traceability or approved no-traceability policy is required.'
          : 'More than one released traceability policy is effective.'
      );
    return {
      id: Number(row.id),
      agPartNumber: row.ag_part_number,
      name: row.name,
      description: row.description,
      manufacturedCategory: row.manufactured_category,
      manufacturingLevel: row.manufacturing_level,
      productionSystem,
      defaultDepartmentId: row.default_department_id,
      defaultDepartmentName: row.default_department_name,
      availableQuantity: Number(row.available_quantity),
      releasedBomCount: Number(row.released_bom_count),
      activeRoutingCount: Number(row.active_routing_count),
      releasedTraceabilityPolicyCount: Number(
        row.released_traceability_policy_count
      ),
      readyForStockBuildPreview: blockers.length === 0,
      blockers,
    };
  });
}

export async function listActiveManufacturedStockBuildParts() {
  return loadActiveManufacturedStockBuildParts(pool as unknown as Queryable);
}

export type StockBuildActor = {
  userId: number;
  employeeId: number | null;
  displayName: string;
  role: string;
};
export class StockBuildRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409
  ) {
    super(message);
  }
}

export async function createStockBuildDraft(
  input: {
    inventoryItemId: number;
    requestedQuantity: number;
    priority: number;
    dueDate?: string;
    targetStockLocation?: string;
    notes?: string;
    idempotencyKey: string;
  },
  actor: StockBuildActor
) {
  const requestHash = checksum({
    inventoryItemId: input.inventoryItemId,
    requestedQuantity: input.requestedQuantity,
    priority: input.priority,
    dueDate: input.dueDate ?? null,
    targetStockLocation: input.targetStockLocation?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `stock-build:${actor.userId}:${input.idempotencyKey}`,
    ]);
    const replay = await client.query(
      `SELECT * FROM stock_build_requests WHERE created_by_user_id=$1 AND idempotency_key=$2`,
      [actor.userId, input.idempotencyKey]
    );
    if (replay.rows.length) {
      if (replay.rows[0].request_hash !== requestHash)
        throw new StockBuildRequestError(
          'STOCK_BUILD_IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different stock-build request.'
        );
      await client.query('COMMIT');
      return { replayed: true, request: replay.rows[0] };
    }
    const part = (await loadActiveManufacturedStockBuildParts(client)).find(
      (candidate) => candidate.id === input.inventoryItemId
    );
    if (!part)
      throw new StockBuildRequestError(
        'ACTIVE_MANUFACTURED_PART_REQUIRED',
        'Select an active manufactured inventory part.',
        404
      );
    if (!part.readyForStockBuildPreview || !part.productionSystem)
      throw new StockBuildRequestError(
        'STOCK_BUILD_AUTHORITY_INCOMPLETE',
        'The selected part is missing unambiguous stock-build authority.'
      );
    const readinessSnapshot = {
      productionSystem: part.productionSystem,
      defaultDepartmentId: part.defaultDepartmentId,
      defaultDepartmentName: part.defaultDepartmentName,
      releasedBomCount: part.releasedBomCount,
      activeRoutingCount: part.activeRoutingCount,
      releasedTraceabilityPolicyCount: part.releasedTraceabilityPolicyCount,
      availableQuantity: part.availableQuantity,
      blockers: part.blockers,
      evaluatedAt: new Date().toISOString(),
    };
    const readinessChecksum = checksum(readinessSnapshot);
    const id = randomUUID();
    const inserted = await client.query(
      `INSERT INTO stock_build_requests
        (id,inventory_item_id,production_system,requested_quantity,priority,due_date,target_stock_location,
         notes,status,part_number_snapshot,part_name_snapshot,part_revision_snapshot,department_id_snapshot,
         department_name_snapshot,readiness_snapshot,readiness_checksum,idempotency_key,request_hash,
         created_by_user_id,created_by_employee_id,created_by_display_name,created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),NULLIF($8,''),'DRAFT',$9,$10,NULL,$11,$12,$13::jsonb,
         $14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        id,
        part.id,
        part.productionSystem,
        input.requestedQuantity,
        input.priority,
        input.dueDate ?? null,
        input.targetStockLocation?.trim() ?? '',
        input.notes?.trim() ?? '',
        part.agPartNumber,
        part.name,
        part.defaultDepartmentId,
        part.defaultDepartmentName,
        JSON.stringify(readinessSnapshot),
        readinessChecksum,
        input.idempotencyKey,
        requestHash,
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
      ]
    );
    await client.query(
      `INSERT INTO stock_build_request_events
        (stock_build_request_id,event_type,actor_user_id,actor_employee_id,actor_display_name,actor_role,evidence)
       VALUES ($1,'DRAFT_CREATED',$2,$3,$4,$5,$6::jsonb)`,
      [
        id,
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify({ requestHash, readinessChecksum }),
      ]
    );
    await client.query('COMMIT');
    return { replayed: false, request: inserted.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStockBuildRequest(id: string) {
  const result = await pool.query(
    `SELECT * FROM stock_build_requests WHERE id=$1`,
    [id]
  );
  if (!result.rows.length)
    throw new StockBuildRequestError(
      'STOCK_BUILD_REQUEST_NOT_FOUND',
      'The stock-build request was not found.',
      404
    );
  return result.rows[0];
}
