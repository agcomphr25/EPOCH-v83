// Username to Dashboard Route Mapping
// This maps each username to their personalized dashboard

export const DASHBOARD_ROUTES: Record<string, string> = {
  // Admin users
  admin: '/admin-dashboard',
  glennj: '/admin-dashboard',
  staciw: '/admin-dashboard',
  
  // Test/Development users
  automation_user: '/', // Default dashboard for automation
  deploy: '/', // Default dashboard for deploy user
  
  // Production users
  agrace: '/ag-dashboard',
  angiet: '/angiet-dashboard',
  blaket: '/blaket-dashboard',
  bradw: '/bradw-dashboard',
  darleneb: '/darleneb-dashboard',
  faleeshah: '/faleeshah-dashboard',
  halls: '/halls-dashboard',
  hunta: '/hunta-dashboard',
  jens: '/jens-dashboard',
  joeyb: '/joeyb-dashboard',
  johnl: '/johnl-dashboard',
  lauriet: '/lauriet-dashboard',
  staciw: '/admin-dashboard',
  tandyd: '/tandyd-dashboard',
  tandym: '/tandym-dashboard',
  tasham: '/admin-dashboard',
  tims: '/tims-dashboard',
};

/**
 * Get dashboard route for a given username
 * Returns user's personalized dashboard or default dashboard if not found
 */
export function getDashboardRoute(username: string): string {
  const route = DASHBOARD_ROUTES[username.toLowerCase()];
  return route || '/'; // Default to main dashboard if no mapping found
}

/**
 * Check if a user has a personalized dashboard
 */
export function hasPersonalizedDashboard(username: string): boolean {
  return username.toLowerCase() in DASHBOARD_ROUTES;
}
