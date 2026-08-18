export const DESIGN_CONTROL_PHASES = [
  {
    key: 'start-plan',
    order: 1,
    title: 'Start & Plan',
    stepKeys: ['1', '2'],
    explanation:
      'Define the project, responsibility, schedule, required activities, and resources.',
  },
  {
    key: 'requirements-risks',
    order: 2,
    title: 'Requirements & Risks',
    stepKeys: ['3', '4', '5'],
    explanation:
      'Confirm what the design must do, resolve unclear requirements, and control design risk.',
  },
  {
    key: 'design-outputs',
    order: 3,
    title: 'Design Outputs',
    stepKeys: ['6', '7'],
    explanation:
      'Review the design direction and link the drawings, bill of materials, specifications, and other authoritative outputs.',
  },
  {
    key: 'review-verify-validate',
    order: 4,
    title: 'Review, Verify & Validate',
    stepKeys: ['8', '9', '10'],
    explanation:
      'Review readiness, verify that the design is correct, and validate that it works for its intended use.',
  },
  {
    key: 'approve-release',
    order: 5,
    title: 'Approve & Release',
    stepKeys: ['11', '12'],
    explanation:
      'Resolve readiness blockers, obtain the required approvals, and create the Engineering Release baseline.',
  },
  {
    key: 'control-changes',
    order: 6,
    title: 'Control Changes',
    stepKeys: [],
    explanation:
      'After Engineering Release, use approved change requests and change notices to revise the controlled baseline.',
  },
] as const;

export function designControlPhaseForStep(stepKey: string) {
  return DESIGN_CONTROL_PHASES.find((phase) =>
    (phase.stepKeys as readonly string[]).includes(stepKey)
  );
}
