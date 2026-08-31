export interface WadDepartmentRecord {
  id: number;
  name: string;
  departmentCode: string | null;
  productionEnabled: boolean;
}

export interface WadDepartmentOption {
  key: string;
  label: string;
  isSpecialProcess: boolean;
  requiresCertification: boolean;
  isHistorical?: boolean;
}

export const LEGACY_WAD_DEPARTMENTS: WadDepartmentOption[] = [
  { key: 'CUTTING_KITTING', label: 'Cutting / Kitting', isSpecialProcess: false, requiresCertification: false },
  { key: 'LAYUP', label: 'Layup', isSpecialProcess: true, requiresCertification: true },
  { key: 'CURE', label: 'Cure', isSpecialProcess: true, requiresCertification: true },
  { key: 'CNC', label: 'CNC', isSpecialProcess: false, requiresCertification: false },
  { key: 'SUB_ASSEMBLY', label: 'Sub Assembly', isSpecialProcess: false, requiresCertification: false },
  { key: 'ASSEMBLY', label: 'Assembly', isSpecialProcess: false, requiresCertification: false },
  { key: 'FINISH', label: 'Finish', isSpecialProcess: false, requiresCertification: false },
  { key: 'PAINT', label: 'Paint', isSpecialProcess: true, requiresCertification: true },
  { key: 'QC', label: 'Quality Control', isSpecialProcess: false, requiresCertification: false },
  { key: 'SHIPPING', label: 'Shipping', isSpecialProcess: false, requiresCertification: false },
];

const normalize = (value: string) => value.trim().toLowerCase();

export function buildWadDepartmentOptions(departments: WadDepartmentRecord[], selected: string[]): WadDepartmentOption[] {
  const options = departments.filter((department) => department.productionEnabled).map((department) => {
    const legacy = LEGACY_WAD_DEPARTMENTS.find((candidate) =>
      normalize(candidate.key) === normalize(department.departmentCode ?? '') ||
      normalize(candidate.label) === normalize(department.name)
    );
    const existingValue = selected.find((value) =>
      normalize(value) === normalize(department.departmentCode ?? '') ||
      normalize(value) === normalize(department.name) ||
      (legacy && normalize(value) === normalize(legacy.key))
    );
    return {
      key: (existingValue ?? department.departmentCode?.trim()) || department.name,
      label: department.name,
      isSpecialProcess: legacy?.isSpecialProcess ?? false,
      requiresCertification: legacy?.requiresCertification ?? false,
    };
  });

  const represented = new Set(options.map((option) => normalize(option.key)));
  for (const value of selected) {
    if (!value.trim() || represented.has(normalize(value))) continue;
    const legacy = LEGACY_WAD_DEPARTMENTS.find((candidate) => normalize(candidate.key) === normalize(value));
    options.push({
      key: value,
      label: legacy?.label ?? value,
      isSpecialProcess: legacy?.isSpecialProcess ?? false,
      requiresCertification: legacy?.requiresCertification ?? false,
      isHistorical: true,
    });
  }
  return options;
}

export interface BreakdownHours { department: string; estimatedHours: number }
export interface BudgetHours { department: string; budgetedHours: number }

export function syncUnmodifiedBudgetHours<T extends BudgetHours>(
  current: T[], breakdown: BreakdownHours[], previousBreakdown: BreakdownHours[]
): T[] {
  const nextHours = new Map(breakdown.map((row) => [row.department, row.estimatedHours]));
  const previousHours = new Map(previousBreakdown.map((row) => [row.department, row.estimatedHours]));
  let changed = false;
  const result = current.map((row) => {
    const next = nextHours.get(row.department);
    if (next === undefined) return row;
    const followsBreakdown = row.budgetedHours <= 0 || row.budgetedHours === previousHours.get(row.department);
    if (!followsBreakdown || row.budgetedHours === next) return row;
    changed = true;
    return { ...row, budgetedHours: next };
  });
  return changed ? result : current;
}
