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
    fullAccess: true
  },
  tasham: {
    routes: [],
    fullAccess: true
  },
  
  staciw: {
    routes: [],
    fullAccess: true
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
      '/customer-management'
    ]
  },
  
  faleeshah: {
    routes: [
      '/department-queue/finish-qc',
      '/department-queue/paint',
      '/department-queue/qc-shipping',
      '/department-queue/shipping',
      '/orders-list',
      '/all-orders',
      '/customer-management'
    ]
  },
  
  angiet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/production-queue',
      '/layup-scheduler',
      '/customer-management'
    ]
  },
  
  blaket: {
    routes: [
      '/layup-scheduler',
      '/production-queue',
      '/inventory/dashboard',
      '/inventory/manager',
      '/orders-list',
      '/orders'
    ]
  },
  
  bradw: {
    routes: [
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders',
      '/employee-portal'
    ]
  },
  
  darleneb: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/draft-orders',
      '/customers',
      '/customer-management'
    ]
  },
  
  halls: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders'
    ]
  },
  
  hunta: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders'
    ]
  },
  
  jens: {
    routes: [
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders',
      '/employee-portal'
    ]
  },
  
  joeyb: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders'
    ]
  },
  
  johnl: {
    routes: [
      '/department-queue/cnc',
      '/orders-list',
      '/orders',
      '/employee-portal'
    ]
  },
  
  lauriet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders',
      '/customer-management'
    ]
  },
  
  tandyd: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders'
    ]
  },
  
  tandym: {
    routes: [
      '/production-queue',
      '/layup-scheduler',
      '/orders-list',
      '/orders',
      '/inventory/dashboard'
    ]
  },
  
  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
      '/all-orders',
      '/maintenance'
    ]
  }
};

/**
 * Check if a user has access to a specific route
 */
export function hasRouteAccess(username: string, route: string): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];
  
  if (!permissions) {
    return false; // No permissions defined = no access
  }
  
  if (permissions.fullAccess) {
    return true; // Full access users can access everything
  }
  
  return permissions.routes.includes(route);
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
