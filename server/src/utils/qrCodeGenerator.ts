/**
 * QR Code Generator Utilities
 * 
 * Provides functions for generating and validating QR code public IDs
 * following the established EPOCH pattern (similar to sig_XXXXXXXX for signatures).
 */

/**
 * Generate a public QR code ID
 * Format: qr_XXXXXXXX (8 uppercase alphanumeric characters)
 * Excludes confusing characters: I, O, 0, 1
 */
export function generateQRPublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'qr_';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Validate that a string is a valid QR public code format
 */
export function isValidQRPublicCode(code: string): boolean {
  return /^qr_[A-HJ-NP-Z2-9]{8}$/.test(code);
}

/**
 * QR Code entity type to frontend route mapping
 * Maps entity types to their corresponding frontend pages
 */
export const QR_ENTITY_ROUTES: Record<string, (identifier: string, userRole?: string) => string> = {
  order: (identifier) => `/orders-management?orderId=${encodeURIComponent(identifier)}`,
  inventory_item: (identifier) => `/inventory/parts?partNumber=${encodeURIComponent(identifier)}`,
  employee: (identifier) => `/employees/${encodeURIComponent(identifier)}`,
  mandrel: (identifier) => `/p2-layup-schedules?mandrel=${encodeURIComponent(identifier)}`,
  oven: (identifier) => `/p2-layup-schedules?oven=${encodeURIComponent(identifier)}`,
  timer_program: (identifier) => `/timer-programs/${encodeURIComponent(identifier)}`,
  document: (identifier) => `/documents/${encodeURIComponent(identifier)}`,
  equipment: (identifier) => `/maintenance?equipment=${encodeURIComponent(identifier)}`,
  material_lot: (identifier) => `/material-lots/${encodeURIComponent(identifier)}`,
  custom: (identifier) => identifier, // For custom entity types, identifier IS the URL
};

/**
 * Role-based route override mapping
 * Some entity types may have different views based on user role
 */
export const QR_ROLE_ROUTE_OVERRIDES: Record<string, Record<string, (identifier: string) => string>> = {
  order: {
    ADMIN: (identifier) => `/admin/orders?orderId=${encodeURIComponent(identifier)}`,
    OWNER: (identifier) => `/admin/orders?orderId=${encodeURIComponent(identifier)}`,
  },
  employee: {
    EMPLOYEE: (identifier) => `/employee-portal`, // Employees see their own portal
  },
};

/**
 * Get the resolve URL for a QR code based on entity type, identifier, and user role
 */
export function getResolveUrl(
  entityType: string,
  entityIdentifier: string,
  userRole?: string,
  customResolveUrl?: string | null
): string {
  // If custom URL is provided, use it
  if (customResolveUrl) {
    return customResolveUrl;
  }

  // Check for role-specific override
  if (userRole && QR_ROLE_ROUTE_OVERRIDES[entityType]?.[userRole]) {
    return QR_ROLE_ROUTE_OVERRIDES[entityType][userRole](entityIdentifier);
  }

  // Fall back to default route for entity type
  const routeGenerator = QR_ENTITY_ROUTES[entityType];
  if (routeGenerator) {
    return routeGenerator(entityIdentifier, userRole);
  }

  // Unknown entity type - return 404-style page
  return `/qr-not-found?code=${encodeURIComponent(entityIdentifier)}`;
}

/**
 * Entity types that are valid for QR code creation
 */
export const VALID_ENTITY_TYPES = [
  'order',
  'inventory_item',
  'employee',
  'mandrel',
  'oven',
  'timer_program',
  'document',
  'equipment',
  'material_lot',
  'custom',
] as const;

export type QREntityType = typeof VALID_ENTITY_TYPES[number];

/**
 * Check if an entity type is valid
 */
export function isValidEntityType(type: string): type is QREntityType {
  return VALID_ENTITY_TYPES.includes(type as QREntityType);
}

/**
 * Get the base URL for QR codes based on environment
 */
export function getQRBaseUrl(env: 'dev' | 'prod'): string {
  const QR_BASE_URLS: Record<'dev' | 'prod', string> = {
    dev: process.env.APP_URL || 'https://epoch-v8-glennj.replit.app',
    prod: process.env.PRODUCTION_DOMAIN ? `https://${process.env.PRODUCTION_DOMAIN}` : 'https://agcompepoch.xyz',
  };
  return QR_BASE_URLS[env];
}

/**
 * Generate a full QR code URL
 */
export function generateQRCodeUrl(publicCode: string, env: 'dev' | 'prod'): string {
  const baseUrl = getQRBaseUrl(env);
  return `${baseUrl}/qr/${publicCode}`;
}
