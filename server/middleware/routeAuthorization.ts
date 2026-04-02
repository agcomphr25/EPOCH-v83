import { Request, Response, NextFunction } from 'express';
import './auth';

interface UserPermissions {
  routes: string[];
  fullAccess?: boolean;
}

const DEFAULT_USER_ROUTES: string[] = ['/employee-portal'];

const USER_PERMISSIONS: Record<string, UserPermissions> = {
  glennj: { routes: [], fullAccess: true },
  tasham: { routes: [], fullAccess: true },
  staciw: { routes: [], fullAccess: true },

  agrace: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/inventory/enhanced-mrp',
      '/inventory/parts-request',
      '/customers',
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
      '/orders-management',
      '/customers',
      '/inventory/parts-request',
      '/admin/order-lookup',
    ],
  },

  angiet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/customers',
    ],
  },

  blaket: {
    routes: [
      '/department-queue/layup-plugging',
      '/department-queue/production-queue',
      '/inventory/enhanced-mrp',
      '/inventory/parts-request',
      '/orders-list',
      '/orders-management',
    ],
  },

  bradw: {
    routes: [
      '/department-queue/gunsmith',
      '/orders-list',
      '/orders-management',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  darleneb: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/customers',
      '/customer-satisfaction',
      '/shipping-tracker',
      '/discounts',
      '/marketing-communications',
      '/finance/bulk-payment',
      '/watch-rules',
      '/refund-request',
    ],
  },

  halls: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
    ],
  },

  hunta: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
    ],
  },

  jens: {
    routes: [
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders-management',
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
      '/orders-management',
      '/inventory/parts-request',
    ],
  },

  johnl: {
    routes: [
      '/department-queue/cnc',
      '/orders-list',
      '/orders-management',
      '/employee-portal',
      '/inventory/parts-request',
    ],
  },

  lauriet: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/customers',
      '/inventory/enhanced-mrp',
      '/p2-control-center',
      '/inventory/consolidated-needs',
      '/vendors',
      '/vendor-pos',
      '/inventory/receiving',
      '/inventory/receiving-legacy',
      '/master-document-register',
    ],
  },

  tandyd: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
    ],
  },

  tandym: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
      '/inventory/enhanced-mrp',
    ],
  },

  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders-management',
      '/maintenance',
      '/inventory/parts-request',
    ],
  },
};

const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  '/admin/orders': ['ADMIN', 'OWNER'],
  '/gateway-reports': ['ADMIN', 'OWNER'],
  '/inventory/enhanced-mrp': ['ADMIN', 'INVENTORY_MANAGER'],
  '/user-management': ['ADMIN', 'OWNER'],
  '/employee': ['ADMIN', 'OWNER'],
  '/time-clock-admin': ['ADMIN', 'OWNER'],
  '/financial-review': ['ADMIN', 'OWNER', 'FINANCE'],
  '/financial-review/sessions': ['ADMIN', 'OWNER', 'FINANCE'],
  '/financial-review/sessions/:monthKey': ['ADMIN', 'OWNER', 'FINANCE'],
  '/finance/dashboard': ['ADMIN', 'OWNER'],
  '/finance/cost-centers': ['ADMIN', 'OWNER'],
  '/finance/cost-accounting': ['ADMIN', 'OWNER'],
  '/finance/accounting': ['ADMIN'],
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
  '/p2-control-center': ['ADMIN', 'OWNER'],
  '/manufacturing-queue': ['ADMIN', 'OWNER'],
  '/po-products': ['ADMIN', 'OWNER'],
  '/purchase-orders': ['ADMIN', 'OWNER'],
  '/analytics': ['ADMIN', 'OWNER'],
  '/nonconformance': ['ADMIN', 'OWNER'],
  '/rts': ['ADMIN', 'OWNER'],
  '/qc': ['ADMIN', 'OWNER'],
  '/vendors': ['ADMIN', 'OWNER'],
  '/vendor-pos': ['ADMIN', 'OWNER'],
};

const API_TO_FRONTEND_ROUTE_MAPPING: Record<string, string[]> = {
  '/api/users': ['/user-management'],
  '/api/employees': ['/employee'],
  '/api/orders': ['/orders-list', '/orders-management', '/order-entry'],
  '/api/customers': ['/customers'],
  '/api/inventory': ['/inventory/enhanced-mrp', '/inventory/parts-request', '/inventory/receiving', '/inventory/receiving-legacy', '/inventory/scanner'],
  '/api/payments': ['/finance/dashboard', '/finance/bulk-payment', '/finance/ap', '/finance/ar'],
  '/api/credit-memos': ['/credit-memo'],
  '/api/ar-invoices': ['/finance/invoices'],
  '/api/refunds': ['/refund-queue'],
  '/api/vendors': ['/vendors', '/vendor-pos'],
  '/api/purchase-orders': ['/purchase-orders'],
  '/api/cost-centers': ['/finance/cost-centers'],
  '/api/cost-accounting': ['/finance/cost-accounting'],
  '/api/discounts': ['/discounts'],
  // '/api/stock-models' removed - stock models are read-only reference data needed by many pages
  '/api/bom': ['/robust-bom-administration'],
  '/api/p2': ['/p2-control-center'],
  '/api/manufacturing': ['/manufacturing-queue'],
  '/api/shipping': ['/shipping-tracker', '/department-queue/shipping'],
  '/api/department': ['/department-queue/production-queue', '/department-queue/layup-plugging', '/department-queue/cnc', '/department-queue/finish', '/department-queue/finish-qc', '/department-queue/gunsmith', '/department-queue/paint', '/department-queue/qc-shipping', '/department-queue/shipping', '/department-queue/barcode'],
  '/api/production-queue': ['/department-queue/production-queue'],
  '/api/p1-po-queue': ['/department-queue/production-queue'],
  '/api/layup-schedule': ['/department-queue/production-queue', '/department-queue/layup-plugging'],
  '/api/kickbacks': ['/kickback-tracking'],
  '/api/nonconformance': ['/nonconformance'],
  '/api/qc': ['/qc'],
  '/api/training': ['/training-control-center'],
  '/api/analytics': ['/analytics'],
  '/api/gateway-reports': ['/gateway-reports'],
  '/api/reports': ['/finish-qc-completed-report'],
};

function normalizeRoute(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const normalizedSegments: string[] = [];
  
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) break;
    if (/^[a-f0-9-]{20,}$/i.test(segment)) break;
    normalizedSegments.push(segment);
  }
  
  return '/' + normalizedSegments.join('/');
}

function routeMatches(currentRoute: string, allowedRoute: string): boolean {
  if (currentRoute === allowedRoute) return true;
  
  const normalizedCurrent = normalizeRoute(currentRoute);
  if (normalizedCurrent === allowedRoute) return true;
  
  if (currentRoute.startsWith(allowedRoute + '/')) return true;
  
  return false;
}

function hasRoleBasedAccess(route: string, userRole?: string): boolean {
  if (!userRole) return false;

  const role = userRole.toUpperCase();
  const normalizedRoute = normalizeRoute(route);

  for (const [routePattern, allowedRoles] of Object.entries(ROLE_ROUTE_ACCESS)) {
    if (routeMatches(route, routePattern) || routeMatches(normalizedRoute, routePattern)) {
      if (allowedRoles.includes(role)) return true;
    }
  }

  return false;
}

function isOwnPersonalDashboard(username: string, route: string): boolean {
  const lowerUsername = username.toLowerCase();
  const lowerRoute = route.toLowerCase();
  return lowerRoute === `/${lowerUsername}-dashboard`;
}

export function hasRouteAccess(username: string, route: string, userRole?: string): boolean {
  const lowerUsername = username.toLowerCase();
  
  if (isOwnPersonalDashboard(lowerUsername, route)) return true;
  
  const permissions = USER_PERMISSIONS[lowerUsername];

  if (!permissions) {
    for (const defaultRoute of DEFAULT_USER_ROUTES) {
      if (routeMatches(route, defaultRoute)) return true;
    }
    return hasRoleBasedAccess(route, userRole);
  }

  if (permissions.fullAccess) return true;

  for (const allowedRoute of permissions.routes) {
    if (routeMatches(route, allowedRoute)) return true;
  }

  return hasRoleBasedAccess(route, userRole);
}

export function hasFullAccess(username: string): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];
  return permissions?.fullAccess === true;
}

function getFrontendRoutesForApi(apiPath: string): string[] {
  for (const [apiPattern, frontendRoutes] of Object.entries(API_TO_FRONTEND_ROUTE_MAPPING)) {
    if (apiPath.startsWith(apiPattern)) {
      return frontendRoutes;
    }
  }
  return [];
}

export function authorizeApiRoute(requiredFrontendRoutes?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      console.log(`🔐 AUTH CHECK: No user on request for ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { username, role } = req.user;
    console.log(`🔐 AUTH CHECK: User ${username} (role: ${role}) accessing ${req.method} ${req.originalUrl}`);
    
    if (hasFullAccess(username)) {
      console.log(`🔐 AUTH CHECK: ${username} has full access - GRANTED`);
      return next();
    }

    if (role === 'ADMIN' || role === 'OWNER') {
      console.log(`🔐 AUTH CHECK: ${username} is ${role} - GRANTED`);
      return next();
    }

    const routesToCheck = requiredFrontendRoutes || getFrontendRoutesForApi(req.baseUrl || req.path);
    console.log(`🔐 AUTH CHECK: Routes to check for ${req.baseUrl || req.path}:`, routesToCheck);

    if (routesToCheck.length === 0) {
      console.log(`🔐 AUTH CHECK: No routes to check - GRANTED by default`);
      return next();
    }

    const hasAccess = routesToCheck.some(route => {
      const access = hasRouteAccess(username, route, role);
      console.log(`🔐 AUTH CHECK: hasRouteAccess(${username}, ${route}, ${role}) = ${access}`);
      return access;
    });

    if (!hasAccess) {
      console.warn(`⚠️ ACCESS DENIED: User ${username} (role: ${role}) attempted to access ${req.method} ${req.originalUrl}`);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to access this resource'
      });
    }

    console.log(`🔐 AUTH CHECK: ${username} access to ${req.originalUrl} - GRANTED`);
    next();
  };
}

export function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { username, role } = req.user;
  
  if (hasFullAccess(username) || role === 'ADMIN' || role === 'OWNER') {
    return next();
  }

  console.warn(`⚠️ ADMIN ACCESS DENIED: User ${username} (role: ${role}) attempted to access ${req.method} ${req.originalUrl}`);
  return res.status(403).json({ 
    error: 'Admin access required',
    message: 'This action requires administrator privileges'
  });
}

// Finance or admin access — allows ADMIN, OWNER, and FINANCE roles
export function requireFinanceAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { username, role } = req.user;

  if (hasFullAccess(username) || role === 'ADMIN' || role === 'OWNER' || role === 'FINANCE') {
    return next();
  }

  console.warn(`⚠️ FINANCE ACCESS DENIED: User ${username} (role: ${role}) attempted to access ${req.method} ${req.originalUrl}`);
  return res.status(403).json({
    error: 'Finance access required',
    message: 'This action requires finance or administrator privileges'
  });
}
