import { describe, expect, it, vi } from 'vitest';

import {
  fetchWhenServerReady,
  parseResponse,
  waitForServerReady,
} from '@/lib/serverReadiness';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('server readiness handling', () => {
  it('waits until boot status reports ready', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 'not_ready' }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: 'not_ready' }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: 'ready' }));

    await waitForServerReady({ fetchImpl, timeoutMs: 1_000, pollIntervalMs: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('replays the original request only after routes report ready', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'Server starting, please retry' }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: 'ready' }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 1 } }));

    const response = await fetchWhenServerReady(
      '/api/auth/login',
      { method: 'POST' },
      { fetchImpl, pollIntervalMs: 0 },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/login',
      '/api/boot-status',
      '/api/auth/login',
    ]);
  });

  it('returns non-JSON upstream errors without a syntax error', async () => {
    const response = new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' },
    });

    await expect(parseResponse(response)).resolves.toEqual({
      data: null,
      error: 'Internal Server Error',
    });
  });

  it('does not retry genuine authentication failures', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'Invalid username or password' }, 401));

    const response = await fetchWhenServerReady(
      '/api/auth/login',
      { method: 'POST' },
      { fetchImpl },
    );

    expect(response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
