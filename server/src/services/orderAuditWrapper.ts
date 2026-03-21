import { Pool } from 'pg';

export interface AuditUpdateOptions {
  db: Pool;
  orderIds: string[];
  changes: Record<string, any>;
  source: string;
  user?: { username?: string; role?: string } | null;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Centralized audit wrapper for all_orders mutations.
 *
 * Fetches BEFORE values, executes the UPDATE, captures AFTER values,
 * and writes a row to admin_audit_log for every field that actually changed.
 *
 * NOTE: pool.query() in this codebase returns the rows array directly
 * (not { rows: [...] }). The .rowCount is attached as a property on the array.
 */
export async function auditUpdateOrders({
  db,
  orderIds,
  changes,
  source,
  user,
  reason,
  ip,
  userAgent,
}: AuditUpdateOptions): Promise<any[]> {
  if (!orderIds || orderIds.length === 0) {
    throw new Error('orderIds required');
  }

  const fields = Object.keys(changes);

  if (fields.length === 0) {
    throw new Error('No changes provided');
  }

  // 1. Fetch BEFORE values
  const beforeRows = (await db.query(
    `SELECT order_id, ${fields.map(f => `"${f}"`).join(', ')}
     FROM all_orders
     WHERE order_id = ANY($1::text[])`,
    [orderIds]
  )) as any[];

  const beforeMap = new Map<string, any>();
  for (const row of beforeRows) {
    beforeMap.set(row.order_id, row);
  }

  // 2. Build UPDATE query dynamically
  // Fields are positional: $1 = orderIds array, $2...$N = values
  const setClauses = fields.map((f, i) => `"${f}" = $${i + 2}`);
  const values = [orderIds, ...fields.map(f => changes[f])];

  const updateQuery = `
    UPDATE all_orders
    SET ${setClauses.join(', ')},
        updated_at = NOW()
    WHERE order_id = ANY($1::text[])
    RETURNING order_id, ${fields.map(f => `"${f}"`).join(', ')}
  `;

  const afterRows = (await db.query(updateQuery, values)) as any[];

  // 3. Build audit entries — only for fields that actually changed
  const auditInserts: Array<{
    order_id: string;
    field_name: string;
    old_value: any;
    new_value: any;
  }> = [];

  for (const row of afterRows) {
    const before = beforeMap.get(row.order_id);

    for (const field of fields) {
      const oldValue = before?.[field] ?? null;
      const newValue = row[field] ?? null;

      // Skip if no actual change (loose equality handles most primitives)
      if (String(oldValue) === String(newValue)) continue;

      auditInserts.push({
        order_id: row.order_id,
        field_name: field,
        old_value: oldValue,
        new_value: newValue,
      });
    }
  }

  // 4. Insert audit rows into admin_audit_log
  const changedBy = user?.username || 'SYSTEM';
  const userRole = user?.role || 'SYSTEM';

  // Derive a human-readable label from the column name
  function toLabel(fieldName: string): string {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  for (const entry of auditInserts) {
    await db.query(
      `INSERT INTO admin_audit_log (
         order_id,
         field_name,
         field_label,
         old_value,
         new_value,
         changed_by,
         user_role,
         change_type,
         reason,
         ip_address,
         user_agent,
         timestamp
       )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        entry.order_id,
        entry.field_name,
        toLabel(entry.field_name),
        JSON.stringify(entry.old_value),
        JSON.stringify(entry.new_value),
        changedBy,
        userRole,
        source,
        reason || null,
        ip || null,
        userAgent || null,
      ]
    );
  }

  return afterRows;
}
