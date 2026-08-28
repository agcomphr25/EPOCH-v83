export type P2ActivationFlag = {
  key: string;
  clientKey?: string;
  label: string;
  phase: number;
  mode: 'READ' | 'WRITE' | 'RELEASE' | 'INTEGRATION';
  dependsOn: string[];
};

const flag = (
  key: string,
  label: string,
  phase: number,
  mode: P2ActivationFlag['mode'],
  dependsOn: string[] = [],
  clientKey?: string
): P2ActivationFlag => ({ key, clientKey, label, phase, mode, dependsOn });

export const P2_ACTIVATION_FLAGS: readonly P2ActivationFlag[] = [
  flag(
    'SHARED_INVENTORY_DEPARTMENT_READS_ENABLED',
    'Shared Departments',
    1,
    'READ',
    [],
    'VITE_SHARED_INVENTORY_DEPARTMENT_READS_ENABLED'
  ),
  flag(
    'SHARED_INVENTORY_DEPARTMENT_WRITES_ENABLED',
    'Department administration',
    1,
    'WRITE',
    ['SHARED_INVENTORY_DEPARTMENT_READS_ENABLED'],
    'VITE_SHARED_INVENTORY_DEPARTMENT_WRITES_ENABLED'
  ),
  flag(
    'STABLE_ROUTING_INVENTORY_ITEM_FK_ENABLED',
    'Item-linked routings',
    1,
    'INTEGRATION',
    []
  ),
  flag(
    'ROUTING_OPERATION_DEPARTMENT_IDS_ENABLED',
    'Routing Departments',
    1,
    'INTEGRATION',
    [
      'SHARED_INVENTORY_DEPARTMENT_READS_ENABLED',
      'STABLE_ROUTING_INVENTORY_ITEM_FK_ENABLED',
    ]
  ),
  flag(
    'INVENTORY_TRACEABILITY_POLICY_READS_ENABLED',
    'Traceability policies',
    2,
    'READ',
    [],
    'VITE_INVENTORY_TRACEABILITY_POLICY_READS_ENABLED'
  ),
  flag(
    'INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED',
    'Traceability policy control',
    2,
    'WRITE',
    ['INVENTORY_TRACEABILITY_POLICY_READS_ENABLED'],
    'VITE_INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED'
  ),
  flag(
    'CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED',
    'Controlled BOMs',
    2,
    'READ',
    [],
    'VITE_CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED'
  ),
  flag(
    'CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED',
    'Controlled BOM authoring',
    2,
    'WRITE',
    ['CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED'],
    'VITE_CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED'
  ),
  flag(
    'P2_CONFIGURATION_BOM_INTEGRATION_ENABLED',
    'Project BOM integration',
    2,
    'INTEGRATION',
    ['CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED'],
    'VITE_P2_CONFIGURATION_BOM_INTEGRATION_ENABLED'
  ),
  flag(
    'P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED',
    'Released project configuration',
    3,
    'READ',
    ['P2_CONFIGURATION_BOM_INTEGRATION_ENABLED'],
    'VITE_P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED'
  ),
  flag(
    'P2_PROJECT_CONTROLLED_CONFIGURATION_WRITES_ENABLED',
    'Project configuration control',
    3,
    'WRITE',
    ['P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED'],
    'VITE_P2_PROJECT_CONTROLLED_CONFIGURATION_WRITES_ENABLED'
  ),
  flag(
    'P2_WAD_TRAVELER_DECISION_READS_ENABLED',
    'WAD traveler decisions',
    4,
    'READ',
    ['P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED'],
    'VITE_P2_WAD_TRAVELER_DECISION_READS_ENABLED'
  ),
  flag(
    'P2_WAD_TRAVELER_DECISION_WRITES_ENABLED',
    'WAD decision control',
    4,
    'WRITE',
    ['P2_WAD_TRAVELER_DECISION_READS_ENABLED'],
    'VITE_P2_WAD_TRAVELER_DECISION_WRITES_ENABLED'
  ),
  flag(
    'P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED',
    'Frozen production demand',
    5,
    'READ',
    [
      'P2_PROJECT_CONTROLLED_CONFIGURATION_READS_ENABLED',
      'P2_WAD_TRAVELER_DECISION_READS_ENABLED',
    ],
    'VITE_P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED'
  ),
  flag(
    'P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED',
    'Demand compilation',
    5,
    'WRITE',
    ['P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED'],
    'VITE_P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED'
  ),
  flag(
    'P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED',
    'Demand release',
    5,
    'RELEASE',
    ['P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED'],
    'VITE_P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED'
  ),
  flag(
    'P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED',
    'Department work queues',
    6,
    'READ',
    ['P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED'],
    'VITE_P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED'
  ),
  flag(
    'P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED',
    'Work-order provisioning',
    6,
    'WRITE',
    ['P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED'],
    'VITE_P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED'
  ),
  flag(
    'P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED',
    'Work-order execution',
    6,
    'WRITE',
    ['P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED'],
    'VITE_P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED'
  ),
  flag(
    'P2_TRAVELER_PROVISIONING_WRITES_ENABLED',
    'Traveler provisioning',
    7,
    'WRITE',
    [
      'P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED',
      'P2_WAD_TRAVELER_DECISION_READS_ENABLED',
    ],
    'VITE_P2_TRAVELER_PROVISIONING_WRITES_ENABLED'
  ),
  flag(
    'P2_RECEIVING_BARCODE_IDENTITIES_ENABLED',
    'Receiving identities and labels',
    8,
    'WRITE',
    ['INVENTORY_TRACEABILITY_POLICY_READS_ENABLED'],
    'VITE_P2_RECEIVING_BARCODE_IDENTITIES_ENABLED'
  ),
  flag(
    'P2_MATERIAL_CONSUMPTION_READS_ENABLED',
    'Material issue evidence',
    9,
    'READ',
    [
      'P2_TRAVELER_PROVISIONING_WRITES_ENABLED',
      'P2_RECEIVING_BARCODE_IDENTITIES_ENABLED',
    ],
    'VITE_P2_MATERIAL_CONSUMPTION_READS_ENABLED'
  ),
  flag(
    'P2_MATERIAL_CONSUMPTION_WRITES_ENABLED',
    'Material issue and consumption',
    9,
    'WRITE',
    ['P2_MATERIAL_CONSUMPTION_READS_ENABLED'],
    'VITE_P2_MATERIAL_CONSUMPTION_WRITES_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_OUTPUT_READS_ENABLED',
    'Manufactured output',
    10,
    'READ',
    ['P2_MATERIAL_CONSUMPTION_READS_ENABLED'],
    'VITE_P2_MANUFACTURED_OUTPUT_READS_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_OUTPUT_WRITES_ENABLED',
    'Manufactured completion',
    10,
    'WRITE',
    [
      'P2_MANUFACTURED_OUTPUT_READS_ENABLED',
      'P2_MATERIAL_CONSUMPTION_WRITES_ENABLED',
    ],
    'VITE_P2_MANUFACTURED_OUTPUT_WRITES_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED',
    'Output custody',
    10,
    'READ',
    ['P2_MANUFACTURED_OUTPUT_READS_ENABLED'],
    'VITE_P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED',
    'Output custody receipt',
    10,
    'WRITE',
    [
      'P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED',
      'P2_MANUFACTURED_OUTPUT_WRITES_ENABLED',
    ],
    'VITE_P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED',
    'Component genealogy',
    11,
    'READ',
    ['P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED'],
    'VITE_P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED'
  ),
  flag(
    'P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED',
    'Component issue to parent',
    11,
    'WRITE',
    [
      'P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED',
      'P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED',
    ],
    'VITE_P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED'
  ),
  flag(
    'P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED',
    'Quality and shipment status',
    12,
    'READ',
    ['P2_MANUFACTURED_OUTPUT_CUSTODY_READS_ENABLED'],
    'VITE_P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED'
  ),
  flag(
    'P2_QUALITY_SHIPMENT_RELEASE_WRITES_ENABLED',
    'Quality acceptance and shipment eligibility',
    12,
    'WRITE',
    [
      'P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED',
      'P2_MANUFACTURED_OUTPUT_CUSTODY_WRITES_ENABLED',
    ],
    'VITE_P2_QUALITY_SHIPMENT_RELEASE_WRITES_ENABLED'
  ),
  flag(
    'P2_GENEALOGY_VIEWER_ENABLED',
    'Genealogy search and evidence reports',
    13,
    'READ',
    [
      'P2_MATERIAL_CONSUMPTION_READS_ENABLED',
      'P2_MANUFACTURED_COMPONENT_ISSUE_READS_ENABLED',
      'P2_QUALITY_SHIPMENT_RELEASE_READS_ENABLED',
    ],
    'VITE_P2_GENEALOGY_VIEWER_ENABLED'
  ),
];

const exactTrue = (value: string | undefined) => value === 'true';

export function evaluateP2ActivationFlags(
  env: Record<string, string | undefined> = process.env
) {
  const states = P2_ACTIVATION_FLAGS.map((entry) => {
    const serverEnabled = exactTrue(env[entry.key]);
    const clientEnabled = entry.clientKey
      ? exactTrue(env[entry.clientKey])
      : serverEnabled;
    const missingDependencies = entry.dependsOn.filter(
      (key) => !exactTrue(env[key])
    );
    const mismatch =
      Boolean(entry.clientKey) && serverEnabled !== clientEnabled;
    const ready =
      !serverEnabled || (!mismatch && missingDependencies.length === 0);
    return {
      ...entry,
      serverEnabled,
      clientEnabled,
      mismatch,
      missingDependencies,
      ready,
    };
  });
  const blockers = states.flatMap((state) => {
    if (!state.serverEnabled && !state.clientEnabled) return [];
    if (state.mismatch)
      return [
        {
          key: state.key,
          reason: `${state.label} client and server settings disagree.`,
          correction:
            'Set both settings to exact lowercase true, or disable both.',
        },
      ];
    if (state.missingDependencies.length)
      return [
        {
          key: state.key,
          reason: `${state.label} is missing prerequisite settings.`,
          correction: `Enable and certify: ${state.missingDependencies.join(', ')}`,
        },
      ];
    return [];
  });
  return {
    environment: env.P2_CONTROLLED_PILOT_ENVIRONMENT || 'PRODUCTION_DISABLED',
    productionActivationAutomatic: false,
    ready: blockers.length === 0,
    enabledCount: states.filter((state) => state.serverEnabled).length,
    totalCount: states.length,
    blockers,
    states,
  };
}
