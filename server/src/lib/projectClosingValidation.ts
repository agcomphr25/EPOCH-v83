import type { ProjectClosing } from '../../schema';

const REQUIRED_FIELDS: Array<keyof ProjectClosing> = [
  'summary',
  'whatWentWrong',
  'strengths',
  'opportunities',
  'nextProjectRecommendations',
];

export interface ClosingValidationResult {
  valid: boolean;
  missing: string[];
}

export function validateProjectClosing(closing: ProjectClosing): ClosingValidationResult {
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = closing[field];
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }) as string[];

  return {
    valid: missing.length === 0,
    missing,
  };
}

export type ClosingStatus = 'MISSING' | 'INCOMPLETE' | 'COMPLETE' | 'APPROVED';

export function deriveClosingStatus(closing: ProjectClosing | null | undefined): ClosingStatus {
  if (!closing) return 'MISSING';
  const { valid } = validateProjectClosing(closing);
  if (!valid) return 'INCOMPLETE';
  return closing.approvedBy ? 'APPROVED' : 'COMPLETE';
}
