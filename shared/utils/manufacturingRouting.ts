export type ManufacturedCategory =
  | 'PACKET'
  | 'FOAM_CUTTING'
  | 'THREE_D_PRINTING_CUTTING'
  | 'KIT'
  | 'MACHINED_PART'
  | 'CORE'
  | 'SUB_ASSEMBLY'
  | 'ASSEMBLY'
  | 'FINAL_ASSEMBLY'
  | 'COMPOSITE'
  | 'COMPONENT';

export type ManufacturingQueueType =
  | 'CUTTING_TABLE'
  | 'KIT'
  | 'CNC'
  | 'CORE'
  | 'SUB_ASSEMBLY'
  | 'ASSEMBLY'
  | 'FINAL_ASSEMBLY'
  | 'LAYUP';

export type ManufacturingSwimlane =
  | 'CUTTING_TABLE_DEMAND'
  | 'KITTING'
  | 'CNC'
  | 'CORE'
  | 'SUB_ASSEMBLY'
  | 'ASSEMBLY'
  | 'FINAL_ASSEMBLY'
  | 'LAYUP';

export type SupplySourceDashboard =
  | 'CUTTING_TABLE'
  | 'KITTING'
  | 'CNC'
  | 'CORE'
  | 'SUB_ASSEMBLY'
  | 'ASSEMBLY'
  | 'FINAL_ASSEMBLY'
  | 'LAYUP';

export interface ManufacturingRouteDefinition {
  category: ManufacturedCategory;
  displayName: string;
  dashboard: SupplySourceDashboard | null;
  queueType: ManufacturingQueueType | null;
  swimlane: ManufacturingSwimlane | null;
  department: string | null;
  canRelease: boolean;
  includeInBomExplosion: boolean;
}

export const MANUFACTURING_ROUTE_DEFINITIONS: Record<ManufacturedCategory, ManufacturingRouteDefinition> = {
  PACKET: {
    category: 'PACKET',
    displayName: 'Packet',
    dashboard: 'CUTTING_TABLE',
    queueType: 'CUTTING_TABLE',
    swimlane: 'CUTTING_TABLE_DEMAND',
    department: 'Cutting Table',
    canRelease: true,
    includeInBomExplosion: true,
  },
  FOAM_CUTTING: {
    category: 'FOAM_CUTTING',
    displayName: 'Foam Cutting',
    dashboard: 'CUTTING_TABLE',
    queueType: 'CUTTING_TABLE',
    swimlane: 'CUTTING_TABLE_DEMAND',
    department: 'Cutting Table',
    canRelease: true,
    includeInBomExplosion: true,
  },
  THREE_D_PRINTING_CUTTING: {
    category: 'THREE_D_PRINTING_CUTTING',
    displayName: '3d Printing/Cutting',
    dashboard: 'CUTTING_TABLE',
    queueType: 'CUTTING_TABLE',
    swimlane: 'CUTTING_TABLE_DEMAND',
    department: 'Cutting Table',
    canRelease: true,
    includeInBomExplosion: true,
  },
  KIT: {
    category: 'KIT',
    displayName: 'Kitting',
    dashboard: 'KITTING',
    queueType: 'KIT',
    swimlane: 'KITTING',
    department: 'Kitting',
    canRelease: true,
    includeInBomExplosion: true,
  },
  MACHINED_PART: {
    category: 'MACHINED_PART',
    displayName: 'Machined Part',
    dashboard: 'CNC',
    queueType: 'CNC',
    swimlane: 'CNC',
    department: 'CNC',
    canRelease: true,
    includeInBomExplosion: true,
  },
  CORE: {
    category: 'CORE',
    displayName: 'Core',
    dashboard: 'CORE',
    queueType: 'CORE',
    swimlane: 'CORE',
    department: 'Core',
    canRelease: true,
    includeInBomExplosion: true,
  },
  SUB_ASSEMBLY: {
    category: 'SUB_ASSEMBLY',
    displayName: 'Sub-Assembly',
    dashboard: 'SUB_ASSEMBLY',
    queueType: 'SUB_ASSEMBLY',
    swimlane: 'SUB_ASSEMBLY',
    department: 'Sub Assembly',
    canRelease: true,
    includeInBomExplosion: true,
  },
  ASSEMBLY: {
    category: 'ASSEMBLY',
    displayName: 'Assembly',
    dashboard: 'ASSEMBLY',
    queueType: 'ASSEMBLY',
    swimlane: 'ASSEMBLY',
    department: 'Assembly',
    canRelease: true,
    includeInBomExplosion: true,
  },
  FINAL_ASSEMBLY: {
    category: 'FINAL_ASSEMBLY',
    displayName: 'Final Assembly',
    dashboard: 'FINAL_ASSEMBLY',
    queueType: 'FINAL_ASSEMBLY',
    swimlane: 'FINAL_ASSEMBLY',
    department: 'Assembly',
    canRelease: true,
    includeInBomExplosion: true,
  },
  COMPOSITE: {
    category: 'COMPOSITE',
    displayName: 'Composite',
    dashboard: 'LAYUP',
    queueType: 'LAYUP',
    swimlane: 'LAYUP',
    department: 'Layup',
    canRelease: true,
    includeInBomExplosion: true,
  },
  COMPONENT: {
    category: 'COMPONENT',
    displayName: 'Component',
    dashboard: null,
    queueType: null,
    swimlane: null,
    department: null,
    canRelease: false,
    includeInBomExplosion: false,
  },
};

const MANUFACTURING_DEPARTMENT_IDENTITY_GROUPS: readonly (readonly string[])[] = [
  ['kitting', 'kit', 'kits'],
  ['core', 'cores'],
  ['subassembly', 'subassemblies', 'subassy'],
];

export function normalizeManufacturingDepartmentIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function getManufacturingDepartmentIdentities(
  department: string,
): string[] {
  const normalized = normalizeManufacturingDepartmentIdentity(department);
  const aliases = MANUFACTURING_DEPARTMENT_IDENTITY_GROUPS.find((group) =>
    group.includes(normalized),
  );
  return aliases ? [...aliases] : [normalized];
}

export function getManufacturingRouteDefinition(
  category: ManufacturedCategory | null | undefined,
): ManufacturingRouteDefinition | null {
  if (!category) return null;
  return MANUFACTURING_ROUTE_DEFINITIONS[category] ?? null;
}

export function getManufacturingCategoriesForDashboard(
  dashboard: SupplySourceDashboard,
): ManufacturedCategory[] {
  return Object.values(MANUFACTURING_ROUTE_DEFINITIONS)
    .filter((route) => route.dashboard === dashboard)
    .map((route) => route.category);
}

export function getManufacturingCategoriesForDepartment(department: string): ManufacturedCategory[] {
  const identities = new Set(getManufacturingDepartmentIdentities(department));
  return Object.values(MANUFACTURING_ROUTE_DEFINITIONS)
    .filter(
      (route) =>
        route.department !== null &&
        identities.has(normalizeManufacturingDepartmentIdentity(route.department)),
    )
    .map((route) => route.category);
}
