export const THREE_D_PRINTING_CUTTING_CATEGORY =
  'THREE_D_PRINTING_CUTTING' as const;

export type InventoryMachineRequirementField =
  | 'machineType'
  | 'machiningTimeMinutes';

export type InventoryMachineRequirementIssue = {
  field: InventoryMachineRequirementField;
  message: string;
};

type InventoryMachineRequirementValues = {
  manufacturedCategory?: string | null;
  machineType?: string | null;
  machiningTimeMinutes?: number | string | null;
};

export function inventoryCategoryUsesMachineDetails(
  manufacturedCategory?: string | null
) {
  return (
    manufacturedCategory === 'MACHINED_PART' ||
    manufacturedCategory === THREE_D_PRINTING_CUTTING_CATEGORY
  );
}

export function getInventoryMachineRequirementIssues(
  values: InventoryMachineRequirementValues
): InventoryMachineRequirementIssue[] {
  if (values.manufacturedCategory !== THREE_D_PRINTING_CUTTING_CATEGORY) {
    return [];
  }

  const issues: InventoryMachineRequirementIssue[] = [];
  if (typeof values.machineType !== 'string' || !values.machineType.trim()) {
    issues.push({
      field: 'machineType',
      message: 'Machine is required for 3d Printing/Cutting items.',
    });
  }

  const rawMinutes = values.machiningTimeMinutes;
  const hasMinutes =
    rawMinutes !== null &&
    rawMinutes !== undefined &&
    String(rawMinutes).trim() !== '';

  if (!hasMinutes) {
    issues.push({
      field: 'machiningTimeMinutes',
      message: 'Machine time is required for 3d Printing/Cutting items.',
    });
  } else {
    const minutes = Number(rawMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      issues.push({
        field: 'machiningTimeMinutes',
        message:
          'Machine time must be a whole number greater than 0 minutes for 3d Printing/Cutting items.',
      });
    }
  }

  return issues;
}
