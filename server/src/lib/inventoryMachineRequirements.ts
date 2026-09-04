import { getInventoryMachineRequirementIssues } from '@shared/utils/inventoryMachineRequirements';

type InventoryMachineRequirementState = {
  manufacturedCategory?: string | null;
  machineType?: string | null;
  machiningTimeMinutes?: number | string | null;
};

const MACHINE_REQUIREMENT_FIELDS = [
  'manufacturedCategory',
  'machineType',
  'machiningTimeMinutes',
] as const;

function assertInventoryMachineRequirements(
  values: InventoryMachineRequirementState
) {
  const [issue] = getInventoryMachineRequirementIssues(values);
  if (issue) throw new Error(issue.message);
}

export function assertInventoryMachineRequirementsForCreate(
  item: InventoryMachineRequirementState
) {
  assertInventoryMachineRequirements(item);
}

export function assertInventoryMachineRequirementsForUpdate(
  updates: InventoryMachineRequirementState,
  existingItem?: InventoryMachineRequirementState | null
) {
  const touchesMachineRequirement = MACHINE_REQUIREMENT_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(updates, field)
  );
  if (!touchesMachineRequirement) return;

  assertInventoryMachineRequirements({
    ...existingItem,
    ...updates,
  });
}
