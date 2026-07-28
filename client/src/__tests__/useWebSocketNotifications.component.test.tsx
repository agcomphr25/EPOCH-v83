/**
 * Hook-level integration test for useWebSocketNotifications.
 *
 * Verifies that the hook properly wires up WebSocket.onmessage so that
 * incoming punch_recorded messages reach window.dispatchEvent as a
 * CustomEvent('punch_recorded').  This guards against regressions where
 * the broadcast handler is accidentally disconnected from the hook.
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/serverReadiness', () => ({
  waitForServerReady: vi.fn().mockResolvedValue(undefined),
}));

interface FakeWsInstance {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  readyState: number;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

let latestWs: FakeWsInstance | null = null;

class FakeWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;
  close = vi.fn();
  send = vi.fn();

  constructor(_url: string) {
    latestWs = this as unknown as FakeWsInstance;
  }

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
}

describe('useWebSocketNotifications hook — punch_recorded wiring', () => {
  let originalWebSocket: typeof WebSocket;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    latestWs = null;
    originalWebSocket = global.WebSocket;
    global.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    Object.defineProperty(global, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('dispatches a punch_recorded CustomEvent on the window when the WS message arrives', async () => {
    const { useWebSocketNotifications } = await import('@/hooks/useWebSocketNotifications');

    renderHook(() => useWebSocketNotifications());

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(latestWs).not.toBeNull();

    const payload = {
      type: 'punch_recorded',
      title: 'Punch recorded',
      message: 'Alice Smith',
      data: { employeeId: 1, action: 'clock_in' },
      timestamp: new Date().toISOString(),
    };

    await act(async () => {
      latestWs!.onmessage!({ data: JSON.stringify(payload) } as MessageEvent);
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'punch_recorded' }),
    );

    const dispatched = dispatchSpy.mock.calls.find(
      ([e]) => (e as Event).type === 'punch_recorded',
    )?.[0] as CustomEvent | undefined;

    expect(dispatched).toBeDefined();
    expect(dispatched!.detail).toEqual({ employeeId: 1, action: 'clock_in' });
  });

  it('does NOT dispatch a CustomEvent for the connected handshake message', async () => {
    const { useWebSocketNotifications } = await import('@/hooks/useWebSocketNotifications');

    renderHook(() => useWebSocketNotifications());

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await act(async () => {
      latestWs!.onmessage!({ data: JSON.stringify({ type: 'connected', title: '', message: '', timestamp: '' }) } as MessageEvent);
    });

    const punchDispatches = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === 'punch_recorded',
    );
    expect(punchDispatches).toHaveLength(0);
  });
});
