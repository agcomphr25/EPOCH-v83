import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const errorData = await res.json();
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
    throw new Error(errorMessage);
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

export async function apiRequest(url: string, options: ApiRequestOptions = {}) {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const fullUrl = `${baseUrl}${url}`;

  // Get tokens from localStorage (prefer JWT token for API requests)
  const jwtToken = localStorage.getItem('jwtToken') || '';
  const sessionToken = localStorage.getItem('sessionToken') || '';
  const token = jwtToken || sessionToken;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const config: RequestInit = {
    ...options,
    headers: defaultHeaders,
    credentials: 'include', // Include cookies for session-based auth
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.headers as any)?.['Content-Type']?.includes('multipart/form-data')) {
    config.body = JSON.stringify(options.body);
  } else if (typeof options.body === 'string') {
    config.body = options.body;
  }

  const response = await fetch(fullUrl, config);

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If JSON parsing fails, use text
      try {
        const text = await response.text();
        errorMessage = text || errorMessage;
      } catch {
        // Keep the default error message
      }
    }
    throw new Error(errorMessage);
  }

  // Handle empty responses (like 204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  // For non-JSON responses, return text
  return response.text();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Get tokens for authenticated requests
    const jwtToken = localStorage.getItem('jwtToken') || '';
    const sessionToken = localStorage.getItem('sessionToken') || '';
    const token = jwtToken || sessionToken;

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute instead of Infinity for better data freshness
      retry: 1, // Allow 1 retry instead of false
    },
    mutations: {
      retry: false,
    },
  },
});