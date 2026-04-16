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
      // If JSON parsing fails, fall back to text
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
  timeout?: number; // Custom timeout in milliseconds
  idempotencyKey?: string; // Optional idempotency key for order creation endpoints
}

export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function apiRequest(url: string, options: ApiRequestOptions = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const fullUrl = `${baseUrl}${url}`;

  // Check if we're on a deployment site
  const isDeployment =
    window.location.hostname.includes('.replit.app') ||
    window.location.hostname.includes('.repl.co') ||
    window.location.hostname.includes('agcompepoch.xyz');

  // Use reasonable timeout for deployments (allow for database latency with large datasets)
  // Allow custom timeout override for slow operations like AI generation
  const defaultTimeout = isDeployment ? 15000 : 120000;
  const timeoutDuration = options.timeout ?? defaultTimeout;

  console.log(
    `🌐 API Request to ${url} (timeout: ${timeoutDuration}ms, deployment: ${isDeployment})`
  );

  // Don't set Content-Type for FormData - browser will set it automatically with correct boundary
  const isFormData = options.body instanceof FormData;
  const defaultHeaders: HeadersInit = isFormData
    ? { ...options.headers }
    : {
        'Content-Type': 'application/json',
        ...options.headers,
      };
  
  // Add idempotency key header if provided (for order creation endpoints)
  if (options.idempotencyKey) {
    (defaultHeaders as any)['x-idempotency-key'] = options.idempotencyKey;
  }

  // Add timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `🚨 API TIMEOUT: ${url} took longer than ${timeoutDuration}ms`
    );
    controller.abort();
  }, timeoutDuration);

  const config: RequestInit = {
    ...options,
    headers: defaultHeaders,
    credentials: 'include', // Include cookies for session-based auth
    signal: controller.signal,
  };

  // Handle different body types
  if (isFormData) {
    // FormData: pass as-is, browser handles everything
    config.body = options.body;
  } else if (
    options.body &&
    typeof options.body === 'object' &&
    !(options.headers as any)?.['Content-Type']?.includes('multipart/form-data')
  ) {
    // JSON objects: stringify
    config.body = JSON.stringify(options.body);
  } else if (typeof options.body === 'string') {
    // String body: pass as-is
    config.body = options.body;
  }

  try {
    const response = await fetch(fullUrl, config);
    clearTimeout(timeoutId);
    console.log(`✅ API Response from ${url}: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error("API error raw body:", text);
      
      let data: any = null;
      try { 
        data = JSON.parse(text); 
      } catch {
        // Not JSON
      }
      
      // Build error message from various possible formats
      const errorMessage =
        data?.message ||
        data?.error ||
        (Array.isArray(data?.details)
          ? data.details.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join(", ")
          : null) ||
        (Array.isArray(data?.issues)
          ? data.issues.map((i: any) => `${(i.path || []).join(".")}: ${i.message}`).join(", ")
          : null) ||
        text ||
        `Request failed (${response.status})`;

      // Special handling for deployment database timeouts
      if (response.status === 408 || errorMessage.includes('timeout')) {
        throw new Error(
          'Request timed out - possible database connectivity issues. Please try again.'
        );
      }

      const err: any = new Error(errorMessage);
      if (data) {
        err.responseData = data;
        err.status = response.status;
      }
      throw err;
    }

    // Handle empty responses (like 204 No Content)
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

    // For non-JSON responses, return text
    return response.text();
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`💥 API Request failed for ${url}:`, error);

    // Enhanced error handling for deployments
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
    // Deployment-aware timeout to prevent hanging
    const isDeployment =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('.replit.app') ||
        window.location.hostname.includes('.repl.co') ||
        window.location.hostname.includes('agcompepoch.xyz'));
    const timeoutDuration = isDeployment ? 45000 : 30000; // 45 seconds for deployment (handle cold starts), 30 for dev

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(
        `🚨 QUERY TIMEOUT: ${queryKey.join('/')} took longer than ${timeoutDuration}ms`
      );
      controller.abort();
    }, timeoutDuration);

    try {
      const res = await fetch(queryKey.join('/') as string, {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
        return null;
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
      staleTime: 60000, // 1 minute instead of Infinity for better data freshness
      retry: (failureCount: number, error: any) => {
        if (error?.message?.includes('Not authenticated') || error?.message?.includes('Session expired')) {
          return false;
        }
        if (error?.status === 429) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
