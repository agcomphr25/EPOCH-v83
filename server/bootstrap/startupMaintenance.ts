export function shouldRunLegacyStartupDbMaintenance() {
  const flag = process.env.RUN_STARTUP_DB_MAINTENANCE?.toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function getLegacyStartupDbMaintenanceSkipMessage() {
  return [
    'Legacy startup DB maintenance is disabled during normal startup.',
    'Run npm run maintenance:safe-migrations before deploy for schema changes.',
    'Set RUN_STARTUP_DB_MAINTENANCE=true only for a deliberate one-off compatibility bootstrap.',
  ].join(' ');
}
