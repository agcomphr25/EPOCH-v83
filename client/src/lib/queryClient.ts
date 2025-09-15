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

  // Check if we're on a deployment site for ultra-aggressive timeouts
  const isDeployment = window.location.hostname.includes('.replit.app') || 
                      window.location.hostname.includes('.repl.co') ||
                      window.location.hostname.includes('agcompepoch.xyz');
  
  // Use much shorter timeout for deployments with database issues
  const timeoutDuration = isDeployment ? 6000 : 30000; // 6 seconds for deployment, 30 for dev
  
  console.log(`🌐 API Request to ${url} (timeout: ${timeoutDuration}ms, deployment: ${isDeployment})`);

  // Get tokens from localStorage (prefer JWT token for API requests)
  const jwtToken = localStorage.getItem('jwtToken') || '';
  const sessionToken = localStorage.getItem('sessionToken') || '';
  const token = jwtToken || sessionToken;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  // Add timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`🚨 API TIMEOUT: ${url} took longer than ${timeoutDuration}ms`);
    controller.abort();
  }, timeoutDuration);

  const config: RequestInit = {
    ...options,
    headers: defaultHeaders,
    credentials: 'include', // Include cookies for session-based auth
    signal: controller.signal,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.headers as any)?.['Content-Type']?.includes('multipart/form-data')) {
    config.body = JSON.stringify(options.body);
  } else if (typeof options.body === 'string') {
    config.body = options.body;
  }

  try {
    const response = await fetch(fullUrl, config);
    clearTimeout(timeoutId);
    console.log(`✅ API Response from ${url}: ${response.status}`);

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
      
      // Special handling for deployment database timeouts
      if (response.status === 408 || errorMessage.includes('timeout')) {
        throw new Error('Request timed out - possible database connectivity issues. Please try again.');
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
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`💥 API Request failed for ${url}:`, error);
    
    // Enhanced error handling for deployments
    if (error.name === 'AbortError') {
      if (isDeployment) {
        throw new Error('Request timed out after 6 seconds. There may be database connectivity issues on the deployed site. Please try again.');
      } else {
        throw new Error('Request timed out. Please check your connection and try again.');
      }
    }
    
    throw error;
  }
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

    // Deployment-aware timeout to prevent hanging
    const isDeployment = typeof window !== 'undefined' && (
      window.location.hostname.includes('.replit.app') || 
      window.location.hostname.includes('.repl.co') ||
      window.location.hostname.includes('agcompepoch.xyz')
    );
    const timeoutDuration = isDeployment ? 6000 : 8000; // 6 seconds for deployment, 8 for dev
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`🚨 QUERY TIMEOUT: ${queryKey.join('/')} took longer than ${timeoutDuration}ms`);
      controller.abort();
    }, timeoutDuration);
    
    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
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