import { describe, it, expect } from 'vitest';
import { filterPendingByScope, isScopeAuthorized } from '../lib/supervisorScopeGuard';

const makeTs = (employeeId: number) => ({ employeeId, id: employeeId * 10 });

describe('filterPendingByScope', () => {
  it('returns empty when no assignments are configured (least-privilege)', () => {
    const timesheets = [makeTs(1), makeTs(2), makeTs(3)];
    expect(filterPendingByScope(timesheets, [])).toEqual([]);
  });

  it('returns only timesheets for assigned employees', () => {
    const timesheets = [makeTs(1), makeTs(2), makeTs(3)];
    const assignments = [{ employeeId: 1 }, { employeeId: 3 }];
    const result = filterPendingByScope(timesheets, assignments);
    expect(result.map((t) => t.employeeId)).toEqual([1, 3]);
  });

  it('returns empty when no timesheets match the assignments', () => {
    const timesheets = [makeTs(5), makeTs(6)];
    const assignments = [{ employeeId: 1 }];
    expect(filterPendingByScope(timesheets, assignments)).toEqual([]);
  });

  it('returns all timesheets when all employees are assigned', () => {
    const timesheets = [makeTs(1), makeTs(2)];
    const assignments = [{ employeeId: 1 }, { employeeId: 2 }];
    expect(filterPendingByScope(timesheets, assignments)).toHaveLength(2);
  });
});

describe('isScopeAuthorized', () => {
  it('denies access when supervisor has no assignments (least-privilege: not configured)', () => {
    expect(isScopeAuthorized([], 42)).toBe(false);
  });

  it('allows a timesheet whose employee is in the assignment list', () => {
    const assignments = [{ employeeId: 10 }, { employeeId: 20 }];
    expect(isScopeAuthorized(assignments, 10)).toBe(true);
    expect(isScopeAuthorized(assignments, 20)).toBe(true);
  });

  it('blocks a timesheet whose employee is not in the assignment list', () => {
    const assignments = [{ employeeId: 10 }];
    expect(isScopeAuthorized(assignments, 99)).toBe(false);
  });

  it('blocks out-of-scope employees even if some assignments exist', () => {
    const assignments = [{ employeeId: 1 }, { employeeId: 2 }];
    expect(isScopeAuthorized(assignments, 3)).toBe(false);
  });
});
