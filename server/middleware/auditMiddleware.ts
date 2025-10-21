import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { auditEvents } from '../schema';
import { sql } from 'drizzle-orm';

interface AuditConfig {
  entityType: string;
  getEntityId: (req: Request, res: Response) => string | null;
  action: string;
  captureBody?: boolean;
  captureResponse?: boolean;
}

/**
 * Automatic audit middleware that captures all changes
 * Transparently logs user actions, timestamps, and data changes
 */
export function auditMiddleware(config: AuditConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    
    let responseData: any = null;
    let statusCode: number | null = null;

    // Intercept response to capture data
    res.json = function (body: any) {
      responseData = body;
      statusCode = res.statusCode;
      // Store for automatic entity ID extraction
      (res as any).__auditResponseData = body;
      return originalJson(body);
    };

    res.send = function (body: any) {
      if (!responseData) {
        try {
          responseData = typeof body === 'string' ? JSON.parse(body) : body;
          (res as any).__auditResponseData = responseData;
        } catch {
          responseData = body;
        }
        statusCode = res.statusCode;
      }
      return originalSend(body);
    };

    // Wait for response to complete
    res.on('finish', async () => {
      try {
        // Only log successful operations
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          const entityId = config.getEntityId(req, res);
          
          if (!entityId) {
            console.warn(`⚠️ Audit middleware: Could not determine entity ID for ${config.entityType}`);
            return;
          }

          const user = (req as any).user;
          const actorId = user?.id || null;
          const actorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'System';
          const actorRole = user?.role || null;

          // Capture request body for changes
          let fieldsChanged = null;
          if (config.captureBody && req.body && Object.keys(req.body).length > 0) {
            fieldsChanged = {
              after: req.body,
            };
          }

          // Capture response data
          let meta: any = {
            method: req.method,
            path: req.path,
            duration: Date.now() - startTime,
            statusCode,
          };

          if (config.captureResponse && responseData) {
            meta.response = responseData;
          }

          // Get IP address
          const ipAddress = 
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            req.socket.remoteAddress ||
            null;

          // Get user agent
          const userAgent = req.headers['user-agent'] || null;

          // Log audit event
          await db.insert(auditEvents).values({
            entityType: config.entityType,
            entityId,
            action: config.action,
            actorId,
            actorName,
            actorRole,
            fieldsChanged,
            meta,
            ipAddress,
            userAgent,
            timestamp: new Date(),
          });

          console.log(`✅ Audit logged: ${config.entityType} ${entityId} - ${config.action} by ${actorName}`);
        }
      } catch (error) {
        console.error('❌ Error logging audit event:', error);
        // Don't fail the request if audit logging fails
      }
    });

    next();
  };
}

/**
 * Enhanced audit middleware that captures before/after state
 * for UPDATE operations
 */
export function auditUpdateMiddleware(config: Omit<AuditConfig, 'action'>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const entityId = config.getEntityId(req, res);
    
    if (!entityId) {
      return next();
    }

    // Capture the "before" state by fetching current entity
    let beforeState: any = null;
    
    try {
      // We'll need to fetch the current state based on entity type
      // This will be handled in the route-specific implementation
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      
      let responseData: any = null;
      let statusCode: number | null = null;

      res.json = function (body: any) {
        responseData = body;
        statusCode = res.statusCode;
        return originalJson(body);
      };

      res.send = function (body: any) {
        if (!responseData) {
          try {
            responseData = typeof body === 'string' ? JSON.parse(body) : body;
          } catch {
            responseData = body;
          }
          statusCode = res.statusCode;
        }
        return originalSend(body);
      };

      res.on('finish', async () => {
        try {
          if (statusCode && statusCode >= 200 && statusCode < 300) {
            const user = (req as any).user;
            const actorId = user?.id || null;
            const actorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'System';
            const actorRole = user?.role || null;

            // Capture before/after
            const fieldsChanged = {
              before: beforeState || {},
              after: req.body || {},
            };

            const meta = {
              method: req.method,
              path: req.path,
              duration: Date.now() - startTime,
              statusCode,
            };

            const ipAddress = 
              (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
              req.socket.remoteAddress ||
              null;

            const userAgent = req.headers['user-agent'] || null;

            await db.insert(auditEvents).values({
              entityType: config.entityType,
              entityId,
              action: 'update',
              actorId,
              actorName,
              actorRole,
              fieldsChanged,
              meta,
              ipAddress,
              userAgent,
              timestamp: new Date(),
            });

            console.log(`✅ Audit logged: ${config.entityType} ${entityId} - update by ${actorName}`);
          }
        } catch (error) {
          console.error('❌ Error logging audit event:', error);
        }
      });
    } catch (error) {
      console.error('❌ Error in audit middleware:', error);
    }

    next();
  };
}

/**
 * Simple function to create audit configs for common patterns
 */
export const createAuditConfig = {
  // For routes like POST /api/orders - FULLY AUTOMATIC ID EXTRACTION
  onCreate: (entityType: string, idField: string = 'id'): AuditConfig => ({
    entityType,
    action: 'create',
    getEntityId: (req, res) => {
      // Automatically extract from response data (no manual setAuditEntityId needed!)
      const responseData = (res as any).__auditResponseData;
      if (responseData) {
        // Try common ID field names
        return responseData[idField] || responseData.id || responseData.orderId || responseData.customerId || null;
      }
      // Fallback to request body
      return req.body?.[idField] || req.body?.id || req.body?.orderId || null;
    },
    captureBody: true,
    captureResponse: true,
  }),

  // For routes like PUT /api/orders/:id
  onUpdate: (entityType: string, paramName: string = 'id'): AuditConfig => ({
    entityType,
    action: 'update',
    getEntityId: (req) => req.params[paramName] || null,
    captureBody: true,
  }),

  // For routes like DELETE /api/orders/:id
  onDelete: (entityType: string, paramName: string = 'id'): AuditConfig => ({
    entityType,
    action: 'delete',
    getEntityId: (req) => req.params[paramName] || null,
  }),

  // For custom actions like department progression
  onAction: (entityType: string, action: string, paramName: string = 'id'): AuditConfig => ({
    entityType,
    action,
    getEntityId: (req) => req.params[paramName] || null,
    captureBody: true,
  }),
};

