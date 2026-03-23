// User Permission Mapping
// Maps each username to their allowed navigation routes based on dashboard cards
// This is the SOURCE OF TRUTH for user access - navbar filtering uses these routes
// IMPORTANT: Routes must match EXACTLY what's in Navigation.tsx for filtering to work

import { getDashboardRoute } from './dashboardMapping';

export interface UserPermissions {
  routes: string[];
  fullAccess?: boolean;
  deniedRoutes?: string[]; // Routes to explicitly block (used with fullAccess: true)
}

// Default routes for users not explicitly listed - only employee portal
export const DEFAULT_USER_ROUTES: string[] = ['/employee-portal'];

// Universal routes that ALL authenticated users can access regardless of permissions
export const UNIVERSAL_ACCESS_ROUTES: string[] = ['/communications/inbox', '/employee-portal', '/badge-scanner', '/help', '/pdf-signature-tool', '/routing-document-management', '/tickets', '/quick-notes'];

// All valid navbar routes for reference (from Navigation.tsx)
// This helps ensure permissions use correct paths
export const VALID_NAVBAR_ROUTES = [
  '/admin/orders',
  '/admin/audit-settings',
  '/admin/health-checks',
  '/admin/domain-truth',
  '/admin/queue-integrity',
  '/admin/control-tower',
  '/admin/shipping-status-audit',
  '/admin/monitored-links',
  '/admin/communication-logs',
  '/email-templates',
  '/sign-order-page-settings',
  '/admin/qr-codes',
  '/admin/checklist-management',
  '/analytics',
  '/badge-configuration',
  '/badge-scanner',
  '/barcode-scanner',
  '/bulk-barcode-reprint',
  '/calendar',
  '/credit-memo',
  '/customers',
  '/customer-satisfaction',
  '/cutting-control-center',
  '/department-queue/barcode',
  '/department-queue/cnc',
  '/department-queue/finish',
  '/department-queue/finish-qc',
  '/department-queue/gunsmith',
  '/department-queue/layup-plugging',
  '/department-queue/paint',
  '/department-queue/production-queue',
  '/department-queue/qc-shipping',
  '/department-queue/shipping',
  '/discounts',
  '/document-management',
  '/employee',
  '/employee-portal',
  '/onboarding',
  '/onboarding/paths',
  '/onboarding/forms',
  '/onboarding/session/:id',
  '/feature-manager',
  '/business-review',
  '/business-review/sessions',
  '/finance/ap',
  '/finance/ar',
  '/finance/ar-journal',
  '/finance/ar-aging',
  '/finance/ar-payments',
  '/finance/invoices',
  '/finance/bulk-payment',
  '/finance/cogs',
  '/finance/cost-accounting',
  '/finance/cost-centers',
  '/finance/dashboard',
  '/finance/monthly-fulfilled',
  '/finance/shipped-discounts',
  '/finance/invoice-breakdown',
  '/finance/scrap-report',
  '/payment-analytics',
  '/historical-data',
  '/finish-qc-completed-report',
  '/gateway-reports',
  '/metrics-sandbox',
  '/inventory/enhanced-mrp',
  '/production/material-readiness',
  '/inventory/parts-request',
  '/inventory/receiving',
  '/inventory/scanner',
  '/kickback-tracking',
  '/maintenance',
  '/maintenance-events',
  '/assets',
  '/asset-dashboard',
  '/manufacturing-queue',
  '/master-document-register',
  '/metal-accessories',
  '/module8-test',
  '/nonconformance',
  '/oem-shipments',
  '/order-department-transfer',
  '/order-entry',
  '/order-reports',
  '/due-date-capacity',
  '/orders-list',
  '/orders-management',
  '/p2-control-center',
  '/payment-management',
  '/pdf-templates',
  '/fillable-pdf-templates',
  '/po-products',
  '/product-labels',
  '/production-tracking',
  '/production-forecast',
  '/purchase-orders',
  '/qc',
  '/refund-queue',
  '/refund-request',
  '/robust-bom-administration',
  '/rts',
  '/shipping-tracker',
  '/weekly-shipments',
  '/stock-models',
  '/time-clock-admin',
  '/training-control-center',
  '/training/programs',
  '/training/work-instructions',
  '/training/quizzes',
  '/training/daily-quizzes',
  '/user-management',
  '/vendor-pos',
  '/vendors',
  '/waste-management-form',
  '/preproduction-checklists',
  '/projects',
  '/projects/pipeline',
  '/help',
  '/signature-workflow',
  '/pdf-signature-tool',
  '/media-library',
  '/signed-documents',
  '/reference-docs',
  '/travelers',
  '/material-receiving',
  '/material-inventory',
  '/filtered-orders-report',
  '/urgent-orders-report',
  '/otd-report',
  '/order-heat-map',
  '/fabric-inventory',
  '/tickets',
  '/quick-notes',
  '/app/production/stations',
];

export const USER_PERMISSIONS: Record<string, UserPermissions> = {
  // Admin users with full navigation access
  admin: {
    routes: [],
    fullAccess: true,
  },
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
    deniedRoutes: [
      '/finance/ar',
      '/finance/ar-journal',
      '/finance/ar-aging',
      '/finance/ar-payments',
      '/finance/invoices',
    ],
  },

  // Regular users with limited access based on their dashboard cards
  // Routes must match EXACTLY what's in Navigation.tsx navbar

  agrace: {
    routes: [
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/department-queue/barcode',
      '/department-queue/finish',
      '/inventory/enhanced-mrp',
      '/production/material-readiness',
      '/inventory/parts-request',
      '/inventory/consolidated-needs',
      '/customers',
      '/tickets',
      '/gateway-reports',
      '/metrics-sandbox',
      '/layup-scheduler',
      '/all-orders',
      '/order-department-transfer',
      '/metal-accessories',
      '/training',
      '/voice-notes',
      '/order-heat-map',
      '/urgent-orders-report',
      '/production-forecast',
    ],
  },

  faleeshah: {
    routes: [
      '/faleeshah-dashboard',
      '/department-queue/finish-qc',
      '/department-queue/paint',
      '/department-queue/qc-shipping',
      '/department-queue/shipping',
      '/orders-list',
      '/orders-management',
      '/customers',
      '/tickets',
      '/customer-management',
      '/inventory/parts-request',
      '/shipping-tracker',
      '/weekly-shipments',
      '/shipping/label',
      '/all-orders',
      '/order-department-transfer',
      '/barcode-scanner',
      '/metal-accessories',
      '/training',
      '/oem-shipments',
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
      '/production/material-readiness',
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

  chasew: {
    routes: [
      '/chasew-dashboard',
      '/projects',
      '/projects/pipeline',
      '/media-library',
      '/p2-control-center',
      '/p2-forms',
      '/p2-traveler',
      '/p2-traveler-viewer',
      '/p2/shipments',
      '/p2/packing-slip',
      '/p2/certificate',
      '/p2/ready-to-ship',
      '/p2/test-report',
      '/p2-quote-form',
      '/p2-quotes-list',
      '/rfq-risk-assessment',
      '/app/production/stations',
      '/purchase-review-checklist',
      '/purchase-review-submissions',
      '/preproduction-checklists',
    ],
  },

  darleneb: {
    routes: [
      '/darleneb-dashboard',
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/customers',
      '/tickets',
      '/customer-satisfaction',
      '/shipping-tracker',
      '/weekly-shipments',
      '/discounts',
      '/marketing-communications',
      '/finance/bulk-payment',
      '/watch-rules',
      '/refund-request',
      '/refund-queue',
      '/urgent-orders-report',
    ],
  },

  halls: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
      '/finance/invoices',
    ],
  },

  hunta: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
      '/finance/invoices',
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
      '/fabric-inventory',
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
      '/lauriet-dashboard',
      '/order-entry',
      '/orders-list',
      '/orders-management',
      '/customers',
      '/inventory/enhanced-mrp',
      '/production/material-readiness',
      '/p2-control-center',
      '/inventory/consolidated-needs',
      '/vendors',
      '/vendor-pos',
      '/inventory/receiving',
      '/master-document-register',
      '/inventory/parts-request',
      '/qc',
      '/maintenance',
      '/maintenance-events',
      '/projects',
    ],
  },

  tandyd: {
    routes: [
      '/department-queue/production-queue',
      '/department-queue/layup-plugging',
      '/orders-list',
      '/orders-management',
      '/finance/invoices',
    ],
  },

  tandym: {
    routes: [],
    fullAccess: true,
  },

  tims: {
    routes: [
      '/department-queue/cnc',
      '/department-queue/finish-qc',
      '/orders-list',
      '/orders-management',
      '/maintenance',
      '/maintenance-events',
      '/assets',
      '/asset-dashboard',
      '/inventory/parts-request',
      '/metal-accessories',
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
 * Uses the dashboard mapping to handle cases where dashboard URLs don't follow
 * the /{username}-dashboard pattern (e.g., agrace uses /ag-dashboard)
 */
function isOwnPersonalDashboard(username: string, route: string): boolean {
  const lowerUsername = username.toLowerCase();
  const lowerRoute = route.toLowerCase();
  
  // Check if route matches the user's mapped dashboard
  const userDashboard = getDashboardRoute(lowerUsername);
  if (userDashboard && lowerRoute === userDashboard.toLowerCase()) {
    return true;
  }
  
  // Also check the standard pattern as a fallback
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
  
  // Always allow access to universal routes (communications, employee portal)
  for (const universalRoute of UNIVERSAL_ACCESS_ROUTES) {
    if (routeMatches(route, universalRoute)) {
      return true;
    }
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
    // Check denied routes first — these are explicit blocks even for full-access users
    if (permissions.deniedRoutes) {
      for (const denied of permissions.deniedRoutes) {
        if (routeMatches(route, denied)) {
          return false;
        }
      }
    }
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
  '/metrics-sandbox': ['ADMIN', 'OWNER'],
  '/due-date-capacity': ['ADMIN', 'OWNER'],
  '/inventory/enhanced-mrp': ['ADMIN', 'INVENTORY_MANAGER'],
  '/production/material-readiness': ['ADMIN', 'INVENTORY_MANAGER', 'OWNER'],
  '/user-management': ['ADMIN', 'OWNER'],
  '/employee': ['ADMIN', 'OWNER'],
  '/time-clock-admin': ['ADMIN', 'OWNER'],
  '/business-review': ['ADMIN', 'OWNER', 'FINANCE'],
  '/business-review/sessions': ['ADMIN', 'OWNER', 'FINANCE'],
  '/finance/dashboard': ['ADMIN', 'OWNER'],
  '/finance/cost-centers': ['ADMIN', 'OWNER'],
  '/finance/cost-accounting': ['ADMIN', 'OWNER'],
  '/finance/accounting': ['ADMIN'],
  '/finance/bulk-payment': ['ADMIN', 'OWNER'],
  '/finance/ap': ['ADMIN', 'OWNER'],
  '/finance/ar': ['ADMIN', 'OWNER'],
  '/finance/ar-journal': ['ADMIN', 'OWNER'],
  '/finance/ar-aging': ['ADMIN', 'OWNER'],
  '/finance/ar-payments': ['ADMIN', 'OWNER'],
  '/finance/invoices': ['ADMIN', 'OWNER'],
  '/finance/cogs': ['ADMIN', 'OWNER'],
  '/finance/monthly-fulfilled': ['ADMIN', 'OWNER'],
  '/finance/shipped-discounts': ['ADMIN', 'OWNER'],
  '/finance/invoice-breakdown': ['ADMIN', 'OWNER'],
  '/finance/scrap-report': ['ADMIN', 'OWNER'],
  '/payment-analytics': ['ADMIN', 'OWNER'],
  '/refund-queue': ['ADMIN', 'OWNER'],
  '/credit-memo': ['ADMIN', 'OWNER'],
  '/badge-configuration': ['ADMIN', 'OWNER'],
  '/pdf-templates': ['ADMIN', 'OWNER'],
  '/email-templates': ['ADMIN', 'OWNER'],
  '/sign-order-page-settings': ['ADMIN', 'OWNER'],
  '/fillable-pdf-templates': ['ADMIN', 'OWNER'],
  '/training-control-center': ['ADMIN', 'OWNER'],
  '/training/programs': ['ADMIN', 'OWNER'],
  '/training/work-instructions': ['ADMIN', 'OWNER'],
  '/training/quizzes': ['ADMIN', 'OWNER'],
  '/training/daily-quizzes': ['ADMIN', 'OWNER'],
  '/discounts': ['ADMIN', 'OWNER'],
  '/feature-manager': ['ADMIN', 'OWNER'],
  '/stock-models': ['ADMIN', 'OWNER'],
  '/robust-bom-administration': ['ADMIN', 'OWNER'],
  '/p2-control-center': ['ADMIN', 'OWNER'],
  '/manufacturing-queue': ['ADMIN', 'OWNER'],
  '/po-products': ['ADMIN', 'OWNER'],
  '/product-labels': ['ADMIN', 'OWNER'],
  '/purchase-orders': ['ADMIN', 'OWNER'],
  '/analytics': ['ADMIN', 'OWNER'],
  '/nonconformance': ['ADMIN', 'OWNER'],
  '/rts': ['ADMIN', 'OWNER'],
  '/qc': ['ADMIN', 'OWNER'],
  '/vendors': ['ADMIN', 'OWNER'],
  '/vendor-pos': ['ADMIN', 'OWNER'],
  '/media-library': ['ADMIN', 'OWNER'],
  '/sign-pdf': ['ADMIN', 'OWNER'],
  '/signed-documents': ['ADMIN', 'OWNER'],
  '/reference-docs': ['ADMIN', 'OWNER'],
  '/admin/qr-codes': ['ADMIN', 'OWNER'],
  '/admin/checklist-management': ['ADMIN', 'OWNER'],
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
 * Check if a user has full navigation access with no restrictions.
 * Returns false when the user has deniedRoutes so the nav falls through
 * to per-route hasRouteAccess checks, which enforce the deny list.
 */
export function hasFullAccess(username: string): boolean {
  const permissions = USER_PERMISSIONS[username.toLowerCase()];
  if (!permissions?.fullAccess) return false;
  // If there are denied routes the nav must do per-item filtering
  if (permissions.deniedRoutes && permissions.deniedRoutes.length > 0) return false;
  return true;
}

/**
 * Get the user's own dashboard route
 */
export function getUserDashboardRoute(username: string): string {
  return `/${username.toLowerCase()}-dashboard`;
}

/**
 * Check if user is in the permissions list (has explicit permissions)
 */
export function isUserInPermissionsList(username: string): boolean {
  return username.toLowerCase() in USER_PERMISSIONS;
}
