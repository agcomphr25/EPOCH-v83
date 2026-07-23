import {
  getP2V2StagesForDefinitionVersion,
  P2_V2_DEFINITION_VERSION,
} from './projectWorkflowRegistry';

type Row = Record<string, unknown>;

export type WorkflowIntegrityIssue = {
  code:
    | 'MISSING_STAGE'
    | 'DUPLICATE_STAGE'
    | 'DUPLICATE_ORDER'
    | 'PROJECT_MISMATCH'
    | 'UNKNOWN_STEP_TYPE'
    | 'REGISTRY_DEFINITION_MISMATCH'
    | 'WRONG_WORKFLOW_VERSION';
  message: string;
};

export function validateWorkflowInstanceIntegrity(
  instance: Row,
  steps: Row[]
): WorkflowIntegrityIssue[] {
  const issues: WorkflowIntegrityIssue[] = [];
  if (instance.workflow_version !== 'p2_v2')
    issues.push({
      code: 'WRONG_WORKFLOW_VERSION',
      message: 'Workflow instance is not p2_v2.',
    });
  let definition: ReturnType<typeof getP2V2StagesForDefinitionVersion>;
  try {
    definition = getP2V2StagesForDefinitionVersion(
      Number(instance.definition_version)
    );
  } catch {
    issues.push({
      code: 'REGISTRY_DEFINITION_MISMATCH',
      message: `Unknown p2_v2 definition version ${String(instance.definition_version)}.`,
    });
    return issues;
  }
  const byType = new Map<string, Row[]>();
  const byOrder = new Map<number, Row[]>();
  for (const step of steps) {
    const type = String(step.step_type);
    const order = Number(step.step_order);
    byType.set(type, [...(byType.get(type) ?? []), step]);
    byOrder.set(order, [...(byOrder.get(order) ?? []), step]);
    if (step.project_id !== instance.project_id)
      issues.push({
        code: 'PROJECT_MISMATCH',
        message: `Stage ${type} belongs to a different project.`,
      });
    if (!definition.some((stage) => stage.type === type))
      issues.push({
        code: 'UNKNOWN_STEP_TYPE',
        message: `Unknown p2_v2 stage ${type}.`,
      });
  }
  for (const stage of definition) {
    const matches = byType.get(stage.type) ?? [];
    if (matches.length === 0)
      issues.push({
        code: 'MISSING_STAGE',
        message: `Missing stage ${stage.type}.`,
      });
    if (matches.length > 1)
      issues.push({
        code: 'DUPLICATE_STAGE',
        message: `Duplicate stage ${stage.type}.`,
      });
    if (
      matches.some(
        (stored) =>
          Number(stored.step_order) !== stage.order ||
          stored.label_snapshot !== stage.label ||
          stored.description_snapshot !== stage.description
      )
    ) {
      issues.push({
        code: 'REGISTRY_DEFINITION_MISMATCH',
        message: `Stage ${stage.type} does not match definition version ${String(instance.definition_version ?? P2_V2_DEFINITION_VERSION)}.`,
      });
    }
  }
  for (const [order, matches] of Array.from(byOrder))
    if (matches.length > 1)
      issues.push({
        code: 'DUPLICATE_ORDER',
        message: `Duplicate stage order ${order}.`,
      });
  return issues;
}
