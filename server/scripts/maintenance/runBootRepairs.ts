import { db, pool } from '../../db';
import {
  runEarlyOneTimeRepairBackfills,
  runLaborAllocationBackfill,
  runPacketAllocationBootBackfill,
  runP1ProductionStatusBootBackfill,
  runReturnToQcBootRepair,
} from '../../bootstrap/oneTimeRepairs';

async function main() {
  console.log('Starting historical boot repairs...');

  const { inserted, missing } = await runLaborAllocationBackfill(pool);
  console.log(`Labor allocation backfill inserted ${inserted} row(s).`);
  if (missing > 0) {
    throw new Error(`${missing} punch_ledger session(s) still lack labor allocations after backfill`);
  }

  await runEarlyOneTimeRepairBackfills({ db, pool });
  const p1StatusBackfill = await runP1ProductionStatusBootBackfill({ db, pool });
  console.log(`P1 production status backfill updated ${p1StatusBackfill.updated} row(s).`);
  await runReturnToQcBootRepair();
  await runPacketAllocationBootBackfill({ db, pool });

  console.log('Historical boot repairs completed successfully.');
}

main()
  .catch((error) => {
    console.error('Historical boot repairs failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
