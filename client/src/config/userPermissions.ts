// User Permission Mapping
// Maps each username to their allowed navigation routes based on dashboard cards
// This is the SOURCE OF TRUTH for user access - navbar filtering uses these routes

export interface UserPermissions {
  routes: string[];
  fullAccess?: boolean;
}

// Default routes for users not explicitly listed
export const DEFAULT_USER_ROUTES: string[] = ['/employee-portal'];

export const USER_PERMISSIONS: Record<string, UserPermissions> = {
  // Admin users with full navigation access
  glennj: {
    routes: [],
    fullAccess: true,
  },
  tasham: {
    routes: [],
    fullAccess: true,
  },

  staciw: {
    routes: [],
    fullAccess: true,
  },

  // Regular users with limited access based on their dashboard cards
  // Routes must match EXACTLY what's in Navigation.tsx for filtering to work

  agrace: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/department-queue/production-queue',
      '/inventory/dashboard',
      '/inventory/manager',
      '/inventory/enhanced-mrp',
      '/customers',
      '/customer-management',
      '/gateway-reports',
    ],
  },

  faleeshah: {
    routes: [
      '/department-queue/finish-qc',
      '/department-queue/paint',
      '/department-queue/qc-shipping',
      '/department-queue/shipping',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/customers',
      '/customer-management',
      '/inventory/parts-request',
    ],
  },

  angiet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/department-queue/production-queue',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/customers',
      '/customer-management',
    ],
  },

  blaket: {
    routes: [
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/department-queue/production-queue',
      '/inventory/dashboard',
      '/inventory/manager',
      '/inventory/enhanced-mrp',
      '/orders-list',
      '/orders',
      '/all-orders',
    ],
  },

  bradw: {
    routes: [
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  darleneb: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/draft-orders',
      '/customers',
      '/customer-management',
    ],
  },

  halls: {
    routes: [
      '/department-queue/production-queue',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/orders-list',
      '/orders',
      '/all-orders',
    ],
  },

  hunta: {
    routes: [
      '/department-queue/production-queue',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/orders-list',
      '/orders',
      '/all-orders',
    ],
  },

  jens: {
    routes: [
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/employee-portal',
      '/barcode-scanner',
      '/inventory/parts-request',
    ],
  },

  joeyb: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/gunsmith',
      '/cutting-control-center',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/inventory/parts-request',
    ],
  },

  johnl: {
    routes: [
      '/department-queue/cnc',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  lauriet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/customers',
      '/customer-management',
    ],
  },

  tandyd: {
    routes: [
      '/department-queue/production-queue',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/orders-list',
      '/orders',
      '/all-orders',
    ],
  },

  tandym: {
    routes: [
      '/department-queue/production-queue',
      '/enhanced-layup-scheduler',
      '/simplified-layup-scheduler',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/inventory/dashboard',
      '/inventory/enhanced-mrp',
    ],
  },

  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders',
      '/all-orders',
      '/maintenance',
      '/inventory/parts-request',
    ],
  },
};

/**
 * Normalize a route by removing dynamic segments (e.g., /employee-detail/123 -> /employee-detail)
 * This allows matching routes with parameters against their base paths
 */
function normalizeRoute(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const normalizedSegments: string[] = [];
  
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      break;
    }
    if (/^[a-f0-9-]{20,}$/i.test(segment)) {
      break;
    }
    normalizedSegments.push(segment);
  }
  
  return '/' + normalizedSegments.join('/');
}

/**
 * Check if a route matches a pattern (supports base path matching for dynamic routes)
 */
function routeMatches(currentRoute: string, allowedRoute: string): boolean {
  if (currentRoute === allowedRoute) {
    return true;
  }
  
  const normalizedCurrent = normalizeRoute(currentRoute);
  if (normalizedCurrent === allowedRoute) {
    return true;
  }
  
  if (currentRoute.startsWith(allowedRoute + '/')) {
    return true;
  }
  
  return false;
}

/**
 * Check if the route is the user's own personal dashboard
 * Personal dashboards follow the pattern: /{username}-dashboard
 */
function isOwnPersonalDashboard(username: string, route: string): boolean {
  const lowerUsername = username.toLowerCase();
  const lowerRoute = route.toLowerCase();
  return lowerRoute === `/${lowerUsername}-dashboard`;
}

/**
 * Check if a user has access to a specific route
 * Now supports role-based access in addition to username-based access
 * Also handles dynamic routes with parameters
 * Users can always access their own personal dashboard
 */
export function hasRouteAccess(
  username: string, 
  route: string, 
  userRole?: string
): boolean {
  const lowerUsername = username.toLowerCase();
  
  // Always allow users to access their own personal dashboard
  if (isOwnPersonalDashboard(lowerUsername, route)) {
    return true;
  }
  
  const permissions = USER_PERMISSIONS[lowerUsername];

  // If user is not in permissions list, they get default routes only
  if (!permissions) {
    // Check if route is in default routes
    for (const defaultRoute of DEFAULT_USER_ROUTES) {
      if (routeMatches(route, defaultRoute)) {
        return true;
      }
    }
    return hasRoleBasedAccess(route, userRole);
  }

  if (permissions.fullAccess) {
    return true;
  }

  for (const allowedRoute of permissions.routes) {
    if (routeMatches(route, allowedRoute)) {
      return true;
    }
  }

  return hasRoleBasedAccess(route, userRole);
}

/**
 * Role-based route access configuration
 * Maps route patterns to the roles that can access them
 */
const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  '/admin/orders': ['ADMIN', 'OWNER'],
  '/gateway-reports': ['ADMIN', 'OWNER'],
  '/inventory/enhanced-mrp': ['ADMIN', 'INVENTORY_MANAGER'],
  '/inventory/consolidated-needs': ['ADMIN', 'OWNER'],
  '/user-management': ['ADMIN', 'OWNER'],
  '/settings': ['ADMIN', 'OWNER'],
  '/employee': ['ADMIN', 'OWNER'],
  '/employee-dashboard': ['ADMIN', 'OWNER'],
  '/employee-detail': ['ADMIN', 'OWNER'],
  '/time-clock-admin': ['ADMIN', 'OWNER'],
  '/finance': ['ADMIN', 'OWNER'],
  '/finance/dashboard': ['ADMIN', 'OWNER'],
  '/finance/cost-centers': ['ADMIN', 'OWNER'],
  '/finance/cost-accounting': ['ADMIN', 'OWNER'],
  '/finance/bulk-payment': ['ADMIN', 'OWNER'],
  '/finance/ap': ['ADMIN', 'OWNER'],
  '/finance/ar': ['ADMIN', 'OWNER'],
  '/finance/cogs': ['ADMIN', 'OWNER'],
  '/finance/monthly-fulfilled': ['ADMIN', 'OWNER'],
  '/refund-queue': ['ADMIN', 'OWNER'],
  '/credit-memo': ['ADMIN', 'OWNER'],
  '/badge-configuration': ['ADMIN', 'OWNER'],
  '/pdf-templates': ['ADMIN', 'OWNER'],
  '/training-control-center': ['ADMIN', 'OWNER'],
  '/discounts': ['ADMIN', 'OWNER'],
  '/feature-manager': ['ADMIN', 'OWNER'],
  '/stock-models': ['ADMIN', 'OWNER'],
  '/robust-bom-administration': ['ADMIN', 'OWNER'],
};

/**
 * Check if a role has access to a specific route
 */
function hasRoleBasedAccess(route: string, userRole?: string): boolean {
  if (!userRole) return false;

  const role = userRole.toUpperCase();
  const normalizedRoute = normalizeRoute(route);

  for (const [routePattern, allowedRoles] of Object.entries(ROLE_ROUTE_ACCESS)) {
    if (routeMatches(route, routePattern) || routeMatches(normalizedRoute, routePattern)) {
      if (allowedRoles.includes(role)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all allowed routes for a user
 */
export function getAllowedRoutes(username: string): string[] {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];

  if (!permissions) {
    return DEFAULT_USER_ROUTES;
  }

  if (permissions.fullAccess) {
    return []; // Empty array indicates full access
  }

  return permissions.routes;
}

/**
 * Check if a user has full navigation access
 */
export function hasFullAccess(username: string): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];
  return permissions?.fullAccess === true;
}

/**
 * Get the user's own dashboard route
 */
export function getUserDashboardRoute(username: string): string {
  return `/${username.toLowerCase()}-dashboard`;
}
