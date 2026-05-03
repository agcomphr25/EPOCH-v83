import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runHandleStartBreak,
  runHandleEndBreak,
  SESSIONS_QUERY_KEY,
  type BreakHandlerDeps,
} from '../lib/breakHandlers';

function makeDeps(overrides: Partial<BreakHandlerDeps> = {}): BreakHandlerDeps {
  return {
    startBreak: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    endBreak: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateQueries: vi.fn(),
    refetchHours: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

describe('runHandleStartBreak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls invalidateQueries with the sessions query key after startBreak succeeds', async () => {
    const deps = makeDeps();

    await runHandleStartBreak(deps);

    expect(deps.invalidateQueries).toHaveBeenCalledOnce();
    expect(deps.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [SESSIONS_QUERY_KEY],
    });
  });

  it('shows a success toast after startBreak succeeds', async () => {
    const deps = makeDeps();

    await runHandleStartBreak(deps);

    expect(deps.toast).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith({ title: 'Break started' });
  });

  it('does NOT call invalidateQueries when startBreak throws', async () => {
    const deps = makeDeps({
      startBreak: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runHandleStartBreak(deps);

    expect(deps.invalidateQueries).not.toHaveBeenCalled();
  });

  it('shows an error toast when startBreak throws', async () => {
    const deps = makeDeps({
      startBreak: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runHandleStartBreak(deps);

    expect(deps.toast).toHaveBeenCalledWith({
      title: 'Failed to start break',
      variant: 'destructive',
    });
  });
});

describe('runHandleEndBreak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls invalidateQueries with the sessions query key after endBreak succeeds', async () => {
    const deps = makeDeps();

    await runHandleEndBreak(deps);

    expect(deps.invalidateQueries).toHaveBeenCalledOnce();
    expect(deps.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [SESSIONS_QUERY_KEY],
    });
  });

  it('shows a success toast after endBreak succeeds', async () => {
    const deps = makeDeps();

    await runHandleEndBreak(deps);

    expect(deps.toast).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith({ title: 'Break ended — back to work!' });
  });

  it('calls refetchHours after endBreak succeeds', async () => {
    const deps = makeDeps();

    await runHandleEndBreak(deps);

    expect(deps.refetchHours).toHaveBeenCalledOnce();
  });

  it('does NOT call invalidateQueries when endBreak throws', async () => {
    const deps = makeDeps({
      endBreak: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runHandleEndBreak(deps);

    expect(deps.invalidateQueries).not.toHaveBeenCalled();
  });

  it('shows an error toast when endBreak throws', async () => {
    const deps = makeDeps({
      endBreak: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runHandleEndBreak(deps);

    expect(deps.toast).toHaveBeenCalledWith({
      title: 'Failed to end break',
      variant: 'destructive',
    });
  });
});
