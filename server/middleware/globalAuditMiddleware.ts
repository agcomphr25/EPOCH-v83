import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { auditEvents } from '../schema';

/**
 * FULLY AUTOMATIC Global Audit Middleware
 * Tracks ALL state-changing operations (POST, PUT, PATCH, DELETE) automatically
 * No manual configuration required - just apply this middleware globally
 */

// Automatically determine entity type from route path
// Extracts the first segment after /api/ and capitalizes it
// Examples:
// /api/orders/123 → Order
// /api/customers/456 → Customer
// /api/task-items/789 → TaskItem
// /api/robust-boms/abc → RobustBom
function getEntityTypeFromPath(path: string): string | null {
  // Match /api/SEGMENT or /api/SEGMENT/... patterns
  const match = path.match(/^\/api\/([^\/]+)/);
  if (!match) return null;
  
  const segment = match[1];
  
  // Convert kebab-case or snake_case to PascalCase
  // task-items → TaskItems, robust-boms → RobustBoms
  const entityType = segment
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Singularize common plural forms for consistency
  const singularized = entityType
    .replace(/ies$/, 'y')    // inventories → inventory
    .replace(/ses$/, 's')    // addresses → address  
    .replace(/s$/, '');      // orders → order, customers → customer
  
  return singularized;
}

// Determine action from HTTP method and path
function getActionFromRequest(method: string, path: string): string {
  if (method === 'POST') {
    if (path.includes('/progress')) return 'department_progress';
    if (path.includes('/department')) return 'department_transfer';
    if (path.includes('/finalize')) return 'finalize';
    if (path.includes('/cancel')) return 'cancel';
    if (path.includes('/scrap')) return 'scrap';
    if (path.includes('/complete')) return 'complete';
    if (path.includes('/approve')) return 'approve';
    if (path.includes('/reject')) return 'reject';
    return 'create';
  } else if (method === 'PUT' || method === 'PATCH') {
    return 'update';
  } else if (method === 'DELETE') {
    return 'delete';
  }
  return 'unknown';
}

// Extract entity ID from request or response (enhanced version)
function extractEntityId(req: Request, res: Response, responseBody: any): string | null {
  // 1. Try route parameters first (/:id, /:orderId, /:customerId, etc.)
  const paramKeys = Object.keys(req.params);
  for (const key of paramKeys) {
    if (key.toLowerCase().includes('id')) {
      const value = req.params[key];
      if (value && value !== 'undefined' && value !== 'null') {
        return String(value);
      }
    }
  }
  
  // 2. Try response body - handle arrays by taking first item
  if (responseBody) {
    let bodyToCheck = responseBody;
    
    // If response is an array, check the first item
    if (Array.isArray(responseBody) && responseBody.length > 0) {
      bodyToCheck = responseBody[0];
    }
    
    if (typeof bodyToCheck === 'object') {
      // Try all common ID field patterns
      const idFields = [
        'orderId', 'id', 'customerId', 'inventoryId', 'employeeId', 'userId', 
        'vendorId', 'bomId', 'taskId', 'formId', 'paymentId', 'shipmentId',
        'refundId', 'moldId', 'featureId', 'departmentId', 'trainingId',
        'certificationId', 'documentId', 'messageId', 'communicationId'
      ];
      
      for (const field of idFields) {
        if (bodyToCheck[field]) {
          return String(bodyToCheck[field]);
        }
      }
    }
  }
  
  // 3. Try request body (for creates where ID is provided upfront)
  if (req.body && typeof req.body === 'object') {
    const idFields = [
      'orderId', 'id', 'customerId', 'inventoryId', 'employeeId', 'userId',
      'vendorId', 'bomId', 'taskId', 'formId', 'paymentId', 'shipmentId'
    ];
    
    for (const field of idFields) {
      if (req.body[field]) {
        return String(req.body[field]);
      }
    }
  }
  
  return null;
}

/**
 * Global middleware that automatically tracks all mutations
 * Apply this BEFORE all routes in your app
 */
export function globalAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only audit state-changing methods
  const auditableMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!auditableMethods.includes(req.method)) {
    return next();
  }
  
  // Skip non-API routes and read-only endpoints
  if (!req.path.startsWith('/api/') || req.path.includes('/api/auth/session')) {
    return next();
  }
  
  const startTime = Date.now();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  
  let responseBody: any = null;
  let statusCode: number | null = null;
  
  // Intercept response
  res.json = function (body: any) {
    responseBody = body;
    statusCode = res.statusCode;
    return originalJson(body);
  };
  
  res.send = function (body: any) {
    if (!responseBody) {
      try {
        responseBody = typeof body === 'string' ? JSON.parse(body) : body;
      } catch {
        responseBody = body;
      }
      statusCode = res.statusCode;
    }
    return originalSend(body);
  };
  
  // Log audit event after response completes
  res.on('finish', async () => {
    try {
      // Only log successful operations (2xx status codes)
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        return;
      }
      
      const entityType = getEntityTypeFromPath(req.path);
      if (!entityType) {
        // Skip routes we don't recognize
        return;
      }
      
      const entityId = extractEntityId(req, res, responseBody);
      if (!entityId) {
        // Log error but don't fail the operation
        console.error(`❌ Auto-audit: FAILED to extract entity ID for ${req.method} ${req.path} - skipping audit`);
        console.error(`   Response body:`, JSON.stringify(responseBody).substring(0, 200));
        console.error(`   Request params:`, req.params);
        return;
      }
      
      const action = getActionFromRequest(req.method, req.path);
      const user = (req as any).user;
      const actorId = user?.id || null;
      const actorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'System';
      const actorRole = user?.role || null;
      
      // Capture before/after for updates
      let fieldsChanged = null;
      if (req.body && Object.keys(req.body).length > 0) {
        fieldsChanged = {
          after: req.body,
        };
      }
      
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
      
      // Insert audit event
      await db.insert(auditEvents).values({
        entityType,
        entityId,
        action,
        actorId,
        actorName,
        actorRole,
        fieldsChanged,
        meta,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
      
      console.log(`✅ Auto-audit: ${entityType} ${entityId} - ${action} by ${actorName}`);
    } catch (error) {
      console.error('❌ Global audit middleware error:', error);
      // Don't fail the request
    }
  });
  
  next();
}
