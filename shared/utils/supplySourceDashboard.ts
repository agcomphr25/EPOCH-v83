import {
  getManufacturingCategoriesForDashboard,
  getManufacturingRouteDefinition,
  type ManufacturedCategory,
  type SupplySourceDashboard,
} from './manufacturingRouting';

export type {
  ManufacturedCategory,
  SupplySourceDashboard,
} from './manufacturingRouting';

export {
  getManufacturingCategoriesForDashboard,
  getManufacturingCategoriesForDashboard as getDashboardCategories,
  getManufacturingCategoriesForDepartment,
  getManufacturingRouteDefinition,
} from './manufacturingRouting';

export function getSupplySourceDashboard(
  category: ManufacturedCategory | null | undefined,
): SupplySourceDashboard | null {
  return getManufacturingRouteDefinition(category)?.dashboard ?? null;
}

export function supplySourceDashboardToLegacyDept(
  dashboard: SupplySourceDashboard | null,
): string | null {
  if (!dashboard) return null;
  const route = getManufacturingCategoriesForDashboard(dashboard)
    .map((category) => getManufacturingRouteDefinition(category))
    .find((definition) => definition?.department);
  return route?.department ?? null;
}
