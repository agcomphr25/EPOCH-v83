import type { PoolClient } from 'pg';

import { pool } from '../../db';

export type CombinedProcessActor = {
  userId: number;
  displayName: string;
};

export type CombinedProcessInput = {
  processCode: string;
  name: string;
  description?: string | null;
  leadDepartmentId: number;
  minimumRuns: number;
  maximumRuns?: number | null;
  setupMinutes: number;
  cycleMinutesPerRun: number;
  allowExcessOutput: boolean;
  outputs: Array<{
    inventoryItemId: number;
    quantityPerRun: number;
    isPrimary: boolean;
  }>;
};

export class CombinedProcessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const mapProcess = (row: Record<string, any>) => ({
  id: row.id,
  processCode: row.process_code,
  name: row.name,
  description: row.description,
  revision: row.revision,
  status: row.status,
  leadDepartmentId: row.lead_department_id,
  leadDepartmentCode: row.lead_department_code,
  leadDepartmentName: row.lead_department_name,
  minimumRuns: row.minimum_runs,
  maximumRuns: row.maximum_runs,
  setupMinutes: row.setup_minutes,
  cycleMinutesPerRun: row.cycle_minutes_per_run,
  allowExcessOutput: row.allow_excess_output,
  createdByDisplayName: row.created_by_display_name,
  createdAt: row.created_at,
  approvedByDisplayName: row.approved_by_display_name,
  approvedAt: row.approved_at,
  outputs: Array.isArray(row.outputs) ? row.outputs : [],
});

const processSelect = `
  SELECT p.*,d.name lead_department_name,d.department_code lead_department_code,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',o.id,
      'inventoryItemId',o.inventory_item_id,
      'partNumber',i.ag_part_number,
      'partName',i.name,
      'quantityPerRun',o.quantity_per_run,
      'isPrimary',o.is_primary
    ) ORDER BY o.is_primary DESC,i.ag_part_number)
      FILTER (WHERE o.id IS NOT NULL),'[]'::jsonb) outputs
  FROM combined_manufacturing_processes p
  JOIN inventory_departments d ON d.id=p.lead_department_id
  LEFT JOIN combined_manufacturing_process_outputs o ON o.process_id=p.id
  LEFT JOIN inventory_items i ON i.id=o.inventory_item_id`;

export async function listCombinedManufacturingProcesses() {
  const result = await pool.query(`${processSelect}
    GROUP BY p.id,d.id
    ORDER BY p.process_code,p.revision DESC`);
  return result.rows.map(mapProcess);
}

async function validateDefinition(
  input: CombinedProcessInput,
  tx: Pick<PoolClient, 'query'>
) {
  if (input.outputs.length < 2)
    throw new CombinedProcessError(
      'MULTIPLE_OUTPUTS_REQUIRED',
      'A combined manufacturing process must produce at least two distinct manufactured parts.',
      400
    );
  if (
    new Set(input.outputs.map((output) => output.inventoryItemId)).size !==
    input.outputs.length
  )
    throw new CombinedProcessError(
      'DUPLICATE_OUTPUT_ITEM',
      'Each manufactured output may appear only once in a process revision.',
      400
    );
  if (input.outputs.filter((output) => output.isPrimary).length !== 1)
    throw new CombinedProcessError(
      'ONE_PRIMARY_OUTPUT_REQUIRED',
      'Select exactly one primary output for the combined process.',
      400
    );
  const department = await tx.query(
    `SELECT id FROM inventory_departments
     WHERE id=$1 AND is_active=true AND production_enabled=true AND scheduling_enabled=true`,
    [input.leadDepartmentId]
  );
  if (department.rows.length !== 1)
    throw new CombinedProcessError(
      'SCHEDULABLE_DEPARTMENT_REQUIRED',
      'The lead department must be an active production and scheduling department.',
      400
    );
  const items = await tx.query(
    `SELECT id FROM inventory_items
     WHERE id=ANY($1::int[]) AND is_active=true AND item_type='MANUFACTURED'`,
    [input.outputs.map((output) => output.inventoryItemId)]
  );
  if (items.rows.length !== input.outputs.length)
    throw new CombinedProcessError(
      'MANUFACTURED_OUTPUTS_REQUIRED',
      'Every output must reference a distinct active MANUFACTURED inventory item.',
      400
    );
}

export async function createCombinedManufacturingProcess(
  input: CombinedProcessInput,
  actor: CombinedProcessActor
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await validateDefinition(input, client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `combined-manufacturing-process:${input.processCode.toUpperCase()}`,
    ]);
    const revisionResult = await client.query(
      `SELECT COALESCE(MAX(revision),0)+1 revision
       FROM combined_manufacturing_processes
       WHERE upper(process_code)=upper($1)`,
      [input.processCode]
    );
    const revision = Number(revisionResult.rows[0].revision);
    const created = await client.query(
      `INSERT INTO combined_manufacturing_processes
        (process_code,name,description,lead_department_id,revision,minimum_runs,
         maximum_runs,setup_minutes,cycle_minutes_per_run,allow_excess_output,
         created_by_user_id,created_by_display_name)
       VALUES (upper($1),$2,NULLIF($3,''),$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        input.processCode,
        input.name,
        input.description ?? '',
        input.leadDepartmentId,
        revision,
        input.minimumRuns,
        input.maximumRuns ?? null,
        input.setupMinutes,
        input.cycleMinutesPerRun,
        input.allowExcessOutput,
        actor.userId,
        actor.displayName,
      ]
    );
    const processId = created.rows[0].id;
    for (const output of input.outputs) {
      await client.query(
        `INSERT INTO combined_manufacturing_process_outputs
          (process_id,inventory_item_id,quantity_per_run,is_primary)
         VALUES ($1,$2,$3,$4)`,
        [
          processId,
          output.inventoryItemId,
          output.quantityPerRun,
          output.isPrimary,
        ]
      );
    }
    await client.query(
      `INSERT INTO combined_manufacturing_process_events
        (process_id,event_type,actor_user_id,actor_display_name,evidence)
       VALUES ($1,'CREATED',$2,$3,$4::jsonb)`,
      [processId, actor.userId, actor.displayName, JSON.stringify({ revision })]
    );
    await client.query('COMMIT');
    return { id: processId, revision, status: 'DRAFT' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function approveCombinedManufacturingProcess(
  processId: string,
  actor: CombinedProcessActor
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const process = await client.query(
      `SELECT p.*,
        (SELECT count(*)::int FROM combined_manufacturing_process_outputs o WHERE o.process_id=p.id) output_count,
        (SELECT count(*)::int FROM combined_manufacturing_process_outputs o WHERE o.process_id=p.id AND o.is_primary=true) primary_count
       FROM combined_manufacturing_processes p WHERE p.id=$1 FOR UPDATE`,
      [processId]
    );
    if (process.rows.length !== 1)
      throw new CombinedProcessError(
        'PROCESS_NOT_FOUND',
        'Combined manufacturing process not found.',
        404
      );
    const row = process.rows[0];
    if (row.status !== 'DRAFT')
      throw new CombinedProcessError(
        'DRAFT_PROCESS_REQUIRED',
        'Only a draft process revision may be approved.'
      );
    if (Number(row.output_count) < 2 || Number(row.primary_count) !== 1)
      throw new CombinedProcessError(
        'INVALID_OUTPUT_DEFINITION',
        'Approval requires at least two outputs and exactly one primary output.'
      );
    await client.query(
      `UPDATE combined_manufacturing_processes
       SET status='APPROVED',approved_by_user_id=$2,approved_by_display_name=$3,
         approved_at=now(),updated_at=now() WHERE id=$1`,
      [processId, actor.userId, actor.displayName]
    );
    await client.query(
      `INSERT INTO combined_manufacturing_process_events
        (process_id,event_type,actor_user_id,actor_display_name,evidence)
       VALUES ($1,'APPROVED',$2,$3,'{}'::jsonb)`,
      [processId, actor.userId, actor.displayName]
    );
    await client.query('COMMIT');
    return { id: processId, status: 'APPROVED' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recommendCombinedManufacturingProcesses(
  projectId: string,
  baselineId: string
) {
  const baseline = await pool.query(
    `SELECT id FROM p2_frozen_production_demand_baselines
     WHERE id=$1 AND project_id=$2 AND status='RELEASED'`,
    [baselineId, projectId]
  );
  if (baseline.rows.length !== 1)
    throw new CombinedProcessError(
      'RELEASED_FROZEN_DEMAND_REQUIRED',
      'Recommendations require the exact released Frozen Production Demand baseline.',
      409
    );
  const demand = await pool.query(
    `SELECT inventory_item_id,MAX(part_number_snapshot) part_number,
       SUM(required_gross_quantity)::numeric required_quantity
     FROM p2_frozen_production_demand_nodes
     WHERE baseline_id=$1 AND make_buy_disposition='MAKE'
     GROUP BY inventory_item_id`,
    [baselineId]
  );
  const demandByItem = new Map(
    demand.rows.map((row) => [
      Number(row.inventory_item_id),
      Number(row.required_quantity),
    ])
  );
  const processes = await listCombinedManufacturingProcesses();
  return processes
    .filter((process) => process.status === 'APPROVED')
    .map((process) => {
      const demandedOutputs = process.outputs.filter(
        (output: any) =>
          (demandByItem.get(Number(output.inventoryItemId)) ?? 0) > 0
      );
      if (demandedOutputs.length < 2) return null;
      const calculatedRuns = Math.max(
        Number(process.minimumRuns),
        ...demandedOutputs.map((output: any) =>
          Math.ceil(
            (demandByItem.get(Number(output.inventoryItemId)) ?? 0) /
              Number(output.quantityPerRun)
          )
        )
      );
      if (process.maximumRuns && calculatedRuns > Number(process.maximumRuns))
        return null;
      const outputs = process.outputs.map((output: any) => {
        const requiredQuantity =
          demandByItem.get(Number(output.inventoryItemId)) ?? 0;
        const plannedQuantity = calculatedRuns * Number(output.quantityPerRun);
        return {
          ...output,
          requiredQuantity,
          plannedQuantity,
          excessQuantity: Math.max(0, plannedQuantity - requiredQuantity),
        };
      });
      const hasExcess = outputs.some(
        (output: any) => output.excessQuantity > 0
      );
      if (hasExcess && !process.allowExcessOutput) return null;
      return {
        processId: process.id,
        processCode: process.processCode,
        processName: process.name,
        revision: process.revision,
        leadDepartmentId: process.leadDepartmentId,
        leadDepartmentName: process.leadDepartmentName,
        recommendedRuns: calculatedRuns,
        estimatedMinutes:
          Number(process.setupMinutes) +
          calculatedRuns * Number(process.cycleMinutesPerRun),
        outputs,
        recommendationOnly: true,
      };
    })
    .filter(Boolean);
}
