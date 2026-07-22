export class ProjectProductionPlanningError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ProjectProductionPlanningError';
  }
}

export type PlanningItem = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '').trim();
const list = (value: unknown) => (Array.isArray(value) ? value : []);

export function productionPlanItemBlockers(item: PlanningItem): string[] {
  if (!item.is_manufactured) return [];
  const part = text(item.part_number) || 'Unknown part';
  const blockers: string[] = [];
  if (
    item.bom_release_status !== 'RELEASED' &&
    item.bom_release_status !== 'NOT_REQUIRED_APPROVED'
  )
    blockers.push(
      `${part}: released BOM or approved BOM N/A decision required.`
    );
  if (!item.routing_requirement)
    blockers.push(`${part}: routing decision required.`);
  if (
    item.routing_requirement === 'REQUIRED' &&
    item.routing_release_status !== 'RELEASED'
  )
    blockers.push(`${part}: approved/released routing required.`);
  if (
    item.routing_requirement === 'NOT_REQUIRED_APPROVED' &&
    !text(item.routing_not_required_reason)
  )
    blockers.push(`${part}: routing N/A reason required.`);
  if (!item.traveler_requirement)
    blockers.push(`${part}: traveler decision required.`);
  if (
    item.traveler_requirement === 'REQUIRED' &&
    !['INDIVIDUAL', 'BATCH', 'LOT'].includes(text(item.traveler_type))
  )
    blockers.push(`${part}: traveler type required.`);
  if (
    item.traveler_requirement === 'NOT_REQUIRED_APPROVED' &&
    !text(item.traveler_not_required_reason)
  )
    blockers.push(`${part}: traveler N/A reason required.`);
  if (!item.work_instruction_requirement)
    blockers.push(`${part}: work-instruction decision required.`);
  if (
    ['DRAWING_SPEC_SUFFICIENT', 'NOT_REQUIRED_APPROVED'].includes(
      text(item.work_instruction_requirement)
    ) &&
    !text(item.work_instruction_basis)
  )
    blockers.push(`${part}: work-instruction decision basis required.`);
  if (!item.inspection_extent)
    blockers.push(`${part}: inspection strategy required.`);
  if (
    item.inspection_extent === 'APPROVED_SAMPLING' &&
    (!text(item.sampling_plan_id) ||
      text(item.sampling_plan_status).toUpperCase() !== 'APPROVED')
  )
    blockers.push(`${part}: approved sampling plan required.`);
  if (!item.fai_requirement) blockers.push(`${part}: FAI decision required.`);
  if (item.fai_requirement === 'NOT_REQUIRED' && !text(item.fai_reason))
    blockers.push(`${part}: FAI N/A reason required.`);
  if (!item.traceability_level)
    blockers.push(`${part}: traceability decision required.`);
  if (!item.special_process_source)
    blockers.push(`${part}: special-process decision required.`);
  if (
    item.special_process_source !== 'NONE' &&
    list(item.special_process_requirements).length === 0
  )
    blockers.push(`${part}: special-process requirements required.`);
  if (!Array.isArray(item.required_certifications))
    blockers.push(`${part}: certification decision required.`);
  if (!Array.isArray(item.required_test_records))
    blockers.push(`${part}: test-record decision required.`);
  if (
    !Array.isArray(item.tooling_requirements) ||
    !Array.isArray(item.cnc_program_requirements)
  )
    blockers.push(`${part}: tooling/program decisions required.`);
  if (!item.packaging_instruction_requirement)
    blockers.push(`${part}: packaging decision required.`);
  if (
    item.packaging_instruction_requirement === 'REQUIRED' &&
    !text(item.packaging_instruction_reference)
  )
    blockers.push(`${part}: packaging instruction reference required.`);
  if (
    item.packaging_instruction_requirement === 'NOT_REQUIRED_APPROVED' &&
    !text(item.notes)
  )
    blockers.push(`${part}: packaging N/A reason required.`);
  return blockers;
}
