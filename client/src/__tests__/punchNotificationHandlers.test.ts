import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebSocketMessage, type WebSocketMessageDeps } from '../lib/punchNotificationHandlers';

function makeDeps(overrides: Partial<WebSocketMessageDeps> = {}): WebSocketMessageDeps {
  return {
    dispatchEvent: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

describe('handleWebSocketMessage — punch_recorded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches a punch_recorded CustomEvent when the payload type is punch_recorded', () => {
    const deps = makeDeps();
    const data = { employeeId: 42, action: 'clock_in' };

    handleWebSocketMessage(
      JSON.stringify({ type: 'punch_recorded', title: 'Punch recorded', message: 'Alice', data, timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.dispatchEvent).toHaveBeenCalledOnce();
    const dispatched = vi.mocked(deps.dispatchEvent).mock.calls[0][0] as CustomEvent;
    expect(dispatched).toBeInstanceOf(CustomEvent);
    expect(dispatched.type).toBe('punch_recorded');
    expect(dispatched.detail).toEqual(data);
  });

  it('does NOT call toast for a punch_recorded message', () => {
    const deps = makeDeps();

    handleWebSocketMessage(
      JSON.stringify({ type: 'punch_recorded', title: 'Punch recorded', message: 'Bob', data: {}, timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('passes the data payload from the message as the CustomEvent detail', () => {
    const deps = makeDeps();
    const data = { employeeId: 99, action: 'clock_out' };

    handleWebSocketMessage(
      JSON.stringify({ type: 'punch_recorded', title: 'Punch recorded', message: 'Charlie', data, timestamp: new Date().toISOString() }),
      deps,
    );

    const dispatched = vi.mocked(deps.dispatchEvent).mock.calls[0][0] as CustomEvent;
    expect(dispatched.detail).toEqual(data);
  });

  it('silently ignores malformed JSON without throwing', () => {
    const deps = makeDeps();

    expect(() => handleWebSocketMessage('{not valid json}', deps)).not.toThrow();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('does nothing for the connected handshake message', () => {
    const deps = makeDeps();

    handleWebSocketMessage(
      JSON.stringify({ type: 'connected', title: '', message: '', timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.toast).not.toHaveBeenCalled();
  });
});

describe('handleWebSocketMessage — other notification types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a toast for ticket_assigned messages', () => {
    const deps = makeDeps();

    handleWebSocketMessage(
      JSON.stringify({ type: 'ticket_assigned', title: 'Ticket Assigned', message: 'You have a new ticket', timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.toast).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ticket Assigned' }));
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it('dispatches a forensic_scan_complete CustomEvent for that type', () => {
    const deps = makeDeps();
    const data = { scanId: 'scan-123' };

    handleWebSocketMessage(
      JSON.stringify({ type: 'forensic_scan_complete', title: 'Scan done', message: '', data, timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.dispatchEvent).toHaveBeenCalledOnce();
    const dispatched = vi.mocked(deps.dispatchEvent).mock.calls[0][0] as CustomEvent;
    expect(dispatched.type).toBe('forensic_scan_complete');
    expect(dispatched.detail).toEqual(data);
  });

  it('shows a generic toast for unknown notification types', () => {
    const deps = makeDeps();

    handleWebSocketMessage(
      JSON.stringify({ type: 'some_unknown_type', title: 'Alert', message: 'Something happened', timestamp: new Date().toISOString() }),
      deps,
    );

    expect(deps.toast).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Alert' }));
  });
});
