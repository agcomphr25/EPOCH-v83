import crypto from 'crypto';

export const VALIDATION_STATUSES = [
  'DRAFT', 'PLANNING', 'READY_FOR_APPROVAL', 'PLAN_APPROVED', 'TESTING',
  'TESTING_BLOCKED', 'CORRECTIONS_REQUIRED', 'RETESTING',
  'READY_FOR_FINAL_REVIEW', 'APPROVED_FOR_INTENDED_USE',
  'APPROVED_WITH_LIMITATIONS', 'REJECTED', 'SUPERSEDED', 'CANCELLED',
] as const;

export type ValidationStatus = typeof VALIDATION_STATUSES[number];

export const LEGAL_TRANSITIONS: Record<ValidationStatus, readonly ValidationStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED'],
  PLANNING: ['READY_FOR_APPROVAL', 'CANCELLED'],
  READY_FOR_APPROVAL: ['PLAN_APPROVED', 'PLANNING', 'REJECTED'],
  PLAN_APPROVED: ['TESTING', 'CORRECTIONS_REQUIRED', 'CANCELLED'],
  TESTING: ['TESTING_BLOCKED', 'CORRECTIONS_REQUIRED', 'RETESTING', 'READY_FOR_FINAL_REVIEW'],
  TESTING_BLOCKED: ['TESTING', 'CORRECTIONS_REQUIRED', 'CANCELLED'],
  CORRECTIONS_REQUIRED: ['RETESTING', 'PLANNING', 'CANCELLED'],
  RETESTING: ['TESTING_BLOCKED', 'CORRECTIONS_REQUIRED', 'READY_FOR_FINAL_REVIEW'],
  READY_FOR_FINAL_REVIEW: [
    'APPROVED_FOR_INTENDED_USE', 'APPROVED_WITH_LIMITATIONS',
    'CORRECTIONS_REQUIRED', 'REJECTED',
  ],
  APPROVED_FOR_INTENDED_USE: ['SUPERSEDED'],
  APPROVED_WITH_LIMITATIONS: ['SUPERSEDED'],
  REJECTED: ['PLANNING', 'CANCELLED'],
  SUPERSEDED: [],
  CANCELLED: [],
};

export function canTransition(from: ValidationStatus, to: ValidationStatus) {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export type StepResult = { required?: boolean; status: string };

export function deriveExecutionResult(steps: StepResult[]) {
  const required = steps.filter(step => step.required !== false);
  if (!required.length || required.some(step => step.status === 'NOT_RUN')) return 'NOT_RUN';
  if (required.some(step => step.status === 'FAILED')) return 'FAILED';
  if (required.some(step => step.status === 'BLOCKED')) return 'BLOCKED';
  if (required.some(step => step.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
  return 'PASSED';
}

export type ReadinessCounts = {
  intendedUseApproved: boolean;
  requirementsBaselineApproved: boolean;
  riskAssessmentApproved: boolean;
  validationPlanApproved: boolean;
  criticalRequirements: number;
  criticalRequirementsTested: number;
  criticalTests: number;
  criticalTestsPassed: number;
  openCriticalDefects: number;
  openHighDefects: number;
  acceptedHighDefects: number;
  requiredRetests: number;
  passedRetests: number;
  backupPassed: boolean;
  restorePassed: boolean;
  outageDrillPassed: boolean;
  approvalsCurrent: boolean;
  exactProductionVersionIdentified: boolean;
};

export function calculateReadiness(counts: ReadinessCounts) {
  const blockers: string[] = [];
  if (!counts.intendedUseApproved) blockers.push('Intended Use is not approved');
  if (!counts.requirementsBaselineApproved) blockers.push('Requirements baseline is not approved');
  if (!counts.riskAssessmentApproved) blockers.push('Risk assessment is not approved');
  if (!counts.validationPlanApproved) blockers.push('Validation Plan is not approved');
  if (counts.criticalRequirementsTested < counts.criticalRequirements) blockers.push('Critical requirements remain untested');
  if (counts.criticalTestsPassed < counts.criticalTests) blockers.push('Critical tests have not all passed');
  if (counts.openCriticalDefects > 0) blockers.push('Critical validation defects remain open');
  if (counts.openHighDefects > counts.acceptedHighDefects) blockers.push('High validation defects remain unaccepted');
  if (counts.passedRetests < counts.requiredRetests) blockers.push('Required retests have not passed');
  if (!counts.backupPassed) blockers.push('Backup verification has not passed');
  if (!counts.restorePassed) blockers.push('Restore testing has not passed');
  if (!counts.outageDrillPassed) blockers.push('Outage drill has not passed');
  if (!counts.approvalsCurrent) blockers.push('Required approvals are missing or stale');
  if (!counts.exactProductionVersionIdentified) blockers.push('Exact production version is not identified');
  return { ready: blockers.length === 0, blockers };
}

export function checksum(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
