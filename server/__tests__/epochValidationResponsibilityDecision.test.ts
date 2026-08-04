import { describe, expect, it } from 'vitest';

import {
  responsibilityDecisionIdentityError,
  responsibilityDecisionSchema,
} from '../src/services/epochValidationResponsibilityDecision';

const identity = {
  authenticatedUserId: 7,
  authenticatedEmployeeId: 42,
  employeeActive: true,
  activeUserCount: 1,
  assignedEmployeeId: 42,
};

describe('EPOCH validation responsibility decisions', () => {
  it('allows the active, unambiguous assignee without an edit capability', () => {
    expect(responsibilityDecisionIdentityError(identity)).toBeNull();
  });

  it('fails closed for another employee, an inactive identity, or ambiguity', () => {
    expect(
      responsibilityDecisionIdentityError({
        ...identity,
        assignedEmployeeId: 99,
      })
    ).toBe('ASSIGNEE_DECISION_REQUIRED');
    expect(
      responsibilityDecisionIdentityError({
        ...identity,
        employeeActive: false,
      })
    ).toBe('ACTIVE_EMPLOYEE_IDENTITY_REQUIRED');
    expect(
      responsibilityDecisionIdentityError({ ...identity, activeUserCount: 2 })
    ).toBe('UNAMBIGUOUS_EMPLOYEE_IDENTITY_REQUIRED');
  });

  it('requires a meaningful reason for decline', () => {
    expect(
      responsibilityDecisionSchema.safeParse({ decision: 'DECLINED' }).success
    ).toBe(false);
    expect(
      responsibilityDecisionSchema.safeParse({
        decision: 'DECLINED',
        reason: 'Responsibility belongs to another department.',
      }).success
    ).toBe(true);
    expect(
      responsibilityDecisionSchema.safeParse({ decision: 'ACCEPTED' }).success
    ).toBe(true);
  });
});
