import { z } from 'zod';

export const responsibilityDecisionSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'DECLINED']),
    reason: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'DECLINED' && (value.reason?.length || 0) < 10)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A meaningful reason is required to decline.',
      });
  });

export type ResponsibilityDecisionIdentity = {
  authenticatedUserId: number;
  authenticatedEmployeeId: number | null;
  employeeActive: boolean;
  activeUserCount: number;
  assignedEmployeeId: number;
};

export function responsibilityDecisionIdentityError(
  identity: ResponsibilityDecisionIdentity
) {
  if (!identity.authenticatedEmployeeId) return 'EMPLOYEE_IDENTITY_REQUIRED';
  if (!identity.employeeActive) return 'ACTIVE_EMPLOYEE_IDENTITY_REQUIRED';
  if (identity.activeUserCount !== 1)
    return 'UNAMBIGUOUS_EMPLOYEE_IDENTITY_REQUIRED';
  if (identity.authenticatedEmployeeId !== identity.assignedEmployeeId)
    return 'ASSIGNEE_DECISION_REQUIRED';
  return null;
}
