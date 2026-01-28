/**
 * QR Code Routes - Central QR Code Generation & Resolver System
 * 
 * Provides:
 * - QR code resolution (GET /qr/:code)
 * - Admin CRUD operations for QR code management
 * - Audit logging for all QR events
 */

import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { qrCodes, qrCodeScanLog, users, employees, insertQrCodeSchema } from '../../schema';
import { eq, and, desc, sql, isNull, or, gt, lt } from 'drizzle-orm';
import { z } from 'zod';
import { authenticateToken, requireRole, sessionAwareAuth } from '../../middleware/auth';
import { auditService } from '../services/auditService';
import {
  generateQRPublicId,
  isValidQRPublicCode,
  resolveQRCode,
  isValidEntityType,
  generateQRCodeUrl,
  VALID_ENTITY_TYPES,
} from '../utils/qrCodeGenerator';

// Create separate routers for public resolver and admin CRUD
const resolverRouter = Router(); // For public /qr/:code endpoint
const adminRouter = Router(); // For protected /api/qr-codes endpoints

// Get current environment
function getCurrentEnvironment(): 'dev' | 'prod' {
  const appEnv = process.env.APP_ENV;
  if (appEnv === 'prod' || appEnv === 'dev') {
    return appEnv;
  }
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

// ============================================================================
// QR CODE RESOLVER - Public endpoint for scanning QR codes
// ============================================================================

/**
 * GET /qr/:code - Resolve a QR code and redirect to appropriate destination
 * 
 * Phase 0.5 Hardened:
 * - All QR scan events logged via auditService (entityType: 'qr_code')
 * - Environment guard with QR_ENV_MISMATCH audit event
 * - Explicit resolver map with fail-hard default
 */
resolverRouter.get('/:code', sessionAwareAuth, async (req: Request, res: Response) => {
  const { code } = req.params;
  const currentEnv = getCurrentEnvironment();
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  // Helper to build audit actor
  const getActor = () => req.user ? {
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  } : undefined;

  try {
    // Validate code format
    if (!isValidQRPublicCode(code)) {
      return res.redirect(`/qr-error?reason=invalid_format&code=${encodeURIComponent(code)}`);
    }

    // Look up the QR code
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.publicCode, code));

    if (!qrCode) {
      console.log(`[QR] Not found: ${code}`);
      return res.redirect(`/qr-error?reason=not_found&code=${encodeURIComponent(code)}`);
    }

    // Check if QR code is active
    if (!qrCode.isActive) {
      await auditService.logEvent({
        entityType: 'qr_code',
        entityId: qrCode.id,
        action: 'QR_SCANNED',
        actor: getActor(),
        meta: {
          qrCode: code,
          entityType: qrCode.entityType,
          entityIdentifier: qrCode.entityIdentifier,
          resolvedRoute: null,
          userRole: req.user?.role || null,
          wasAuthenticated: !!req.user,
          scanResult: 'disabled',
          disabledReason: qrCode.disabledReason,
        },
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });
      return res.redirect(`/qr-error?reason=disabled&code=${encodeURIComponent(code)}`);
    }

    // ENVIRONMENT GUARD - Phase 0.5: Block and audit environment mismatch
    if (qrCode.environment !== currentEnv) {
      console.warn(`[QR] Environment mismatch: QR is for ${qrCode.environment}, current is ${currentEnv}`);
      await auditService.logEvent({
        entityType: 'qr_code',
        entityId: qrCode.id,
        action: 'QR_ENV_MISMATCH',
        actor: getActor(),
        meta: {
          qrCode: code,
          entityType: qrCode.entityType,
          entityIdentifier: qrCode.entityIdentifier,
          qrEnvironment: qrCode.environment,
          currentEnvironment: currentEnv,
          userRole: req.user?.role || null,
          wasAuthenticated: !!req.user,
        },
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });
      return res.redirect(`/qr-error?reason=environment_mismatch&code=${encodeURIComponent(code)}`);
    }

    // Check expiration
    if (qrCode.expiresAt && new Date(qrCode.expiresAt) < new Date()) {
      await auditService.logEvent({
        entityType: 'qr_code',
        entityId: qrCode.id,
        action: 'QR_SCANNED',
        actor: getActor(),
        meta: {
          qrCode: code,
          entityType: qrCode.entityType,
          entityIdentifier: qrCode.entityIdentifier,
          resolvedRoute: null,
          userRole: req.user?.role || null,
          wasAuthenticated: !!req.user,
          scanResult: 'expired',
          expiresAt: qrCode.expiresAt,
        },
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });
      return res.redirect(`/qr-error?reason=expired&code=${encodeURIComponent(code)}`);
    }

    // Resolve using explicit resolver map (fail-hard on unknown entity type)
    const userRole = req.user?.role;
    const resolverResult = resolveQRCode(
      qrCode.entityType,
      qrCode.entityIdentifier,
      userRole,
      qrCode.resolveUrl
    );

    // Handle resolver failure
    if (!resolverResult.success || !resolverResult.route) {
      console.error(`[QR] Resolver failed for ${code}: ${resolverResult.error}`);
      await auditService.logEvent({
        entityType: 'qr_code',
        entityId: qrCode.id,
        action: 'QR_SCANNED',
        actor: getActor(),
        meta: {
          qrCode: code,
          entityType: qrCode.entityType,
          entityIdentifier: qrCode.entityIdentifier,
          resolvedRoute: null,
          userRole: req.user?.role || null,
          wasAuthenticated: !!req.user,
          scanResult: 'resolver_failed',
          resolverError: resolverResult.error,
        },
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });
      return res.redirect(`/qr-error?reason=resolver_failed&code=${encodeURIComponent(code)}&error=${encodeURIComponent(resolverResult.error || '')}`);
    }

    const resolvedUrl = resolverResult.route;

    // Log successful scan via auditService
    await auditService.logEvent({
      entityType: 'qr_code',
      entityId: qrCode.id,
      action: 'QR_SCANNED',
      actor: getActor(),
      meta: {
        qrCode: code,
        entityType: qrCode.entityType,
        entityIdentifier: qrCode.entityIdentifier,
        resolvedRoute: resolvedUrl,
        userRole: req.user?.role || null,
        wasAuthenticated: !!req.user,
        scanResult: 'success',
        environment: currentEnv,
      },
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
    });

    // Redirect to resolved URL
    console.log(`[QR] Resolved ${code} -> ${resolvedUrl}`);
    return res.redirect(resolvedUrl);

  } catch (error) {
    console.error('[QR] Resolution error:', error);
    return res.redirect(`/qr-error?reason=server_error&code=${encodeURIComponent(code)}`);
  }
});

// Legacy helper to log scan events to qr_code_scan_log (kept for backward compatibility, will be deprecated)
async function logScanEventLegacy(
  qrCodeId: string,
  publicCode: string,
  scanResult: string,
  resolvedUrl: string | null,
  userId: number | null | undefined,
  employeeId: number | null,
  ipAddress: string | null,
  userAgent: string | null
) {
  try {
    await db.insert(qrCodeScanLog).values({
      qrCodeId,
      publicCode,
      scanResult,
      resolvedUrl,
      scannedByUserId: userId || null,
      scannedByEmployeeId: employeeId,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('[QR] Failed to log scan event:', error);
  }
}

// ============================================================================
// ADMIN CRUD ENDPOINTS - Protected by authentication and role
// ============================================================================

/**
 * GET /api/qr-codes - List all QR codes with pagination and filtering
 */
adminRouter.get('/', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { 
      page = '1', 
      limit = '50', 
      entityType, 
      isActive,
      search 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    const conditions = [];
    
    if (entityType && typeof entityType === 'string') {
      conditions.push(eq(qrCodes.entityType, entityType as any));
    }
    
    if (isActive !== undefined) {
      conditions.push(eq(qrCodes.isActive, isActive === 'true'));
    }

    if (search && typeof search === 'string') {
      conditions.push(
        or(
          sql`${qrCodes.publicCode} ILIKE ${`%${search}%`}`,
          sql`${qrCodes.entityIdentifier} ILIKE ${`%${search}%`}`,
          sql`${qrCodes.label} ILIKE ${`%${search}%`}`
        )
      );
    }

    // Execute query with joins for created_by user info
    const qrCodesResult = await db
      .select({
        qrCode: qrCodes,
        createdByUser: {
          id: users.id,
          username: users.username,
        },
      })
      .from(qrCodes)
      .leftJoin(users, eq(qrCodes.createdByUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(qrCodes.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      data: qrCodesResult.map(r => ({
        ...r.qrCode,
        createdByUser: r.createdByUser,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('[QR] List error:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

/**
 * GET /api/qr-codes/meta/entity-types - Get list of valid entity types
 * NOTE: Must be registered BEFORE /:id routes to avoid shadowing
 */
adminRouter.get('/meta/entity-types', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  res.json({
    entityTypes: VALID_ENTITY_TYPES.map(type => ({
      value: type,
      label: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    })),
  });
});

/**
 * GET /api/qr-codes/meta/stats - Get QR code statistics
 * NOTE: Must be registered BEFORE /:id routes to avoid shadowing
 */
adminRouter.get('/meta/stats', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodes);

    const [activeResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodes)
      .where(eq(qrCodes.isActive, true));

    const [scansResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodeScanLog);

    const [successfulScansResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodeScanLog)
      .where(eq(qrCodeScanLog.scanResult, 'success'));

    res.json({
      totalQRCodes: totalResult?.count || 0,
      activeQRCodes: activeResult?.count || 0,
      totalScans: scansResult?.count || 0,
      successfulScans: successfulScansResult?.count || 0,
    });
  } catch (error) {
    console.error('[QR] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/qr-codes/:id - Get a single QR code by ID
 */
adminRouter.get('/:id', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [qrCode] = await db
      .select({
        qrCode: qrCodes,
        createdByUser: {
          id: users.id,
          username: users.username,
        },
      })
      .from(qrCodes)
      .leftJoin(users, eq(qrCodes.createdByUserId, users.id))
      .where(eq(qrCodes.id, id));

    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json({
      ...qrCode.qrCode,
      createdByUser: qrCode.createdByUser,
    });
  } catch (error) {
    console.error('[QR] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

/**
 * POST /api/qr-codes - Create a new QR code
 */
const createQRCodeSchema = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES as unknown as [string, ...string[]]),
  entityIdentifier: z.string().min(1, 'Entity identifier is required'),
  label: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  resolveUrl: z.string().url().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

adminRouter.post('/', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const validatedData = createQRCodeSchema.parse(req.body);
    const currentEnv = getCurrentEnvironment();

    // Generate unique public code
    let publicCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      publicCode = generateQRPublicId();
      const [existing] = await db
        .select({ id: qrCodes.id })
        .from(qrCodes)
        .where(eq(qrCodes.publicCode, publicCode));
      
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({ error: 'Failed to generate unique QR code' });
    }

    // Create the QR code
    const [newQrCode] = await db.insert(qrCodes).values({
      publicCode,
      entityType: validatedData.entityType as any,
      entityIdentifier: validatedData.entityIdentifier,
      label: validatedData.label || null,
      description: validatedData.description || null,
      expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
      resolveUrl: validatedData.resolveUrl || null,
      metadata: validatedData.metadata || null,
      environment: currentEnv,
      createdByUserId: req.user?.id || null,
      isActive: true,
    }).returning();

    // Log audit event via auditService (Phase 0.5: use qr_code entityType)
    await auditService.logEvent({
      entityType: 'qr_code',
      entityId: newQrCode.id,
      action: 'QR_GENERATED',
      actor: {
        id: req.user?.id,
        username: req.user?.username,
        role: req.user?.role,
      },
      meta: {
        qrCode: publicCode,
        entityType: validatedData.entityType,
        entityIdentifier: validatedData.entityIdentifier,
        environment: currentEnv,
      },
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent') || undefined,
    });

    // Generate the full QR URL
    const qrUrl = generateQRCodeUrl(publicCode, currentEnv);

    res.status(201).json({
      ...newQrCode,
      qrUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[QR] Create error:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

/**
 * PATCH /api/qr-codes/:id - Update a QR code
 */
const updateQRCodeSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  resolveUrl: z.string().url().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

adminRouter.patch('/:id', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateQRCodeSchema.parse(req.body);

    const [updated] = await db
      .update(qrCodes)
      .set({
        ...validatedData,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(qrCodes.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[QR] Update error:', error);
    res.status(500).json({ error: 'Failed to update QR code' });
  }
});

/**
 * POST /api/qr-codes/:id/disable - Disable a QR code
 */
const disableQRCodeSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

adminRouter.post('/:id/disable', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = disableQRCodeSchema.parse(req.body);

    // Get the QR code first
    const [existingQrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, id));

    if (!existingQrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Update the QR code
    const [updated] = await db
      .update(qrCodes)
      .set({
        isActive: false,
        disabledAt: new Date(),
        disabledByUserId: req.user?.id || null,
        disabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(qrCodes.id, id))
      .returning();

    // Log audit event via auditService (Phase 0.5: use qr_code entityType)
    await auditService.logEvent({
      entityType: 'qr_code',
      entityId: id,
      action: 'QR_DISABLED',
      actor: {
        id: req.user?.id,
        username: req.user?.username,
        role: req.user?.role,
      },
      reason,
      meta: {
        qrCode: existingQrCode.publicCode,
        entityType: existingQrCode.entityType,
        entityIdentifier: existingQrCode.entityIdentifier,
        disabledReason: reason,
      },
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent') || undefined,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[QR] Disable error:', error);
    res.status(500).json({ error: 'Failed to disable QR code' });
  }
});

/**
 * POST /api/qr-codes/:id/reactivate - Reactivate a disabled QR code
 */
adminRouter.post('/:id/reactivate', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [updated] = await db
      .update(qrCodes)
      .set({
        isActive: true,
        disabledAt: null,
        disabledByUserId: null,
        disabledReason: null,
        updatedAt: new Date(),
      })
      .where(eq(qrCodes.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[QR] Reactivate error:', error);
    res.status(500).json({ error: 'Failed to reactivate QR code' });
  }
});

/**
 * GET /api/qr-codes/:id/scan-history - Get scan history for a QR code
 */
adminRouter.get('/:id/scan-history', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    const scanHistory = await db
      .select({
        scanLog: qrCodeScanLog,
        scannedByUser: {
          id: users.id,
          username: users.username,
        },
      })
      .from(qrCodeScanLog)
      .leftJoin(users, eq(qrCodeScanLog.scannedByUserId, users.id))
      .where(eq(qrCodeScanLog.qrCodeId, id))
      .orderBy(desc(qrCodeScanLog.scannedAt))
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(qrCodeScanLog)
      .where(eq(qrCodeScanLog.qrCodeId, id));

    res.json({
      data: scanHistory.map(r => ({
        ...r.scanLog,
        scannedByUser: r.scannedByUser,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('[QR] Scan history error:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

// Export both routers
export const qrResolverRouter = resolverRouter;
export const qrAdminRouter = adminRouter;
export default adminRouter; // Default export for backward compatibility
