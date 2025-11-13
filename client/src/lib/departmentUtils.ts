/**
 * Normalize department names to handle legacy naming and variations
 */
export const normalizeDepartmentName = (
  dept: string | undefined | null
): string => {
  if (!dept) return '';

  const normalized = dept.trim().toLowerCase().replace(/['"]/g, '');

  // Handle Gunsmith variations (gunsmit, gun, etc.)
  if (normalized.startsWith('gun')) {
    return 'gunsmith';
  }

  // Map legacy department names to current departments
  const legacyMapping: Record<string, string> = {
    'shipping manager': 'fulfilled',
    'shipping management': 'fulfilled',
    qc: 'shipping qc',
    finishqc: 'finish qc',
  };

  return legacyMapping[normalized] || normalized;
};

/**
 * Check if an order is in a specific department
 * Handles both currentDepartment and legacy department fields
 * Also handles P1 PO items (production orders) that use productionStatus instead of status
 */
export const isOrderInDepartment = (
  order: any,
  departmentName: string,
  checkLegacy: boolean = true
): boolean => {
  const normalizedTarget = normalizeDepartmentName(departmentName);
  const normalizedCurrent = normalizeDepartmentName(order?.currentDepartment);
  const normalizedLegacy = normalizeDepartmentName(order?.department);

  // Check currentDepartment field with status validation
  if (normalizedCurrent === normalizedTarget) {
    // P1 PO items (production orders) use productionStatus instead of status
    // If this is a production order, show it as long as it's in the correct department
    if (order?.productionStatus) {
      return true;
    }
    
    // For regular orders, only show orders that are FINALIZED or IN_PROGRESS
    return order?.status === 'FINALIZED' || order?.status === 'IN_PROGRESS';
  }

  // Check legacy department field if enabled
  if (
    checkLegacy &&
    normalizedLegacy === normalizedTarget &&
    order?.status === 'IN_PROGRESS'
  ) {
    return true;
  }

  return false;
};
