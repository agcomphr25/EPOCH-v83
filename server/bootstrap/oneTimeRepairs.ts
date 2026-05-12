import {
  runEarlyBootRepairBackfills,
  runPacketAllocationBackfill,
  runReturnToQcShippedStatusRepair,
} from '../scripts/maintenance/bootRepairBackfills';

type BootRepairContext = {
  db: any;
  pool: any;
};

export async function runEarlyOneTimeRepairBackfills(context: BootRepairContext) {
  await runEarlyBootRepairBackfills(context);
}

export async function runReturnToQcBootRepair() {
  await runReturnToQcShippedStatusRepair();
}

export async function runPacketAllocationBootBackfill(context: BootRepairContext) {
  await runPacketAllocationBackfill(context);
}
