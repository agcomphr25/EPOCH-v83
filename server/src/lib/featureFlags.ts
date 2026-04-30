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
export const laborAllocationsEnabled: boolean = envBool('LABOR_ALLOCATIONS_ENABLED', false);

/**
 * Gates the allocation-based costing read path.
 * When ON, processLaborCosts reads from labor_allocations (CLOSED REGULAR segments)
 * instead of punch_ledger sessions to produce finer-grained cost attribution.
 * Falls back to the legacy punch_ledger path automatically on any failure.
 * Set USE_ALLOCATION_COSTING_READ=true to enable.
 */
export const useAllocationCostingRead: boolean = envBool('USE_ALLOCATION_COSTING_READ', false);
