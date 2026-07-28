const BOOT_STATUS_URL = '/api/boot-status';
const DEFAULT_BOOT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

type FetchLike = typeof fetch;

export interface ParsedResponse<T = any> {
  data: T | null;
  error: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function responseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function parseResponse<T = any>(
  response: Response,
): Promise<ParsedResponse<T>> {
  const body = await responseBody(response);
  if (body && typeof body === 'object') {
    return {
      data: body as T,
      error:
        typeof body.error === 'string'
          ? body.error
          : typeof body.message === 'string'
            ? body.message
            : null,
    };
  }

  return {
    data: null,
    error:
      typeof body === 'string' && body.trim()
        ? body.trim()
        : response.statusText || `Request failed (${response.status})`,
  };
}

async function isStartupResponse(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  const parsed = await parseResponse(response.clone());
  return (
    parsed.error?.toLowerCase().includes('server starting') === true ||
    parsed.error?.toLowerCase().includes('registering routes') === true
  );
}

export async function waitForServerReady(options: {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  pollIntervalMs?: number;
} = {}): Promise<void> {
  const {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_BOOT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(BOOT_STATUS_URL, {
        credentials: 'include',
        cache: 'no-store',
      });
      const parsed = await parseResponse<{
        status?: string;
        routeRegistration?: { status?: string; error?: { message?: string } };
      }>(response);

      if (response.ok && parsed.data?.status === 'ready') return;
      if (parsed.data?.routeRegistration?.status === 'failed') {
        throw new Error(
          parsed.data.routeRegistration.error?.message ||
            'Server failed while registering routes',
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== 'Failed to fetch' &&
        !error.message.includes('NetworkError')
      ) {
        throw error;
      }
    }
    await delay(pollIntervalMs);
  }

  throw new Error('Server is still starting. Please try again in a moment.');
}

export async function fetchWhenServerReady(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(input, init);
  if (!(await isStartupResponse(response))) return response;

  await waitForServerReady({ ...options, fetchImpl });
  return fetchImpl(input, init);
}
