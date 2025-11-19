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
      '/inventory/consolidated-needs',
      '/customers',
      '/customer-management',
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
      '/inventory/consolidated-needs',
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
    ],
  },

  joeyb: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders',
    ],
  },

  johnl: {
    routes: [
      '/department-queue/cnc',
      '/orders-list',
      '/orders',
      '/employee-portal',
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
      '/inventory/consolidated-needs',
    ],
  },

  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
      '/all-orders',
      '/maintenance',
    ],
  },
};

/**
 * Check if a user has access to a specific route
 * Now supports role-based access in addition to username-based access
 */
export function hasRouteAccess(
  username: string, 
  route: string, 
  userRole?: string
): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];

  if (!permissions) {
    // No username permissions defined, check role-based access
    return hasRoleBasedAccess(route, userRole);
  }

  if (permissions.fullAccess) {
    return true; // Full access users can access everything
  }

  // Check if route is in user's permission list
  if (permissions.routes.includes(route)) {
    return true;
  }

  // Fall back to role-based access
  return hasRoleBasedAccess(route, userRole);
}

/**
 * Check if a role has access to a specific route
 */
function hasRoleBasedAccess(route: string, userRole?: string): boolean {
  if (!userRole) return false;

  const role = userRole.toUpperCase();

  // Admin Panel route requires ADMIN or OWNER role
  if (route === '/admin/orders' && (role === 'ADMIN' || role === 'OWNER')) {
    return true;
  }

  // Add more role-based route mappings here as needed

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
