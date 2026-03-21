import { auditUpdateOrders } from './orderAuditWrapper';

const ALLOWED_FIELDS = [
  'due_date',
  'notes',
  'current_department',
  'status',
  'customer_id',
  'model_id',
];

export async function adminOverrideOrder({
  db,
  orderId,
  changes,
  user,
  reason,
  ip,
  userAgent,
}: {
  db: any;
  orderId: string;
  changes: Record<string, any>;
  user?: { username?: string; role?: string } | null;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<any[]> {
  const safeChanges: Record<string, any> = {};

  for (const key of Object.keys(changes)) {
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new Error(`Field not allowed: ${key}`);
    }
    safeChanges[key] = changes[key];
  }

  return await auditUpdateOrders({
    db,
    orderIds: [orderId],
    changes: safeChanges,
    source: 'ADMIN_OVERRIDE',
    user,
    reason,
    ip,
    userAgent,
  });
}
