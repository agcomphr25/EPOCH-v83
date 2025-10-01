/**
 * Environment detection utilities for authentication
 */

/**
 * Check if we're running in a production/deployment environment
 * Production environments require authentication
 */
export function isProductionEnvironment(): boolean {
  const host = window.location.host;
  
  // Development environments (bypass authentication)
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  const isReplitDev = host.includes('replit.dev');
  
  // Production environments (require authentication)
  const isReplitApp = host.includes('.replit.app');
  const isReplCo = host.includes('.repl.co');
  const isCustomDomain = host.includes('agcompepoch.xyz');
  
  const isDevelopment = isLocalhost || isReplitDev;
  const isProduction = isReplitApp || isReplCo || isCustomDomain;
  
  // If explicitly production, require auth
  if (isProduction) {
    console.log('🔒 PRODUCTION MODE: Authentication required for:', host);
    return true;
  }
  
  // If explicitly development, bypass auth
  if (isDevelopment) {
    console.log('🔧 DEVELOPMENT MODE: Authentication bypassed for:', host);
    return false;
  }
  
  // Default to production (safer)
  console.log('⚠️  UNKNOWN ENVIRONMENT: Defaulting to production mode for:', host);
  return true;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const currentUser = localStorage.getItem('currentUser');
  const sessionToken = localStorage.getItem('sessionToken');
  const jwtToken = localStorage.getItem('jwtToken');
  
  // In development, allow access without tokens
  if (!isProductionEnvironment()) {
    return true;
  }
  
  // In production, require at least a currentUser
  return !!(currentUser || sessionToken || jwtToken);
}
