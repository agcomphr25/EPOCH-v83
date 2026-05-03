/**
 * Tests for runCreatePunch — the function that POSTs a new punch from the
 * Time Clock Admin "Add Punch" dialog.
 *
 * A previous bug sent employeeId as a number instead of a string, causing a
 * type-mismatch crash on the server. These tests lock the serialization
 * contract in place so a future refactor cannot silently reintroduce that
 * class of error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCreatePunch, type AddPunchDeps, type AddPunchParams } from '../lib/addPunchHandler';

function makeParams(overrides: Partial<AddPunchParams> = {}): AddPunchParams {
  return {
    employeeId: '42',
    type: 'clock_in',
    punchedAt: '2026-04-24T08:00:00.000Z',
    costCode: '',
    note: '',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AddPunchDeps> = {}): AddPunchDeps {
  return {
    fetchJson: vi.fn().mockResolvedValue({ ok: true, data: { id: 1 } }),
    ...overrides,
  };
}

describe('runCreatePunch — employeeId is always sent as a string', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends employeeId as a string when the caller passes a string', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ employeeId: '42' }), deps);

    expect(deps.fetchJson).toHaveBeenCalledOnce();
    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.employeeId).toBe('string');
    expect(body.employeeId).toBe('42');
  });

  it('coerces a numeric-looking employeeId to a string so the server schema never breaks', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ employeeId: '7' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.employeeId).toBe('string');
    expect(body.employeeId).toBe('7');
  });

  it('coerces an actual number runtime value to a string (guards the original bug)', async () => {
    const deps = makeDeps();
    // Simulate a caller that accidentally passes a numeric employeeId at runtime
    // (the exact bug that crashed the dialog previously).
    await runCreatePunch(makeParams({ employeeId: 42 as unknown as string }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.employeeId).toBe('string');
    expect(body.employeeId).toBe('42');
  });

  it('always POSTs to /api/timekeeping/punches', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams(), deps);

    const [url] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/timekeeping/punches');
  });

  it('includes source: "admin" in the request body', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams(), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe('admin');
  });
});

describe('runCreatePunch — successful response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the parsed response data on a successful fetch', async () => {
    const responsePayload = { id: 99, employeeId: '42', type: 'clock_in' };
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: true, data: responsePayload }),
    });

    const result = await runCreatePunch(makeParams(), deps);

    expect(result).toEqual(responsePayload);
  });

  it('does not throw when the response is ok', async () => {
    const deps = makeDeps();
    await expect(runCreatePunch(makeParams(), deps)).resolves.not.toThrow();
  });
});

describe('runCreatePunch — error response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the response is not ok', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        ok: false,
        data: { error: 'Employee not found' },
      }),
    });

    await expect(runCreatePunch(makeParams(), deps)).rejects.toThrow('Employee not found');
  });

  it('throws with "Failed to create punch" when the error response has no error field', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: false, data: {} }),
    });

    await expect(runCreatePunch(makeParams(), deps)).rejects.toThrow('Failed to create punch');
  });

  it('attaches dcaaViolation to the thrown error when the server returns one', async () => {
    const violation = { ruleId: 'TK-001', reason: 'Duplicate punch', remediation: 'Check clock-in time' };
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        ok: false,
        data: { error: 'DCAA violation', dcaaViolation: violation },
      }),
    });

    let caught: (Error & { dcaaViolation?: unknown }) | null = null;
    try {
      await runCreatePunch(makeParams(), deps);
    } catch (e) {
      caught = e as Error & { dcaaViolation?: unknown };
    }

    expect(caught).not.toBeNull();
    expect(caught?.dcaaViolation).toEqual(violation);
  });
});

describe('runCreatePunch — optional fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits costCode from the body when it is empty', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ costCode: '' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('costCode');
  });

  it('includes costCode in the body when it is provided', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ costCode: 'CC-100' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.costCode).toBe('CC-100');
  });

  it('omits note from the body when it is empty', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ note: '' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('note');
  });

  it('includes note in the body when it is provided', async () => {
    const deps = makeDeps();
    await runCreatePunch(makeParams({ note: 'Manual entry' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.note).toBe('Manual entry');
  });
});
