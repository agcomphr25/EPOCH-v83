export type ChecklistDecision = {
  key: string;
  category: string;
  label: string;
  applicability: 'REQUIRED' | 'NOT_REQUIRED' | 'NOT_APPLICABLE';
  satisfied: boolean;
  evidence?: Array<{ recordType: string; recordId: string; revision?: string }>;
  justification?: string;
  approvedJustification?: boolean;
};

const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export function checklistBlockers(checklist: ChecklistDecision[]) {
  const blockers: string[] = [];
  for (const item of checklist) {
    if (!clean(item.key) || !clean(item.category) || !clean(item.label)) {
      blockers.push(
        'Every checklist item requires a key, category, and label.'
      );
      continue;
    }
    if (item.applicability === 'REQUIRED' && !item.satisfied)
      blockers.push(`${item.category}: ${item.label}`);
    if (
      item.applicability === 'NOT_APPLICABLE' &&
      (!clean(item.justification) || !item.approvedJustification)
    )
      blockers.push(
        `${item.category}: ${item.label} requires an approved justification.`
      );
  }
  return blockers;
}

export function requiredPreproductionRoles(review: {
  supply_chain_required?: boolean;
  finance_required?: boolean;
}) {
  return [
    'PROJECT_MANAGEMENT',
    'ENGINEERING',
    'QUALITY',
    'OPERATIONS',
    ...(review.supply_chain_required ? ['SUPPLY_CHAIN'] : []),
    ...(review.finance_required ? ['FINANCE'] : []),
  ];
}

export function resolveFirstProductionDepartment(
  departmentSequence: unknown,
  routingExists: boolean
) {
  if (Array.isArray(departmentSequence)) {
    const first = departmentSequence.find(
      (department): department is string =>
        typeof department === 'string' && clean(department).length > 0
    );
    if (first) {
      const value = clean(first);
      const normalized = value.toLowerCase().replace(/[\s/_-]+/g, ' ');
      if (
        normalized === 'cutting' ||
        normalized === 'kitting' ||
        normalized === 'cutting kitting' ||
        normalized === 'cutting table'
      )
        return 'Cutting Table';
      return value;
    }
  }
  // Phase 8C is fail-closed. Legacy scheduling may still use its historical
  // Layup default, but a V2 production release must have an explicit baseline.
  return routingExists ? null : null;
}

export type PlannedManufacturedItem = {
  part_number: string;
  extended_project_quantity: unknown;
  routing_id?: string | null;
  routing_release_status?: string | null;
  department_sequence?: unknown;
};

export function plannedProductionCounts(items: PlannedManufacturedItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const partNumber = clean(item.part_number);
    const quantity = Number(item.extended_project_quantity);
    if (!partNumber || !Number.isFinite(quantity) || quantity <= 0)
      throw new Error(
        'Every manufactured plan item requires a positive quantity.'
      );
    if (
      item.routing_release_status !== 'RELEASED' ||
      !item.routing_id ||
      !resolveFirstProductionDepartment(item.department_sequence, true)
    )
      throw new Error(
        `${partNumber} requires one unambiguous released routing baseline.`
      );
    counts.set(partNumber, (counts.get(partNumber) ?? 0) + Math.ceil(quantity));
  }
  return counts;
}

export function assertProductionCountsMatchPlan(
  planned: Map<string, number>,
  actualPartNumbers: string[]
) {
  const actual = new Map<string, number>();
  for (const partNumber of actualPartNumbers)
    actual.set(partNumber, (actual.get(partNumber) ?? 0) + 1);
  const keys = new Set([
    ...Array.from(planned.keys()),
    ...Array.from(actual.keys()),
  ]);
  const mismatches = Array.from(keys)
    .filter((key) => planned.get(key) !== actual.get(key))
    .map(
      (key) =>
        `${key}: planned ${planned.get(key) ?? 0}, generated ${actual.get(key) ?? 0}`
    );
  if (mismatches.length)
    throw new Error(
      `Production records differ from the released plan: ${mismatches.join('; ')}`
    );
}
