/**
 * QR Code Generator Utilities
 * 
 * Provides functions for generating and validating QR code public IDs
 * following the established EPOCH pattern (similar to sig_XXXXXXXX for signatures).
 */

import QRCode from 'qrcode';

// ============================================================================
// PUBLIC ID GENERATION
// ============================================================================

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

// ============================================================================
// EXPLICIT RESOLVER MAP - Phase 0.5 Hardening
// ============================================================================

/**
 * Resolver function interface
 * Each resolver receives the entity identifier and user role, returns the resolved route
 */
export interface QRResolverContext {
  entityIdentifier: string;
  userRole?: string;
  customResolveUrl?: string | null;
}

export interface QRResolverResult {
  success: boolean;
  route?: string;
  error?: string;
}

/**
 * Explicit resolver map for each entity type
 * Each resolver function handles resolution for its entity type
 * Default resolver MUST fail hard with clear error
 */
export const QR_RESOLVERS: Record<string, (ctx: QRResolverContext) => QRResolverResult> = {
  order: (ctx) => {
    // Admin/Owner see admin view, others see management view
    if (ctx.userRole === 'ADMIN' || ctx.userRole === 'OWNER') {
      return { success: true, route: `/admin/orders?orderId=${encodeURIComponent(ctx.entityIdentifier)}` };
    }
    return { success: true, route: `/orders-management?orderId=${encodeURIComponent(ctx.entityIdentifier)}` };
  },

  inventory_item: (ctx) => ({
    success: true,
    route: `/inventory/parts?partNumber=${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  employee: (ctx) => {
    // Employees see their own portal, admins see employee details
    if (ctx.userRole === 'EMPLOYEE') {
      return { success: true, route: `/employee-portal` };
    }
    return { success: true, route: `/employees/${encodeURIComponent(ctx.entityIdentifier)}` };
  },

  mandrel: (ctx) => ({
    success: true,
    route: `/p2-layup-schedules?mandrel=${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  oven: (ctx) => ({
    success: true,
    route: `/p2-layup-schedules?oven=${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  timer_program: (ctx) => ({
    success: true,
    route: `/timer-programs/${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  document: (ctx) => ({
    success: true,
    route: `/documents/${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  equipment: (ctx) => ({
    success: true,
    route: `/maintenance?equipment=${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  material_lot: (ctx) => ({
    success: true,
    route: `/material-lots/${encodeURIComponent(ctx.entityIdentifier)}`,
  }),

  custom: (ctx) => {
    // For custom entity types, the identifier IS the URL
    if (!ctx.entityIdentifier.startsWith('/')) {
      return { success: false, error: 'Custom QR code must have a valid URL path as identifier' };
    }
    return { success: true, route: ctx.entityIdentifier };
  },
};

/**
 * Resolve a QR code to its destination route
 * Uses explicit resolver map with fail-hard default
 */
export function resolveQRCode(
  entityType: string,
  entityIdentifier: string,
  userRole?: string,
  customResolveUrl?: string | null
): QRResolverResult {
  // If custom URL is provided, use it directly
  if (customResolveUrl) {
    return { success: true, route: customResolveUrl };
  }

  // Look up resolver in explicit map
  const resolver = QR_RESOLVERS[entityType];
  
  // FAIL HARD: Unknown entity type must not silently redirect
  if (!resolver) {
    return {
      success: false,
      error: `Unknown entity type: ${entityType}. No resolver configured.`,
    };
  }

  // Execute resolver
  return resolver({
    entityIdentifier,
    userRole,
    customResolveUrl,
  });
}

/**
 * Legacy compatibility wrapper - returns URL string or error page
 * @deprecated Use resolveQRCode for new code
 */
export function getResolveUrl(
  entityType: string,
  entityIdentifier: string,
  userRole?: string,
  customResolveUrl?: string | null
): string {
  const result = resolveQRCode(entityType, entityIdentifier, userRole, customResolveUrl);
  if (result.success && result.route) {
    return result.route;
  }
  // Return error page with context
  return `/qr-error?reason=resolver_failed&code=${encodeURIComponent(entityIdentifier)}&error=${encodeURIComponent(result.error || 'Unknown error')}`;
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

// ============================================================================
// QR SVG HELPER - Phase 0.5 Hardening
// ============================================================================

/**
 * Generate a QR code as SVG buffer
 * Intended for future PDF/label embedding - no UI usage yet
 * 
 * @param content - The content to encode in the QR code (usually the full URL)
 * @param options - Optional settings for QR code generation
 * @returns Promise<Buffer> - SVG content as a buffer
 */
export async function generateQrSvg(
  content: string,
  options?: {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }
): Promise<Buffer> {
  const svgString = await QRCode.toString(content, {
    type: 'svg',
    errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
    margin: options?.margin ?? 2,
    width: options?.width || 200,
    color: {
      dark: options?.color?.dark || '#000000',
      light: options?.color?.light || '#ffffff',
    },
  });
  
  return Buffer.from(svgString, 'utf-8');
}

/**
 * Generate a QR code as PNG buffer
 * Alternative format for embedding in documents
 * 
 * @param content - The content to encode in the QR code
 * @param options - Optional settings for QR code generation
 * @returns Promise<Buffer> - PNG image as a buffer
 */
export async function generateQrPng(
  content: string,
  options?: {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }
): Promise<Buffer> {
  return await QRCode.toBuffer(content, {
    type: 'png',
    errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
    margin: options?.margin ?? 2,
    width: options?.width || 200,
    color: {
      dark: options?.color?.dark || '#000000',
      light: options?.color?.light || '#ffffff',
    },
  });
}
