/**
 * Normalize department names to handle legacy naming and variations
 */
export const normalizeDepartmentName = (dept: string | undefined | null): string => {
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
    'qc': 'shipping qc',
    'finishqc': 'finish qc',
  };
  
  return legacyMapping[normalized] || normalized;
};

/**
 * Check if an order is in a specific department
 * Handles both currentDepartment and legacy department fields
 */
export const isOrderInDepartment = (
  order: any, 
  departmentName: string,
  checkLegacy: boolean = true
): boolean => {
  const normalizedTarget = normalizeDepartmentName(departmentName);
  const normalizedCurrent = normalizeDepartmentName(order?.currentDepartment);
  const normalizedLegacy = normalizeDepartmentName(order?.department);
  
  // Check currentDepartment field
  if (normalizedCurrent === normalizedTarget) {
    return true;
  }
  
  // Check legacy department field if enabled
  if (checkLegacy && normalizedLegacy === normalizedTarget && order?.status === 'IN_PROGRESS') {
    return true;
  }
  
  return false;
};
