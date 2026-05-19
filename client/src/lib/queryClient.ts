import { QueryClient, QueryFunction } from '@tanstack/react-query';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    let errorData: any = null;
    
    try {
      errorData = await res.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) {
          errorMessage = text;
        }
      } catch {
        // Keep the default statusText
      }
    }
    
    const error: any = new Error(errorMessage);
    error.status = res.status;
    if (errorData) {
      Object.assign(error, errorData);
      error.responseData = errorData;
    }
    throw error;
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  timeout?: number;
  idempotencyKey?: string;
  _isRetry?: boolean;
  _transientRetryCount?: number;
}

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const SERVER_STARTING_MESSAGE = 'Server starting, please retry';
const MAX_TRANSIENT_RETRIES = 8;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response, fallbackMs = 2000): number {
  const retryAfter = res.headers.get('Retry-After');
  if (!retryAfter) return fallbackMs;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, retryAfterSeconds * 1000);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return fallbackMs;
}

function isServerStartingResponse(status: number, body: any, message: string): boolean {
  return (
    status === 503 &&
    (message.includes(SERVER_STARTING_MESSAGE) ||
      body?.error === SERVER_STARTING_MESSAGE ||
      body?.message === SERVER_STARTING_MESSAGE)
  );
}

function normalizeApiErrorMessage(message: string): string {
  if (message.toLowerCase().includes('error code undefined')) {
    return 'File storage is not available. Check the storage provider configuration and try again.';
  }

  return message;
}

// ─── Session expiry handler ───────────────────────────────────────────────────
// Called when a 401/403 is confirmed to be a genuine session expiry.
// Shows a toast and redirects to /login after a brief delay.
// Kiosk/floor pages are exempt — they use badge auth, not session auth.
let sessionExpiryNotified = false;

// Routes that run on the production floor as badge-authenticated kiosks.
// A session expiry on these pages should silently clear tokens but NOT
// redirect to /login — that would disrupt workers mid-task.
const KIOSK_ROUTES = [
  '/kiosk',
  '/p2-traveler',
  '/p2-traveler-viewer',
  '/traveler',
  '/production/timers',
  '/badge-scan',
];

function isKioskRoute(): boolean {
  const path = window.location.pathname;
  return KIOSK_ROUTES.some(r => path === r || path.startsWith(r + '/'));
}

function isLoginRoute(): boolean {
  return window.location.pathname === '/login';
}

function isLocalDevelopmentHost(): boolean {
  const hostname = window.location.hostname;
  return hostname.includes('localhost') || hostname.includes('127.0.0.1');
}

function handleSessionExpiry(reason: 'expired' | 'unauthorized' = 'expired') {
  if (sessionExpiryNotified) return;
  sessionExpiryNotified = true;

  // Clear stored tokens regardless of page type
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('jwtToken');

  // If a background request discovers stale auth while the user is already on
  // the login screen, clean up quietly instead of showing an access-denied
  // toast and reloading the page they are trying to use.
  if (isLoginRoute()) {
    console.warn(`[AUTH] Session ${reason} on login page - tokens cleared, no toast`);
    sessionExpiryNotified = false;
    return;
  }

  // On kiosk/floor pages: silently drop the expired session without
  // redirecting — the badge scan flow still works without a session.
  if (isKioskRoute()) {
    console.warn(`[AUTH] Session ${reason} on kiosk page — tokens cleared, no redirect`);
    sessionExpiryNotified = false;
    return;
  }

  console.warn(`[AUTH] Session ${reason} — redirecting to login`);

  // Show toast via a custom event so we don't depend on a specific toast library import here
  window.dispatchEvent(
    new CustomEvent('session:expired', { detail: { reason } })
  );

  // Redirect after a brief pause so the toast is visible
  setTimeout(() => {
    sessionExpiryNotified = false;
    const currentPath = window.location.pathname;
    const current = currentPath + window.location.search;
    const loginUrl =
      currentPath !== '/' && currentPath !== '/login'
        ? `/login?redirect=${encodeURIComponent(current)}`
        : '/login';
    window.location.href = loginUrl;
  }, 2000);
}

// Reset the notification flag when the user navigates to login (e.g., after manual logout)
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (window.location.pathname === '/login') {
      sessionExpiryNotified = false;
    }
  });
}

// ─── Session refresh helper ───────────────────────────────────────────────────
// Calls /api/auth/session to confirm whether the session is still valid.
// Returns true if the session is still alive, false otherwise.
async function checkSessionAlive(): Promise<boolean> {
  try {
    const storedToken = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
    });
    if (res.ok) return true;
    console.warn(`[AUTH] Session check returned ${res.status} — session is gone`);
    return false;
  } catch {
    // Network error — treat as unknown; don't wipe the session
    return true;
  }
}

// ─── 401/403 interceptor ─────────────────────────────────────────────────────
// Invoked by apiRequest and getQueryFn when a session-gated endpoint returns
// 401 or 403.  Attempts one session refresh before giving up.
// Returns true if the caller should retry the original request, false otherwise.
async function handleAuthError(status: number, url: string): Promise<boolean> {
  console.warn(`[AUTH] ${status} on ${url} — checking session state`);

  // Local development uses a synthetic admin user in RouteGuard. Do not
  // convert arbitrary API 401/403s into a browser-level login redirect.
  if (isLocalDevelopmentHost()) return false;

  // Skip interception for auth endpoints themselves to avoid infinite loops
  if (url.includes('/api/auth/')) return false;

  const alive = await checkSessionAlive();
  if (!alive) {
    // Session is genuinely gone — notify and redirect
    handleSessionExpiry(status === 403 ? 'unauthorized' : 'expired');
    return false;
  }

  // Session is still alive — this was likely a transient auth desync.
  // Signal the caller to retry the original request once.
  console.warn(`[AUTH] Session alive — retrying ${url} once after ${status}`);
  return true;
}

export async function apiRequest(url: string, options: ApiRequestOptions = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const fullUrl = `${baseUrl}${url}`;

  const isDeployment =
    window.location.hostname.includes('.replit.app') ||
    window.location.hostname.includes('.repl.co') ||
    window.location.hostname.includes('agcompepoch.xyz');

  const defaultTimeout = isDeployment ? 15000 : 120000;
  const timeoutDuration = options.timeout ?? defaultTimeout;

  console.log(
    `🌐 API Request to ${url} (timeout: ${timeoutDuration}ms, deployment: ${isDeployment})`
  );

  const storedToken =
    localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
  const authHeader: HeadersInit = storedToken
    ? { Authorization: `Bearer ${storedToken}` }
    : {};

  const isFormData = options.body instanceof FormData;
  const defaultHeaders: HeadersInit = isFormData
    ? { ...authHeader, ...options.headers }
    : {
        'Content-Type': 'application/json',
        ...authHeader,
        ...options.headers,
      };
  
  if (options.idempotencyKey) {
    (defaultHeaders as any)['x-idempotency-key'] = options.idempotencyKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `🚨 API TIMEOUT: ${url} took longer than ${timeoutDuration}ms`
    );
    controller.abort();
  }, timeoutDuration);

  const { _isRetry, _transientRetryCount = 0, ...fetchOptions } = options;

  const config: RequestInit = {
    ...fetchOptions,
    headers: defaultHeaders,
    credentials: 'include',
    signal: controller.signal,
  };

  if (isFormData) {
    config.body = options.body;
  } else if (
    options.body &&
    typeof options.body === 'object' &&
    !(options.headers as any)?.['Content-Type']?.includes('multipart/form-data')
  ) {
    config.body = JSON.stringify(options.body);
  } else if (typeof options.body === 'string') {
    config.body = options.body;
  }

  try {
    const response = await fetch(fullUrl, config);
    clearTimeout(timeoutId);
    console.log(`✅ API Response from ${url}: ${response.status}`);

    if (!response.ok) {
      // ── 401/403 recovery ──────────────────────────────────────────────────
      if ((response.status === 401 || response.status === 403) && !_isRetry) {
        const shouldRetry = await handleAuthError(response.status, url);
        if (shouldRetry) {
          return apiRequest(url, { ...options, _isRetry: true });
        }
      }

      const text = await response.text();
      console.error("API error raw body:", text);
      
      let data: any = null;
      try { 
        data = JSON.parse(text); 
      } catch {
        // Not JSON
      }
      
      const errorMessage = normalizeApiErrorMessage(
        data?.message ||
        data?.error ||
        (typeof data?.details === 'string' ? data.details : null) ||
        (typeof data?.reason === 'string' ? data.reason : null) ||
        (Array.isArray(data?.details)
          ? data.details.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join(", ")
          : null) ||
        (Array.isArray(data?.issues)
          ? data.issues.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join(", ")
          : null) ||
        text ||
        `Request failed (${response.status})`
      );

      if (
        isServerStartingResponse(response.status, data, errorMessage) &&
        _transientRetryCount < MAX_TRANSIENT_RETRIES
      ) {
        const retryDelayMs = retryAfterMs(response);
        console.warn(
          `[API] ${url} returned startup 503; retrying in ${retryDelayMs}ms ` +
            `(${_transientRetryCount + 1}/${MAX_TRANSIENT_RETRIES})`
        );
        await delay(retryDelayMs);
        return apiRequest(url, {
          ...options,
          _transientRetryCount: _transientRetryCount + 1,
        });
      }

      if (response.status === 408 || errorMessage.includes('timeout')) {
        throw new Error(
          'Request timed out - possible database connectivity issues. Please try again.'
        );
      }

      const err: any = new Error(errorMessage);
      err.status = response.status;
      if (data) {
        err.responseData = data;
      }
      throw err;
    }

    if (
      response.status === 204 ||
      response.headers.get('content-length') === '0'
    ) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`💥 API Request failed for ${url}:`, error);

    if (error.name === 'AbortError') {
      if (isDeployment) {
        throw new Error(
          'Request timed out after 6 seconds. There may be database connectivity issues on the deployed site. Please try again.'
        );
      } else {
        throw new Error(
          'Request timed out. Please check your connection and try again.'
        );
      }
    }

    throw error;
  }
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const isDeployment =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('.replit.app') ||
        window.location.hostname.includes('.repl.co') ||
        window.location.hostname.includes('agcompepoch.xyz'));
    const timeoutDuration = isDeployment ? 45000 : 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(
        `🚨 QUERY TIMEOUT: ${queryKey.join('/')} took longer than ${timeoutDuration}ms`
      );
      controller.abort();
    }, timeoutDuration);

    const url = queryKey.join('/') as string;

    try {
      const storedToken =
        typeof window !== 'undefined'
          ? (localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken'))
          : null;

      const headers: HeadersInit = storedToken
        ? { Authorization: `Bearer ${storedToken}` }
        : {};

      const res = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeoutId);

      if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
        return null;
      }

      // ── 401/403 recovery (for TanStack Query fetches) ──────────────────────
      if ((res.status === 401 || res.status === 403) && !url.includes('/api/auth/')) {
        console.warn(`[AUTH] Query returned ${res.status} for ${url}`);
        const shouldRetry = await handleAuthError(res.status, url);
        if (shouldRetry) {
          // One automatic retry after confirming session is alive
          const retryHeaders: HeadersInit = storedToken
            ? { Authorization: `Bearer ${storedToken}` }
            : {};
          const retryRes = await fetch(url, {
            credentials: 'include',
            headers: retryHeaders,
          });
          await throwIfResNotOk(retryRes);
          return await retryRes.json();
        }
        // Session gone — handleAuthError already fired the redirect
        await throwIfResNotOk(res);
        return await res.json();
      }

      if (res.status === 503) {
        const text = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          // Not JSON
        }

        const errorMessage = data?.message || data?.error || text || res.statusText;
        if (isServerStartingResponse(res.status, data, errorMessage)) {
          let retryDelayMs = retryAfterMs(res);

          for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
            console.warn(
              `[QUERY] ${url} returned startup 503; retrying in ${retryDelayMs}ms ` +
                `(${attempt}/${MAX_TRANSIENT_RETRIES})`
            );
            await delay(retryDelayMs);

            const retryRes = await fetch(url, {
              credentials: 'include',
              signal: controller.signal,
              headers,
            });

            if (retryRes.status !== 503) {
              await throwIfResNotOk(retryRes);
              return await retryRes.json();
            }

            const retryText = await retryRes.text();
            let retryData: any = null;
            try {
              retryData = JSON.parse(retryText);
            } catch {
              // Not JSON
            }

            const retryMessage = retryData?.message || retryData?.error || retryText || retryRes.statusText;
            if (!isServerStartingResponse(retryRes.status, retryData, retryMessage)) {
              const retryErr: any = new Error(retryMessage);
              retryErr.status = retryRes.status;
              if (retryData) {
                retryErr.responseData = retryData;
                Object.assign(retryErr, retryData);
              }
              throw retryErr;
            }

            retryDelayMs = retryAfterMs(retryRes);
          }
        }

        const err: any = new Error(errorMessage);
        err.status = res.status;
        if (data) {
          err.responseData = data;
          Object.assign(err, data);
        }
        throw err;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

export async function duplicateOrder(orderId: string, options?: { count?: number }) {
  return apiRequest(`/api/orders/duplicate/${orderId}`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000,
      retry: (failureCount: number, error: any) => {
        if (error?.message?.includes('Not authenticated') || error?.message?.includes('Session expired')) {
          return false;
        }
        if (error?.status === 429) {
          return false;
        }
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        if (error?.status === 503) {
          return failureCount < 6;
        }
        return failureCount < 1;
      },
      retryDelay: (attemptIndex: number, error: any) => {
        if (error?.status === 503) {
          return Math.min(1000 * 2 ** attemptIndex, 5000);
        }
        return 1000;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
