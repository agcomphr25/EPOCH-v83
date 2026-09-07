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

/** Phase 2 Inventory Item traceability and controlled BOM flags. */
export function areInventoryTraceabilityPolicyReadsEnabled(): boolean {
  return envBool('INVENTORY_TRACEABILITY_POLICY_READS_ENABLED', false);
}

export function areInventoryTraceabilityPolicyWritesEnabled(): boolean {
  return envBool('INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED', false);
}

export function areControlledItemLinkedBomReadsEnabled(): boolean {
  return envBool('CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED', false);
}

export function areControlledItemLinkedBomWritesEnabled(): boolean {
  return envBool('CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED', false);
}

export function isP2ConfigurationBomIntegrationEnabled(): boolean {
  return envBool('P2_CONFIGURATION_BOM_INTEGRATION_ENABLED', false);
}

export function isRecursiveTraceabilityPreviewEnabled(): boolean {
  return envBool('RECURSIVE_TRACEABILITY_PREVIEW_ENABLED', false);
}

/** Phase 3 P2 project controlled-configuration foundation; disabled by default. */
export function areP2ProjectControlledConfigurationReadsEnabled(): boolean {
  return envBool('P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED', false);
}

export function areP2ProjectControlledConfigurationWritesEnabled(): boolean {
  return envBool('P2_PROJECT_CONTROLLED_CONFIGURATION_WRITES_ENABLED', false);
}

/** Phase 4 controlled WAD traveler-decision authority; disabled by default. */
export function areP2WadTravelerDecisionReadsEnabled(): boolean {
  return envBool('P2_WAD_TRAVELER_DECISION_READS_ENABLED', false);
}
export function areP2WadTravelerDecisionWritesEnabled(): boolean {
  return envBool('P2_WAD_TRAVELER_DECISION_WRITES_ENABLED', false);
}

/** Phase 5 immutable gross-demand foundation; all gates require exact lowercase true. */
export function areP2FrozenProductionDemandReadsEnabled(): boolean {
  return envBool('P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED', false);
}
export function areP2FrozenProductionDemandWritesEnabled(): boolean {
  return envBool('P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED', false);
}
export function areP2FrozenProductionDemandReleasesEnabled(): boolean {
  return envBool('P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED', false);
}

/** Phase 6 P2 manufacturing work-order queues; all gates default off. */
export function areP2ManufacturingWorkOrderQueueReadsEnabled(): boolean {
  return envBool('P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED', false);
}
export function areP2ManufacturingWorkOrderMaterializationEnabled(): boolean {
  return envBool('P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED', false);
}
export function areP2ManufacturingWorkOrderExecutionEnabled(): boolean {
  return envBool('P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED', false);
}

/** Phase 7 traveler provisioning and coverage ledger; defaults off. */
export function areP2TravelerProvisioningWritesEnabled(): boolean {
  return envBool('P2_TRAVELER_PROVISIONING_WRITES_ENABLED', false);
}

/** Phase 8 controlled Receiving barcode identities and printing; defaults off. */
export function areP2ReceivingBarcodeIdentitiesEnabled(): boolean {
  return envBool('P2_RECEIVING_BARCODE_IDENTITIES_ENABLED', false);
}

/** Phase 9 controlled material scanning and consumption; both gates default off. */
export function areP2MaterialConsumptionReadsEnabled(): boolean {
  return envBool('P2_MATERIAL_CONSUMPTION_READS_ENABLED', false);
}
export function areP2MaterialConsumptionWritesEnabled(): boolean {
  return envBool('P2_MATERIAL_CONSUMPTION_WRITES_ENABLED', false);
}

export function areP2ManufacturedOutputReadsEnabled(): boolean {
  return envBool('P2_MANUFACTURED_OUTPUT_READS_ENABLED', false);
}

export function areP2ManufacturedOutputWritesEnabled(): boolean {
  return envBool('P2_MANUFACTURED_OUTPUT_WRITES_ENABLED', false);
}

/** Phase 10 custody correction; exact true opt-in and disabled by default. */
export function areP2ManufacturedOutputCustodyReadsEnabled(): boolean {
  return envBool('P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED', false);
}

export function areP2ManufacturedOutputCustodyWritesEnabled(): boolean {
  return envBool('P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED', false);
}

/** Phase 11 manufactured-component issue and parent genealogy; disabled by default. */
export function areP2ManufacturedComponentIssueReadsEnabled(): boolean {
  return envBool('P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED', false);
}

export function areP2ManufacturedComponentIssueWritesEnabled(): boolean {
  return envBool('P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED', false);
}

/** Phase 12 Quality and shipment-release authority; disabled by default. */
export function areP2QualityShipmentReleaseReadsEnabled(): boolean {
  return envBool('P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED', false);
}
export function areP2QualityShipmentReleaseWritesEnabled(): boolean {
  return envBool('P2_QUALITY_SHIPMENT_RELEASE_WRITES_ENABLED', false);
}

/** Phase 13 read-only P2 genealogy search, viewer, and reporting. */
export function isP2GenealogyViewerEnabled(): boolean {
  return envBool('P2_GENEALOGY_VIEWER_ENABLED', false);
}

/** Universal P1/P2 stock-build request authority; release remains a separate future gate. */
export function areStockBuildRequestReadsEnabled(): boolean {
  return envBool('STOCK_BUILD_REQUEST_READS_ENABLED', false);
}

export function areStockBuildRequestWritesEnabled(): boolean {
  return envBool('STOCK_BUILD_REQUEST_WRITES_ENABLED', false);
}

export function areStockBuildReleaseReadinessWritesEnabled(): boolean {
  return envBool('STOCK_BUILD_RELEASE_READINESS_WRITES_ENABLED', false);
}

/** Phase 14 read-only activation readiness controller; never enables other flags. */
export function isP2ControlledActivationReadinessEnabled(): boolean {
  return envBool('P2_CONTROLLED_ACTIVATION_READINESS_ENABLED', false);
}

/** Combined manufacturing process administration and recommendation preview. */
export function areCombinedManufacturingProcessReadsEnabled(): boolean {
  return envBool('COMBINED_MANUFACTURING_PROCESS_READS_ENABLED', false);
}

export function areCombinedManufacturingProcessWritesEnabled(): boolean {
  return envBool('COMBINED_MANUFACTURING_PROCESS_WRITES_ENABLED', false);
}

export function areCombinedManufacturingProcessPlanningWritesEnabled(): boolean {
  return envBool(
    'COMBINED_MANUFACTURING_PROCESS_PLANNING_WRITES_ENABLED',
    false
  );
}

export function areCombinedManufacturingProcessMaterializationWritesEnabled(): boolean {
  return envBool(
    'COMBINED_MANUFACTURING_PROCESS_MATERIALIZATION_WRITES_ENABLED',
    false
  );
}

/**
 * Finance Operations pilot gates. All three are independent and fail closed.
 * AI explanations must remain disabled until the approved CMMC/data-boundary
 * review is complete; deterministic finance workflows do not depend on it.
 */
export function isFinanceAttentionCenterEnabled(): boolean {
  return envBool('FINANCE_ATTENTION_CENTER_ENABLED', false);
}

export function isFinanceArDraftPreparationEnabled(): boolean {
  return envBool('FINANCE_AR_DRAFT_PREPARATION_ENABLED', false);
}

export function isFinanceAiExplanationsEnabled(): boolean {
  return envBool('FINANCE_AI_EXPLANATIONS_ENABLED', false);
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
