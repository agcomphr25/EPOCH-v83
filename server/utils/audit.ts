import { db } from '../db';
import { auditEvents, type InsertAuditEvent } from '../schema';
import type { Request } from 'express';

/**
 * Audit Event Action Types
 */
export const AUDIT_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  PROGRESS: 'progress',
  APPROVE: 'approve',
  SIGN: 'sign',
  SUBMIT: 'submit',
  CANCEL: 'cancel',
  RESTORE: 'restore',
  ASSIGN: 'assign',
  UNASSIGN: 'unassign',
  SHIP: 'ship',
  PAYMENT: 'payment',
  SCRAP: 'scrap',
  LINK: 'link',
  UNLINK: 'unlink',
  VERIFY: 'verify',
  COMPLETE: 'complete',
  STATUS_CHANGE: 'status_change',
} as const;

/**
 * Audit Event Entity Types
 */
export const AUDIT_ENTITIES = {
  ORDER: 'Order',
  CUSTOMER: 'Customer',
  INVENTORY: 'Inventory',
  EMPLOYEE: 'Employee',
  VENDOR: 'Vendor',
  PAYMENT: 'Payment',
  SHIPMENT: 'Shipment',
  BOM: 'BOM',
  FEATURE: 'Feature',
  STOCK_MODEL: 'StockModel',
  DEPARTMENT: 'Department',
  USER: 'User',
  TRAINING: 'Training',
  QC_CHECKLIST: 'QCChecklist',
} as const;

/**
 * Interface for audit event data
 */
export interface AuditEventData {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: number | null;
  actorName: string;
  actorRole?: string | null;
  reason?: string | null;
  fieldsChanged?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  } | null;
  meta?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Extract user info from Express request
 */
export function getUserInfoFromRequest(req: Request): {
  actorId: number | null;
  actorName: string;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
} {
  const user = (req as any).user;
  
  return {
    actorId: user?.id || null,
    actorName: user?.username || user?.firstName + ' ' + user?.lastName || 'System',
    actorRole: user?.role || null,
    ipAddress: req.ip || req.headers['x-forwarded-for'] as string || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(data: AuditEventData): Promise<void> {
  try {
    const eventData: InsertAuditEvent = {
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      actorId: data.actorId || null,
      actorName: data.actorName,
      actorRole: data.actorRole || null,
      reason: data.reason || null,
      fieldsChanged: data.fieldsChanged || null,
      meta: data.meta || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    };

    await db.insert(auditEvents).values(eventData);
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Log an audit event from an Express request
 */
export async function logAuditEventFromRequest(
  req: Request,
  data: Omit<AuditEventData, 'actorId' | 'actorName' | 'actorRole' | 'ipAddress' | 'userAgent'>
): Promise<void> {
  const userInfo = getUserInfoFromRequest(req);
  
  await logAuditEvent({
    ...data,
    ...userInfo,
  });
}

/**
 * Helper function to create field change object
 */
export function createFieldChanges(
  before: Record<string, any> | null,
  after: Record<string, any>
): { before: Record<string, any> | null; after: Record<string, any> } {
  return {
    before: before || null,
    after,
  };
}

/**
 * Helper function to detect changed fields between two objects
 */
export function detectChangedFields(
  before: Record<string, any>,
  after: Record<string, any>
): { before: Record<string, any>; after: Record<string, any> } | null {
  const changedFields: { before: Record<string, any>; after: Record<string, any> } = {
    before: {},
    after: {},
  };

  let hasChanges = false;

  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedFields.before[key] = before[key];
      changedFields.after[key] = after[key];
      hasChanges = true;
    }
  }

  return hasChanges ? changedFields : null;
}

/**
 * Log department progress for an order
 */
export async function logDepartmentProgress(
  req: Request,
  orderId: string,
  fromDepartment: string,
  toDepartment: string,
  assignedTechnician?: string,
  completedAt?: Date,
  reason?: string
): Promise<void> {
  const userInfo = getUserInfoFromRequest(req);

  await logAuditEvent({
    entityType: AUDIT_ENTITIES.ORDER,
    entityId: orderId,
    action: AUDIT_ACTIONS.PROGRESS,
    reason: reason || `Moved to ${toDepartment}`,
    meta: {
      fromDepartment,
      toDepartment,
      assignedTechnician,
      completedAt: completedAt?.toISOString(),
    },
    ...userInfo,
  });
}

/**
 * Log order status change
 */
export async function logOrderStatusChange(
  req: Request,
  orderId: string,
  fromStatus: string,
  toStatus: string,
  reason?: string
): Promise<void> {
  const userInfo = getUserInfoFromRequest(req);

  await logAuditEvent({
    entityType: AUDIT_ENTITIES.ORDER,
    entityId: orderId,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    reason: reason || `Status changed to ${toStatus}`,
    fieldsChanged: {
      before: { status: fromStatus },
      after: { status: toStatus },
    },
    ...userInfo,
  });
}

/**
 * Log payment event
 */
export async function logPaymentEvent(
  req: Request,
  orderId: string,
  paymentAmount: number,
  paymentType: string,
  reason?: string
): Promise<void> {
  const userInfo = getUserInfoFromRequest(req);

  await logAuditEvent({
    entityType: AUDIT_ENTITIES.ORDER,
    entityId: orderId,
    action: AUDIT_ACTIONS.PAYMENT,
    reason: reason || `Payment of $${paymentAmount} recorded`,
    meta: {
      paymentAmount,
      paymentType,
    },
    ...userInfo,
  });
}

/**
 * Log shipping event
 */
export async function logShippingEvent(
  req: Request,
  orderId: string,
  trackingNumber: string,
  carrier: string,
  method: string,
  reason?: string
): Promise<void> {
  const userInfo = getUserInfoFromRequest(req);

  await logAuditEvent({
    entityType: AUDIT_ENTITIES.ORDER,
    entityId: orderId,
    action: AUDIT_ACTIONS.SHIP,
    reason: reason || `Order shipped via ${carrier}`,
    meta: {
      trackingNumber,
      carrier,
      method,
    },
    ...userInfo,
  });
}
