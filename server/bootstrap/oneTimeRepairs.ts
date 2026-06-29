import {
  runEarlyBootRepairBackfills,
  runPacketAllocationBackfill,
  runP1ProductionStatusBackfill,
  runReturnToQcShippedStatusRepair,
} from '../scripts/maintenance/bootRepairBackfills';

type BootRepairContext = {
  db: any;
  pool: any;
};

export function shouldRunHistoricalBootRepairs() {
  const flag = process.env.RUN_BOOT_REPAIRS?.toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export async function countMissingLaborAllocations(pool: any) {
  const coverageResult = await pool.query(`
    SELECT COUNT(*) AS missing
    FROM punch_ledger pl
    WHERE NOT EXISTS (
      SELECT 1 FROM labor_allocations la WHERE la.punch_ledger_id = pl.id
    )
  `);
  return parseInt((coverageResult as any)[0]?.missing ?? '0', 10);
}

export async function runLaborAllocationBackfill(pool: any) {
  const backfillResult = await pool.query(`
    INSERT INTO labor_allocations (
      punch_ledger_id,
      employee_id,
      allocation_start,
      allocation_end,
      charge_code_id,
      traveler_id,
      traveler_step_id,
      production_work_order_id,
      project_id,
      department,
      operation,
      certification_status,
      labor_class,
      is_overrun,
      status,
      source,
      sequence_order
    )
    SELECT
      pl.id                        AS punch_ledger_id,
      pl.employee_id               AS employee_id,
      pl.clock_in                  AS allocation_start,
      pl.clock_out                 AS allocation_end,
      pl.charge_code_id            AS charge_code_id,
      pl.traveler_id               AS traveler_id,
      pl.traveler_step_id          AS traveler_step_id,
      pl.production_work_order_id  AS production_work_order_id,
      pl.project_id                AS project_id,
      pl.department                AS department,
      pl.operation                 AS operation,
      pl.certification_status      AS certification_status,
      pl.labor_class               AS labor_class,
      pl.is_overrun                AS is_overrun,
      CASE WHEN pl.clock_out IS NULL THEN 'OPEN' ELSE 'CLOSED' END AS status,
      'BACKFILL'                   AS source,
      1                            AS sequence_order
    FROM punch_ledger pl
    WHERE NOT EXISTS (
      SELECT 1 FROM labor_allocations la WHERE la.punch_ledger_id = pl.id
    )
  `);

  return {
    inserted: backfillResult.rowCount ?? 0,
    missing: await countMissingLaborAllocations(pool),
  };
}

export async function runEarlyOneTimeRepairBackfills(context: BootRepairContext) {
  await runEarlyBootRepairBackfills(context);
}

export async function runP1ProductionStatusBootBackfill(context: BootRepairContext) {
  return runP1ProductionStatusBackfill(context);
}

export async function runReturnToQcBootRepair() {
  await runReturnToQcShippedStatusRepair();
}

export async function runPacketAllocationBootBackfill(context: BootRepairContext) {
  await runPacketAllocationBackfill(context);
}
