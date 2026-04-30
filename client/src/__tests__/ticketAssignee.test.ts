import { describe, it, expect } from 'vitest';
import {
  getUserName,
  filterAssignableEmployees,
  isAssigneeSelected,
  toggleAssignee,
} from '@/lib/ticketAssigneeHelpers';

const makeEmp = (id: number, name: string, userId: number | null | undefined) => ({
  id,
  name,
  userId,
});

// ── getUserName ───────────────────────────────────────────────────────────────

describe('getUserName', () => {
  it('returns the employee name matched by userId, not by id', () => {
    const employees = [
      makeEmp(1, 'Alice', 101),
      makeEmp(2, 'Bob', 102),
    ];
    expect(getUserName(101, employees)).toBe('Alice');
    expect(getUserName(102, employees)).toBe('Bob');
  });

  it('does NOT match on employee.id — a userId that equals a different employee.id still resolves correctly', () => {
    const employees = [
      makeEmp(999, 'Charlie', 1),
      makeEmp(1, 'Danger', 999),
    ];
    expect(getUserName(1, employees)).toBe('Charlie');
    expect(getUserName(999, employees)).toBe('Danger');
  });

  it('returns fallback "Employee N" when no employee has a matching userId', () => {
    const employees = [makeEmp(5, 'Dave', 200)];
    expect(getUserName(999, employees)).toBe('Employee 999');
  });

  it('returns fallback when employee list is empty', () => {
    expect(getUserName(42, [])).toBe('Employee 42');
  });

  it('does not match an employee whose userId is null', () => {
    const employees = [makeEmp(7, 'Eve', null)];
    expect(getUserName(7, employees)).toBe('Employee 7');
  });

  it('does not match an employee whose userId is undefined', () => {
    const employees = [makeEmp(8, 'Frank', undefined)];
    expect(getUserName(8, employees)).toBe('Employee 8');
  });
});

// ── filterAssignableEmployees ─────────────────────────────────────────────────

describe('filterAssignableEmployees', () => {
  it('keeps only employees that have a non-null userId', () => {
    const employees = [
      makeEmp(1, 'Alice', 101),
      makeEmp(2, 'Bob', null),
      makeEmp(3, 'Carol', 103),
    ];
    const result = filterAssignableEmployees(employees);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Alice', 'Carol']);
  });

  it('excludes employees with undefined userId', () => {
    const employees = [
      makeEmp(1, 'Alice', 101),
      makeEmp(2, 'NoUser', undefined),
    ];
    const result = filterAssignableEmployees(employees);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('returns an empty array when all employees lack a userId', () => {
    const employees = [makeEmp(1, 'X', null), makeEmp(2, 'Y', undefined)];
    expect(filterAssignableEmployees(employees)).toHaveLength(0);
  });

  it('returns all employees when all have a userId', () => {
    const employees = [makeEmp(1, 'A', 10), makeEmp(2, 'B', 20)];
    expect(filterAssignableEmployees(employees)).toHaveLength(2);
  });

  it('returns empty array for an empty input', () => {
    expect(filterAssignableEmployees([])).toHaveLength(0);
  });
});

// ── isAssigneeSelected ────────────────────────────────────────────────────────

describe('isAssigneeSelected', () => {
  it('returns true when emp.userId is in assignedUserIds', () => {
    const emp = makeEmp(5, 'Alice', 101);
    expect(isAssigneeSelected(emp, [99, 101, 200])).toBe(true);
  });

  it('returns false when emp.userId is NOT in assignedUserIds', () => {
    const emp = makeEmp(5, 'Alice', 101);
    expect(isAssigneeSelected(emp, [99, 200])).toBe(false);
  });

  it('uses userId, not id — emp.id in list but userId absent means NOT selected', () => {
    const emp = makeEmp(101, 'Bob', 999);
    expect(isAssigneeSelected(emp, [101])).toBe(false);
  });

  it('returns false when emp has no userId (null)', () => {
    const emp = makeEmp(3, 'Carol', null);
    expect(isAssigneeSelected(emp, [3, 101])).toBe(false);
  });

  it('returns false when emp has no userId (undefined)', () => {
    const emp = makeEmp(4, 'Dave', undefined);
    expect(isAssigneeSelected(emp, [4, 101])).toBe(false);
  });

  it('returns false when assignedUserIds is empty', () => {
    const emp = makeEmp(1, 'Alice', 101);
    expect(isAssigneeSelected(emp, [])).toBe(false);
  });
});

// ── toggleAssignee ────────────────────────────────────────────────────────────

describe('toggleAssignee', () => {
  it('adds emp.userId to the list when not already present', () => {
    const emp = makeEmp(1, 'Alice', 101);
    const result = toggleAssignee(emp, [200, 300]);
    expect(result).toEqual([200, 300, 101]);
  });

  it('removes emp.userId from the list when already present', () => {
    const emp = makeEmp(1, 'Alice', 101);
    const result = toggleAssignee(emp, [200, 101, 300]);
    expect(result).toEqual([200, 300]);
  });

  it('adds userId (not id) — does not operate on emp.id', () => {
    const emp = makeEmp(200, 'Bob', 101);
    const result = toggleAssignee(emp, []);
    expect(result).toContain(101);
    expect(result).not.toContain(200);
  });

  it('removes userId (not id) from the list', () => {
    const emp = makeEmp(200, 'Bob', 101);
    const result = toggleAssignee(emp, [101, 200]);
    expect(result).not.toContain(101);
    expect(result).toContain(200);
  });

  it('does not mutate the original assignedUserIds array', () => {
    const emp = makeEmp(1, 'Alice', 101);
    const original = [200, 300];
    const result = toggleAssignee(emp, original);
    expect(original).toEqual([200, 300]);
    expect(result).toEqual([200, 300, 101]);
  });

  it('returns the list unchanged when emp has no userId (null)', () => {
    const emp = makeEmp(1, 'Alice', null);
    const result = toggleAssignee(emp, [10, 20]);
    expect(result).toEqual([10, 20]);
  });

  it('returns the list unchanged when emp has no userId (undefined)', () => {
    const emp = makeEmp(1, 'Alice', undefined);
    const result = toggleAssignee(emp, [10, 20]);
    expect(result).toEqual([10, 20]);
  });

  it('works correctly starting from an empty list', () => {
    const emp = makeEmp(1, 'Alice', 101);
    expect(toggleAssignee(emp, [])).toEqual([101]);
  });

  it('results in an empty list when the only assignee is removed', () => {
    const emp = makeEmp(1, 'Alice', 101);
    expect(toggleAssignee(emp, [101])).toEqual([]);
  });
});
