/**
 * Tests for runDeletePunch — the function that sends a DELETE request to remove a
 * punch record from the Punch Review "Delete Punch" confirmation dialog.
 *
 * DCAA TK-004 requires an audit reason whenever a punch is deleted. These tests
 * lock the client-side serialization contract in place so a future refactor
 * cannot silently drop the editNote or change the HTTP method.
 *
 * Contracts verified:
 *  - editNote is always included in the DELETE request body
 *  - The field is named 'editNote' (not 'note', 'reason', or anything else)
 *  - The request targets DELETE /api/timekeeping/punches/:id
 *  - Errors from the server are surfaced as thrown Errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDeletePunch, type DeletePunchDeps, type DeletePunchParams } from '../lib/deletePunchHandler';

function makeParams(overrides: Partial<DeletePunchParams> = {}): DeletePunchParams {
  return {
    id: 42,
    editNote: 'Duplicate entry — removing the extra record',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DeletePunchDeps> = {}): DeletePunchDeps {
  return {
    fetchJson: vi.fn().mockResolvedValue({ ok: true, data: null }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// editNote in request body (the core DCAA requirement)
// ---------------------------------------------------------------------------

describe('runDeletePunch — editNote is always sent in the DELETE body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes editNote in the request body', async () => {
    const deps = makeDeps();
    await runDeletePunch(makeParams({ editNote: 'Operator clocked in twice — removing the duplicate' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.editNote).toBe('Operator clocked in twice — removing the duplicate');
  });

  it('sends the field as "editNote" (not "note" or "reason")', async () => {
    const deps = makeDeps();
    await runDeletePunch(makeParams({ editNote: 'Test reason' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toHaveProperty('editNote');
    expect(body).not.toHaveProperty('note');
    expect(body).not.toHaveProperty('reason');
  });

  it('forwards an empty editNote string verbatim — server is responsible for the 400', async () => {
    const deps = makeDeps();
    await runDeletePunch(makeParams({ editNote: '' }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.editNote).toBe('');
  });

  it('editNote content is preserved exactly as given (no trimming or mutation)', async () => {
    const note = '  Spaces preserved  ';
    const deps = makeDeps();
    await runDeletePunch(makeParams({ editNote: note }), deps);

    const [, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.editNote).toBe(note);
  });
});

// ---------------------------------------------------------------------------
// URL and HTTP method
// ---------------------------------------------------------------------------

describe('runDeletePunch — URL and HTTP method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends DELETE to /api/timekeeping/punches/:id', async () => {
    const deps = makeDeps();
    await runDeletePunch(makeParams({ id: 99 }), deps);

    const [url, init] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/timekeeping/punches/99');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('embeds the punch id from params into the URL', async () => {
    const deps = makeDeps();
    await runDeletePunch(makeParams({ id: 17 }), deps);

    const [url] = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/timekeeping/punches/17');
  });
});

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

describe('runDeletePunch — response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves without throwing on a successful (ok) response', async () => {
    const deps = makeDeps();
    await expect(runDeletePunch(makeParams(), deps)).resolves.not.toThrow();
  });

  it('throws with the server error message when the response is not ok', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: false, data: { error: 'Punch not found' } }),
    });

    await expect(runDeletePunch(makeParams(), deps)).rejects.toThrow('Punch not found');
  });

  it('throws "Failed to delete punch" when the error response has no error field', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({ ok: false, data: {} }),
    });

    await expect(runDeletePunch(makeParams(), deps)).rejects.toThrow('Failed to delete punch');
  });

  it('throws the DCAA validation error when editNote is rejected by the server', async () => {
    const deps = makeDeps({
      fetchJson: vi.fn().mockResolvedValue({
        ok: false,
        data: { error: '[DCAA TK-004] An edit reason (editNote) is required when deleting a punch record.' },
      }),
    });

    await expect(runDeletePunch(makeParams({ editNote: '' }), deps)).rejects.toThrow('DCAA');
  });
});
