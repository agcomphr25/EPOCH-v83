/**
 * featureFlags — centralized runtime feature flag reads.
 *
 * All flags default to `false` unless the corresponding env var is set to
 * the string "true" (case-insensitive).  Callers import the exported
 * booleans directly so they never touch process.env themselves.
 */

function envBool(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return defaultValue;
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Gates all labor_allocations dual-write calls.
 * Set LABOR_ALLOCATIONS_ENABLED=true to enable.
 */
export const laborAllocationsEnabled: boolean = envBool(
  'LABOR_ALLOCATIONS_ENABLED',
  false
);

/**
 * Gates the allocation-based costing read path.
 * When ON, processLaborCosts reads from labor_allocations (CLOSED REGULAR segments)
 * instead of punch_ledger sessions to produce finer-grained cost attribution.
 * Falls back to the legacy punch_ledger path automatically on any failure.
 * Set USE_ALLOCATION_COSTING_READ=true to enable.
 */
export const useAllocationCostingRead: boolean = envBool(
  'USE_ALLOCATION_COSTING_READ',
  false
);

/**
 * Gates the salaried manual draft time entry UI and API.
 * When ON, salaried employees can create/edit/confirm labor_entry_drafts records
 * via the employee portal without touching the hourly punch_ledger flow.
 * Set SALARIED_DRAFT_ENTRY_ENABLED=true to enable.
 */
export const salariedDraftEntryEnabled: boolean = envBool(
  'SALARIED_DRAFT_ENTRY_ENABLED',
  false
);

/**
 * Gates only the consequential p2_v2 Production Launch mutation.
 * This remains fail-closed until isolated-database, concurrency, and staging
 * launch validation are complete.
 */
export function isP2V2ProductionLaunchEnabled(): boolean {
  return process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED === 'true';
}

/** Gates the read-only recursive Production Launch preview introduced in Phase 1. */
export function isP2V2ProductionLaunchPreviewEnabled(): boolean {
  return process.env.P2_V2_PRODUCTION_LAUNCH_PREVIEW_ENABLED === 'true';
}

/** Gates only recursive Production Launch evidence persistence. */
export function isP2V2ProductionLaunchPersistenceEnabled(): boolean {
  return process.env.P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_ENABLED === 'true';
}

/** Gates the planning-to-floor authorization bridge; disabled unless exact lowercase true. */
export function isP2V2ExecutionAuthorizationEnabled(): boolean {
  return process.env.P2_V2_EXECUTION_AUTHORIZATION_ENABLED === 'true';
}

/** Gates creation of P2 production orders from authorized recursive demand. */
export function isP2V2ProductionOrderProvisioningEnabled(): boolean {
  return process.env.P2_V2_PRODUCTION_ORDER_PROVISIONING_ENABLED === 'true';
}

/** Gates serialized customer-unit allocation from provisioned root demand. */
export function isP2V2SerializedUnitProvisioningEnabled(): boolean {
  return process.env.P2_V2_SERIALIZED_UNIT_PROVISIONING_ENABLED === 'true';
}

/** Gates draft traveler creation from audited serialized root units. */
export function isP2V2TravelerProvisioningEnabled(): boolean {
  return process.env.P2_V2_TRAVELER_PROVISIONING_ENABLED === 'true';
}

/** Gates canonical assembly/component work-order links from authorized MAKE demand. */
export function isP2V2WorkOrderProvisioningEnabled(): boolean {
  return process.env.P2_V2_WORK_ORDER_PROVISIONING_ENABLED === 'true';
}

/** Gates draft batch travelers for manufactured child work orders. */
export function isP2V2ComponentTravelerProvisioningEnabled(): boolean {
  return process.env.P2_V2_COMPONENT_TRAVELER_PROVISIONING_ENABLED === 'true';
}

/** Phase 1 department/routing foundation flags. All are disabled by default. */
export function areSharedInventoryDepartmentReadsEnabled(): boolean {
  return envBool('SHARED_INVENTORY_DEPARTMENT_READS_ENABLED', false);
}

export function areSharedInventoryDepartmentWritesEnabled(): boolean {
  return envBool('SHARED_INVENTORY_DEPARTMENT_WRITES_ENABLED', false);
}

export function isStableRoutingInventoryItemFkEnabled(): boolean {
  return envBool('STABLE_ROUTING_INVENTORY_ITEM_FK_ENABLED', false);
}

export function areRoutingOperationDepartmentIdsEnabled(): boolean {
  return envBool('ROUTING_OPERATION_DEPARTMENT_IDS_ENABLED', false);
}

/**
 * Cutover date for the punch_ledger migration.
 * For pay periods starting ON or AFTER this date, hour computations read
 * exclusively from public.punch_ledger.  For periods ending BEFORE this date,
 * computations read exclusively from timekeeping.punches.
 * Format: "YYYY-MM-DD".  Defaults to "2024-01-01" (all periods use punch_ledger).
 * Set PUNCH_LEDGER_CUTOVER_DATE=YYYY-MM-DD to adjust.
 */
export const punchLedgerCutoverDate: string = (() => {
  const raw = process.env.PUNCH_LEDGER_CUTOVER_DATE?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '2024-01-01';
})();
