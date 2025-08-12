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

export async function apiRequest(url: string, options: RequestInit = {}) {
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

  if (options.body && typeof options.body === 'object' && !(options.headers as any)?.['Content-Type']?.includes('multipart/form-data')) {
    config.body = JSON.stringify(options.body);
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

  return response.json();
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