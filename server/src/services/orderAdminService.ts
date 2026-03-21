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

  if (safeChanges.status) {
    const result = await db.query(
      `SELECT id FROM order_statuses WHERE name = $1`,
      [safeChanges.status]
    ) as any[];
    if (result.length === 0) {
      throw new Error(`Invalid status: ${safeChanges.status}`);
    }
    safeChanges.status_id = result[0].id;
  }

  if (safeChanges.current_department) {
    const result = await db.query(
      `SELECT id FROM order_departments WHERE name = $1`,
      [safeChanges.current_department]
    ) as any[];
    if (result.length === 0) {
      throw new Error(`Invalid department: ${safeChanges.current_department}`);
    }
    safeChanges.current_department_id = result[0].id;
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
