// User Permission Mapping
// Maps each username to their allowed navigation routes based on dashboard cards

export interface UserPermissions {
  routes: string[];
  fullAccess?: boolean;
}

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

  agrace: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/layup-scheduler',
      '/production-queue',
      '/inventory/dashboard',
      '/inventory/manager',
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
      '/all-orders',
      '/customer-management',
      '/inventory/parts-request',
    ],
  },

  angiet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/production-queue',
      '/layup-scheduler',
      '/customer-management',
    ],
  },

  blaket: {
    routes: [
      '/layup-scheduler',
      '/production-queue',
      '/inventory/dashboard',
      '/inventory/manager',
      '/orders-list',
      '/orders',
    ],
  },

  bradw: {
    routes: [
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  darleneb: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/draft-orders',
      '/customers',
      '/customer-management',
    ],
  },

  halls: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders',
    ],
  },

  hunta: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders',
    ],
  },

  jens: {
    routes: [
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders',
      '/employee-portal',
      '/barcode-scanner',
      '/inventory/parts-request',
    ],
  },

  joeyb: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders',
      '/inventory/parts-request',
    ],
  },

  johnl: {
    routes: [
      '/department-queue/cnc',
      '/orders-list',
      '/orders',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  lauriet: {
    routes: ['/order-entry', '/orders-list', '/orders', '/customer-management'],
  },

  tandyd: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders',
    ],
  },

  tandym: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders',
      '/inventory/dashboard',
    ],
  },

  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
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
 * Check if a user has access to a specific route
 * Now supports role-based access in addition to username-based access
 * Also handles dynamic routes with parameters
 */
export function hasRouteAccess(
  username: string, 
  route: string, 
  userRole?: string
): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];

  if (!permissions) {
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
  '/employee-dashboard': ['ADMIN', 'OWNER'],
  '/employee-detail': ['ADMIN', 'OWNER'],
  '/time-clock-admin': ['ADMIN', 'OWNER'],
  '/finance': ['ADMIN', 'OWNER'],
  '/cost-accounting': ['ADMIN', 'OWNER'],
  '/refund-queue': ['ADMIN', 'OWNER'],
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
    return [];
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
