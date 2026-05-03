/**
 * Tests for runEditPunch — the function that PATCHes an existing punch from
 * the Time Clock Admin "Edit Punch" dialog.
 *
 * The serialization contract is:
 *   - which: 'clockIn' | 'clockOut' — explicit discriminator (required by server)
 *   - punchedAt: ISO-8601 timestamp — the new value for the selected field
 *   - editNote must always be present and non-empty (DCAA TK-004 requirement)
 *   - chargeCodeId must be sent (integer or null) — not a raw code string
 *   - error responses from the server must be surfaced as thrown Errors
 *
 * These tests lock that contract in place so a future refactor cannot silently
 * break the dialog or incorrectly update the wrong timestamp column.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEditPunch, type EditPunchDeps, type EditPunchParams } from '../lib/editPunchHandler';

const PUNCH_TS = '2026-04-24T08:00:00.000Z';

function makeParams(overrides: Partial<EditPunchParams> = {}): EditPunchParams {
  return {
    id: 1,
    punchType: 'clock_in',
    punchedAt: PUNCH_TS,
    note: 'Correcting missed clock-in',
    chargeCodeId: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<EditPunchDeps> = {}): EditPunchDeps {
  return {
    fetchJson: vi.fn().mockResolvedValue({ ok: true, data: { id: 1 } }),
    ...overrides,
  };
}

describe('runEditPunch — editNote is always sent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes editNote in the request body', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ note: 'Clock-in time was wrong' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.editNote).toBe('Clock-in time was wrong');
  });

  it('sends editNote (not note) as the body key — matching the server schema field name', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ note: 'Any reason' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toHaveProperty('editNote');
    expect(body).not.toHaveProperty('note');
  });

  it('editNote is a non-empty string when a valid note is provided', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ note: 'Operator was late' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(typeof body.editNote).toBe('string');
    expect(body.editNote.length).toBeGreaterThan(0);
  });
});

describe('runEditPunch — which discriminator and punchedAt field routing by punchType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends which="clockIn" for clock_in events', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'clock_in' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.which).toBe('clockIn');
    expect(body).not.toHaveProperty('clockOut');
  });

  it('sends which="clockIn" for break_start events', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'break_start' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.which).toBe('clockIn');
  });

  it('sends which="clockOut" for clock_out events', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'clock_out' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.which).toBe('clockOut');
    expect(body).not.toHaveProperty('clockIn');
  });

  it('sends which="clockOut" for break_end events', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'break_end' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.which).toBe('clockOut');
  });

  it('sends punchedAt (not clockIn/clockOut) as the timestamp field', async () => {
    const isoString = '2026-04-24T14:15:00.000Z';
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'clock_in', punchedAt: isoString }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.punchedAt).toBe(isoString);
    expect(body).not.toHaveProperty('clockIn');
    expect(body).not.toHaveProperty('clockOut');
  });

  it('preserves the ISO format of punchedAt without mutation', async () => {
    const isoString = '2026-04-24T17:45:00.000Z';
    const deps = makeDeps();
    await runEditPunch(makeParams({ punchType: 'clock_out', punchedAt: isoString }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.punchedAt).toBe(isoString);
  });
});

describe('runEditPunch — chargeCodeId is sent as an integer or null', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends chargeCodeId as null when no charge code is selected', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ chargeCodeId: null }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.chargeCodeId).toBeNull();
  });

  it('sends chargeCodeId as an integer when a charge code is selected', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ chargeCodeId: 7 }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.chargeCodeId).toBe(7);
    expect(typeof body.chargeCodeId).toBe('number');
  });

  it('sends chargeCodeId (not costCode) — matching the AdminUpdatePunchBody server schema field name', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ chargeCodeId: 3 }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toHaveProperty('chargeCodeId');
    expect(body).not.toHaveProperty('costCode');
  });
});

describe('runEditPunch — correct endpoint and HTTP method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the request to /api/timekeeping/punches/:id', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams({ id: 42 }), deps);

    const [url] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/timekeeping/punches/42');
  });

  it('uses the PATCH method', async () => {
    const deps = makeDeps();
    await runEditPunch(makeParams(), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('PATCH');
  });
});

describe('runEditPunch — successful response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the parsed response data on a successful fetch', async () => {
    const responsePayload = { id: 7, clockIn: '2026-04-24T08:00:00.000Z', isEdited: true };
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: true, data: responsePayload }),
    });

    const result = await runEditPunch(makeParams(), deps);

    expect(result).toEqual(responsePayload);
  });

  it('does not throw when the response is ok', async () => {
    const deps = makeDeps();
    await expect(runEditPunch(makeParams(), deps)).resolves.not.toThrow();
  });
});

describe('runEditPunch — error response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the response is not ok', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        ok: false,
        data: { error: 'Punch not found' },
      }),
    });

    await expect(runEditPunch(makeParams(), deps)).rejects.toThrow('Punch not found');
  });

  it('throws with "Failed to update punch" when the error response has no error field', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: false, data: {} }),
    });

    await expect(runEditPunch(makeParams(), deps)).rejects.toThrow('Failed to update punch');
  });

  it('surfaces the DCAA validation error so the UI can display it to the operator', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        ok: false,
        data: { error: '[DCAA TK-004] editNote is required for all punch edits' },
      }),
    });

    let caught: Error | null = null;
    try {
      await runEditPunch(makeParams(), deps);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught?.message).toContain('editNote is required');
  });
});

describe('runEditPunch — which discriminator exhaustive punchType table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cases: Array<{ punchType: EditPunchParams['punchType']; expectedWhich: 'clockIn' | 'clockOut' }> = [
    { punchType: 'clock_in',    expectedWhich: 'clockIn'  },
    { punchType: 'break_start', expectedWhich: 'clockIn'  },
    { punchType: 'clock_out',   expectedWhich: 'clockOut' },
    { punchType: 'break_end',   expectedWhich: 'clockOut' },
  ];

  for (const { punchType, expectedWhich } of cases) {
    it(`punchType="${punchType}" maps to which="${expectedWhich}"`, async () => {
      const deps = makeDeps();
      await runEditPunch(makeParams({ punchType }), deps);

      const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.which).toBe(expectedWhich);
    });
  }

  it('never sends both clockIn and clockOut as top-level keys', async () => {
    for (const punchType of ['clock_in', 'clock_out', 'break_start', 'break_end'] as const) {
      vi.clearAllMocks();
      const deps = makeDeps();
      await runEditPunch(makeParams({ punchType }), deps);
      const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body).not.toHaveProperty('clockIn');
      expect(body).not.toHaveProperty('clockOut');
    }
  });
});
