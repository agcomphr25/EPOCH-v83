/**
 * Environment detection utilities for authentication
 */

/**
 * Check if we're running in a production/deployment environment
 * Production environments require authentication
 * CURRENTLY SET TO REQUIRE LOGIN FOR ALL ENVIRONMENTS FOR TESTING
 */
export function isProductionEnvironment(): boolean {
  const host = window.location.host;
  
  // FORCE AUTHENTICATION ON ALL ENVIRONMENTS FOR TESTING
  console.log('🔒 AUTHENTICATION REQUIRED FOR ALL ENVIRONMENTS:', host);
  return true;
  
  // ORIGINAL CODE (COMMENTED OUT FOR TESTING):
  // Development environments (bypass authentication)
  // const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  // const isReplitDev = host.includes('replit.dev');
  // 
  // Production environments (require authentication)
  // const isReplitApp = host.includes('.replit.app');
  // const isReplCo = host.includes('.repl.co');
  // const isCustomDomain = host.includes('agcompepoch.xyz');
  // 
  // const isDevelopment = isLocalhost || isReplitDev;
  // const isProduction = isReplitApp || isReplCo || isCustomDomain;
  // 
  // If explicitly production, require auth
  // if (isProduction) {
  //   console.log('🔒 PRODUCTION MODE: Authentication required for:', host);
  //   return true;
  // }
  // 
  // If explicitly development, bypass auth
  // if (isDevelopment) {
  //   console.log('🔧 DEVELOPMENT MODE: Authentication bypassed for:', host);
  //   return false;
  // }
  // 
  // Default to production (safer)
  // console.log('⚠️  UNKNOWN ENVIRONMENT: Defaulting to production mode for:', host);
  // return true;
}

/**
 * Check if user is authenticated (relies on backend validation via cookie)
 */
export function isAuthenticated(): boolean {
  const currentUser = localStorage.getItem('currentUser');
  
  // In development, allow access without validation
  if (!isProductionEnvironment()) {
    return true;
  }
  
  // In production, check if user data exists (actual validation happens server-side)
  return !!currentUser;
}

/**
 * Validate session against backend (async) - This is the authoritative check
 */
export async function validateSessionAsync(): Promise<boolean> {
  // In development, skip backend validation
  if (!isProductionEnvironment()) {
    return true;
  }

  try {
    // Get token from localStorage
    const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch('/api/auth/validate', {
      credentials: 'include',
      headers
    });

    if (!response.ok) {
      // Session is invalid, clean up localStorage
      localStorage.removeItem('currentUser');
      localStorage.removeItem('userData');
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('jwtToken');
      return false;
    }

    const data = await response.json();
    if (data.valid && data.user) {
      // Update localStorage with latest user data
      localStorage.setItem('currentUser', data.user.username);
      localStorage.setItem('userData', JSON.stringify(data.user));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
}
