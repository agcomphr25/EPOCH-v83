import { auditUpdateOrders } from './orderAuditWrapper';
import { DEPARTMENTS } from '../constants/departments';

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
    if (!(DEPARTMENTS as readonly string[]).includes(safeChanges.current_department)) {
      throw new Error(`Invalid department: ${safeChanges.current_department}`);
    }
    // current_department_id references the order_departments tracking table (not a types table)
    // so we validate the name against the canonical constant but do not attempt an FK sync
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
