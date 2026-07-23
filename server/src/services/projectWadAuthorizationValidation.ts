export type WadBudgetInput = {
  departments?: Array<{
    department?: string;
    hours?: number;
    chargeCodeId?: number | null;
    zeroBudgetJustification?: string | null;
  }>;
  materialBudget?: number | null;
  outsideProcessingBudget?: number | null;
  toolingNreBudget?: number | null;
  warningThreshold?: number | null;
  blockingThreshold?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  risks?: Array<{
    description?: string;
    owner?: string;
    control?: string;
  }>;
  responsibleOwners?: string[];
};

const text = (value: unknown) => String(value ?? '').trim();

export function wadBudgetBlockers(input: WadBudgetInput): string[] {
  const blockers: string[] = [];
  const departments = input.departments ?? [];
  if (!departments.length)
    blockers.push('At least one responsible department is required.');
  for (const entry of departments) {
    const department = text(entry.department) || 'Unnamed department';
    if (!text(entry.department))
      blockers.push('Every department requires a name.');
    if (!entry.chargeCodeId)
      blockers.push(`${department}: an active charge code is required.`);
    if (entry.hours == null || entry.hours < 0)
      blockers.push(
        `${department}: labor budget hours must be zero or greater.`
      );
    if (entry.hours === 0 && !text(entry.zeroBudgetJustification))
      blockers.push(`${department}: zero-budget work requires justification.`);
  }
  if (input.materialBudget == null || input.materialBudget < 0)
    blockers.push('A non-negative material budget is required.');
  if (
    input.outsideProcessingBudget == null ||
    input.outsideProcessingBudget < 0
  )
    blockers.push(
      'Outside-processing budget must be addressed with a non-negative value.'
    );
  if (input.toolingNreBudget != null && input.toolingNreBudget < 0)
    blockers.push('Tooling/NRE budget cannot be negative.');
  if (!text(input.startDate) || !text(input.dueDate))
    blockers.push('WAD start and due dates are required.');
  if (!input.risks?.length)
    blockers.push('At least one project risk and control is required.');
  for (const risk of input.risks ?? []) {
    if (!text(risk.description) || !text(risk.owner) || !text(risk.control))
      blockers.push('Every risk requires a description, owner and control.');
  }
  if (!input.responsibleOwners?.some(text))
    blockers.push('At least one responsible owner is required.');
  if (
    input.warningThreshold != null &&
    input.blockingThreshold != null &&
    (input.warningThreshold < 0 ||
      input.warningThreshold >= input.blockingThreshold)
  )
    blockers.push(
      'Warning threshold must be non-negative and less than the blocking threshold.'
    );
  return Array.from(new Set(blockers));
}

export function inheritedRequirementBlockers(
  items: Array<Record<string, unknown>>
): string[] {
  const blockers: string[] = [];
  const manufactured = items.filter((item) => item.is_manufactured === true);
  if (!manufactured.length)
    blockers.push('Released Production Plan has no manufactured items.');
  for (const item of manufactured) {
    const part = text(item.part_number) || 'Manufactured item';
    for (const [field, label] of [
      ['routing_requirement', 'routing decision'],
      ['traveler_requirement', 'traveler decision'],
      ['work_instruction_requirement', 'work-instruction decision'],
      ['inspection_requirement', 'inspection strategy'],
      ['fai_requirement', 'FAI decision'],
      ['traceability_level', 'traceability requirement'],
      ['special_process_source', 'special-process decision'],
      ['packaging_instruction_requirement', 'packaging decision'],
    ] as const) {
      if (!text(item[field]))
        blockers.push(`${part}: inherited ${label} is missing.`);
    }
    if (
      item.inspection_extent === 'APPROVED_SAMPLING' &&
      !text(item.sampling_plan_id)
    )
      blockers.push(`${part}: approved sampling requires a sampling-plan ID.`);
  }
  return blockers;
}
