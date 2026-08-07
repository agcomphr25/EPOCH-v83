export const DESIGN_CONTROL_PHASES = [
  {
    key: 'define-project',
    order: 1,
    title: 'Define the Project',
    stepKeys: ['1', '2'],
    explanation:
      'Describe the project, its purpose, responsibilities, plan, and required evidence.',
  },
  {
    key: 'requirements-risks',
    order: 2,
    title: 'Requirements and Risks',
    stepKeys: ['3', '4', '5'],
    explanation:
      'Confirm what the design must do, resolve unclear requirements, and control design risk.',
  },
  {
    key: 'develop-design',
    order: 3,
    title: 'Develop the Design',
    stepKeys: ['6', '7'],
    explanation:
      'Review the design direction and create controlled outputs that satisfy the requirements.',
  },
  {
    key: 'build-review-test',
    order: 4,
    title: 'Build, Review, and Test',
    stepKeys: ['8', '9', '10'],
    explanation:
      'Build the correct configuration and retain separate verification and validation evidence.',
  },
  {
    key: 'final-approval',
    order: 5,
    title: 'Final Design Approval',
    stepKeys: ['11'],
    explanation:
      'Resolve readiness blockers and obtain an authenticated final design decision.',
  },
  {
    key: 'manufacturing-release',
    order: 6,
    title: 'Release to Manufacturing',
    stepKeys: ['12'],
    explanation:
      'Create the separately approved, immutable Engineering Release baseline.',
  },
] as const;

export function designControlPhaseForStep(stepKey: string) {
  return DESIGN_CONTROL_PHASES.find((phase) =>
    (phase.stepKeys as readonly string[]).includes(stepKey)
  );
}
