import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runSignBadgeLookup,
  fetchResolveBadge,
  type SignBadgeLookupDeps,
  type ResolvedEmployee,
} from '../lib/signBadgeHandlers';

const MOCK_EMPLOYEE: ResolvedEmployee = {
  id: 7,
  name: 'Jane Smith',
  employeeCode: 'JS007',
  department: 'Quality',
};

function makeDeps(overrides: Partial<SignBadgeLookupDeps> = {}): SignBadgeLookupDeps {
  return {
    resolveBadge: vi.fn().mockResolvedValue({ ok: true, employee: MOCK_EMPLOYEE }),
    setSignedByName: vi.fn(),
    setSignResolvedEmployee: vi.fn(),
    setSignBadgeLookupStatus: vi.fn(),
    ...overrides,
  };
}

describe('runSignBadgeLookup — recognized badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls resolveBadge with the provided scan code', async () => {
    const deps = makeDeps();

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.resolveBadge).toHaveBeenCalledOnce();
    expect(deps.resolveBadge).toHaveBeenCalledWith('BADGE001');
  });

  it('auto-fills the Full Name field with the employee name on a successful lookup', async () => {
    const deps = makeDeps();

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignedByName).toHaveBeenCalledOnce();
    expect(deps.setSignedByName).toHaveBeenCalledWith('Jane Smith');
  });

  it('sets the resolved employee record so the green confirmation card can render', async () => {
    const deps = makeDeps();

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignResolvedEmployee).toHaveBeenCalledOnce();
    expect(deps.setSignResolvedEmployee).toHaveBeenCalledWith(MOCK_EMPLOYEE);
  });

  it('sets lookup status to "found" so the green confirmation card appears', async () => {
    const deps = makeDeps();

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledOnce();
    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledWith('found');
  });

  it('includes department info in the resolved employee (used by the confirmation card)', async () => {
    const empWithDept: ResolvedEmployee = { ...MOCK_EMPLOYEE, department: 'Engineering' };
    const deps = makeDeps({
      resolveBadge: vi.fn().mockResolvedValue({ ok: true, employee: empWithDept }),
    });

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignResolvedEmployee).toHaveBeenCalledWith(empWithDept);
  });
});

describe('runSignBadgeLookup — unrecognized badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT auto-fill the Full Name field when the badge is unknown', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockResolvedValue({ ok: false }),
    });

    await runSignBadgeLookup('UNKNOWN1', deps);

    expect(deps.setSignedByName).not.toHaveBeenCalled();
  });

  it('clears the resolved employee so no stale data remains', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockResolvedValue({ ok: false }),
    });

    await runSignBadgeLookup('UNKNOWN1', deps);

    expect(deps.setSignResolvedEmployee).toHaveBeenCalledOnce();
    expect(deps.setSignResolvedEmployee).toHaveBeenCalledWith(null);
  });

  it('sets lookup status to "not_found" so the red error message appears', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockResolvedValue({ ok: false }),
    });

    await runSignBadgeLookup('UNKNOWN1', deps);

    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledOnce();
    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledWith('not_found');
  });

  it('leaves the Full Name field editable (no auto-fill sets a value) on an unknown badge', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockResolvedValue({ ok: false }),
    });

    await runSignBadgeLookup('UNKNOWN1', deps);

    expect(deps.setSignedByName).not.toHaveBeenCalled();
  });
});

describe('runSignBadgeLookup — network / fetch error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets lookup status to "not_found" when resolveBadge throws', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledOnce();
    expect(deps.setSignBadgeLookupStatus).toHaveBeenCalledWith('not_found');
  });

  it('clears resolved employee when resolveBadge throws', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignResolvedEmployee).toHaveBeenCalledOnce();
    expect(deps.setSignResolvedEmployee).toHaveBeenCalledWith(null);
  });

  it('does NOT auto-fill the Full Name field when resolveBadge throws', async () => {
    const deps = makeDeps({
      resolveBadge: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSignBadgeLookup('BADGE001', deps);

    expect(deps.setSignedByName).not.toHaveBeenCalled();
  });
});

describe('fetchResolveBadge — fetch URL wiring and response parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch with the correct endpoint URL for a given scan code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_EMPLOYEE,
    });

    await fetchResolveBadge('BADGE001');

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/employee-badges/resolve-badge/BADGE001',
    );
  });

  it('URL-encodes special characters in the scan code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_EMPLOYEE,
    });

    await fetchResolveBadge('BADGE 001/test');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/employee-badges/resolve-badge/BADGE%20001%2Ftest',
    );
  });

  it('returns { ok: true, employee } when the endpoint responds with 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_EMPLOYEE,
    });

    const result = await fetchResolveBadge('BADGE001');

    expect(result.ok).toBe(true);
    expect(result.employee).toEqual(MOCK_EMPLOYEE);
  });

  it('returns { ok: false } without an employee when the endpoint returns a non-OK status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    });

    const result = await fetchResolveBadge('UNKNOWN1');

    expect(result.ok).toBe(false);
    expect(result.employee).toBeUndefined();
  });

  it('propagates thrown errors so runSignBadgeLookup can catch them', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(fetchResolveBadge('BADGE001')).rejects.toThrow('network error');
  });
});
