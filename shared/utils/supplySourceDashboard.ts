export type ManufacturedCategory = 'PACKET' | 'KIT' | 'MACHINED_PART' | 'CORE' | 'SUB_ASSEMBLY' | 'ASSEMBLY';
export type SupplySourceDashboard = 'CUTTING_TABLE' | 'CNC' | 'CORE' | 'ASSEMBLY';

const CATEGORY_TO_DASHBOARD: Record<ManufacturedCategory, SupplySourceDashboard> = {
  PACKET: 'CUTTING_TABLE',
  KIT: 'CUTTING_TABLE',
  MACHINED_PART: 'CNC',
  CORE: 'CORE',
  SUB_ASSEMBLY: 'ASSEMBLY',
  ASSEMBLY: 'ASSEMBLY',
};

const DASHBOARD_TO_LEGACY_DEPT: Record<SupplySourceDashboard, string> = {
  CUTTING_TABLE: 'Cutting Table',
  CNC: 'CNC',
  CORE: 'Cores',
  ASSEMBLY: 'Assembly',
};

export function getSupplySourceDashboard(
  category: ManufacturedCategory | null | undefined,
): SupplySourceDashboard | null {
  if (!category) return null;
  return CATEGORY_TO_DASHBOARD[category] ?? null;
}

export function supplySourceDashboardToLegacyDept(
  dashboard: SupplySourceDashboard | null,
): string | null {
  if (!dashboard) return null;
  return DASHBOARD_TO_LEGACY_DEPT[dashboard] ?? null;
}

const DASHBOARD_TO_CATEGORIES: Record<SupplySourceDashboard, ManufacturedCategory[]> = {
  CUTTING_TABLE: ['PACKET', 'KIT'],
  CNC: ['MACHINED_PART'],
  CORE: ['CORE'],
  ASSEMBLY: ['ASSEMBLY', 'SUB_ASSEMBLY'],
};

export function getDashboardCategories(dashboard: SupplySourceDashboard): ManufacturedCategory[] {
  return DASHBOARD_TO_CATEGORIES[dashboard] ?? [];
}
