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
    if (first) return clean(first);
  }
  return routingExists ? null : 'Layup';
}
