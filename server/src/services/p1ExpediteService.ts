import { randomUUID } from 'crypto';
import { pgPool } from '../../db';

export const PURE_PRECISION_EXPEDITE_IDS = Array.from(
  { length: 16 },
  (_, index) => `FB${250 + index}`
);

const TARGET_DEPARTMENT = 'Shipping QC';

type Actor = { id?: number | null; username: string; role?: string | null };

export interface ExpeditePreviewRow {
  requestedId: string;
  orderId: string | null;
  fbOrderNumber: string | null;
  customerName: string | null;
  currentDepartment: string | null;
  productionDepartment: string | null;
  eligible: boolean;
  alreadyAtShippingQc: boolean;
  blockers: string[];
  allOrderId?: string | null;
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(value => String(value).trim().toUpperCase()).filter(Boolean))];
}

async function loadPreview(ids: string[], query = pgPool.query.bind(pgPool)): Promise<ExpeditePreviewRow[]> {
  if (!ids.length) return [];
  const result = await query(
    `SELECT requested.requested_id,
            po.order_id, ao.order_id AS all_order_id, ao.fb_order_number,
            ao.current_department AS all_order_department, ao.status,
            ao.scrap_date, ao.shipped_date,
            po.id AS production_order_id, po.customer_name,
            po.current_department AS production_department,
            po.production_status, po.is_fulfilled, po.shipped_at,
            EXISTS (
              SELECT 1 FROM nonconformance_records ncr
              WHERE LOWER(COALESCE(ncr.status, 'open')) <> 'resolved'
                AND (ncr.order_id = ao.order_id OR ncr.order_id = ao.fb_order_number
                     OR ao.order_id = ANY(COALESCE(ncr.additional_order_ids, ARRAY[]::text[])))
            ) AS has_open_ncr
       FROM unnest($1::text[]) WITH ORDINALITY requested(requested_id, ordinal)
       LEFT JOIN LATERAL (
         SELECT * FROM production_orders candidate
          WHERE UPPER(candidate.order_id) = requested.requested_id
          ORDER BY candidate.id DESC LIMIT 1
       ) po ON true
       LEFT JOIN LATERAL (
         SELECT * FROM all_orders candidate
          WHERE candidate.order_id = po.order_id
             OR UPPER(COALESCE(candidate.fb_order_number, '')) = requested.requested_id
          ORDER BY candidate.id DESC LIMIT 1
       ) ao ON true
      ORDER BY requested.ordinal`,
    [ids]
  );

  return result.rows.map((row: any) => {
    const blockers: string[] = [];
    if (!row.production_order_id) blockers.push('P1 production order not found');
    if (row.customer_name && !String(row.customer_name).toLowerCase().includes('pure precision')) {
      blockers.push(`Customer is ${row.customer_name}, not Pure Precision`);
    }
    if (row.production_order_id && !row.customer_name) blockers.push('Customer could not be verified');
    if (row.scrap_date || String(row.status || '').toUpperCase().includes('SCRAP')) blockers.push('Order is scrapped');
    if (String(row.status || '').toUpperCase().includes('CANCEL') || String(row.production_status || '').toUpperCase().includes('CANCEL')) blockers.push('Order is cancelled');
    if (row.shipped_date || row.shipped_at || row.is_fulfilled || String(row.production_status || '').toUpperCase() === 'SHIPPED') {
      blockers.push('Order is already shipped or fulfilled');
    }
    if (row.has_open_ncr) blockers.push('Order has an open nonconformance record');
    const alreadyAtShippingQc = row.production_department === TARGET_DEPARTMENT
      && (!row.all_order_id || row.all_order_department === TARGET_DEPARTMENT);
    return {
      requestedId: row.requested_id,
      orderId: row.order_id ?? null,
      fbOrderNumber: row.fb_order_number ?? null,
      customerName: row.customer_name ?? null,
      currentDepartment: row.production_department ?? null,
      productionDepartment: row.production_department ?? null,
      eligible: blockers.length === 0,
      alreadyAtShippingQc,
      blockers,
      allOrderId: row.all_order_id ?? null,
    };
  });
}

export async function previewPurePrecisionExpedite(rawIds: unknown) {
  const ids = normalizeIds(rawIds);
  return { targetDepartment: TARGET_DEPARTMENT, rows: await loadPreview(ids) };
}

export async function executePurePrecisionExpedite(input: {
  ids: unknown;
  reason: string;
  actor: Actor;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const ids = normalizeIds(input.ids);
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error('A reason of at least 10 characters is required');
  if (!ids.length) throw new Error('At least one order is required');

  const client = await pgPool.connect();
  const correlationId = `pure-precision-expedite:${randomUUID()}`;
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT id FROM production_orders WHERE UPPER(order_id) = ANY($1::text[]) FOR UPDATE`, [ids]
    );
    await client.query(
      `SELECT id FROM all_orders
        WHERE order_id IN (SELECT order_id FROM production_orders WHERE UPPER(order_id) = ANY($1::text[]))
           OR UPPER(COALESCE(fb_order_number, '')) = ANY($1::text[])
        FOR UPDATE`, [ids]
    );
    const preview = await loadPreview(ids, client.query.bind(client));
    const blocked = preview.filter(row => !row.eligible);
    if (blocked.length) {
      const error: any = new Error('No orders were changed because one or more orders failed validation');
      error.statusCode = 409;
      error.preview = preview;
      throw error;
    }

    const changed: string[] = [];
    for (const row of preview) {
      if (row.alreadyAtShippingQc || !row.orderId) continue;
      const historyEntry = JSON.stringify({
        department: TARGET_DEPARTMENT,
        enteredAt: new Date().toISOString(),
        expedited: true,
        reason,
        actor: input.actor.username,
        correlationId,
        from: row.currentDepartment,
      });

      if (row.allOrderId) {
        await client.query(
          `UPDATE all_orders SET current_department = $1,
              department_history = COALESCE(department_history, '[]'::jsonb) || $2::jsonb,
              updated_at = NOW() WHERE order_id = $3`,
          [TARGET_DEPARTMENT, JSON.stringify([JSON.parse(historyEntry)]), row.allOrderId]
        );
      }
      await client.query(
        `UPDATE production_orders SET current_department = $1, production_status = 'IN_PROGRESS',
            department_history = COALESCE(department_history, '[]'::jsonb) || $2::jsonb,
            updated_at = NOW() WHERE order_id = $3`,
        [TARGET_DEPARTMENT, JSON.stringify([JSON.parse(historyEntry)]), row.orderId]
      );
      await client.query(
        `UPDATE order_department_transitions SET exited_at = NOW(),
            duration_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - entered_at)) / 60)::int),
            exit_reason = 'expedited', metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE entity_type = 'p1_order' AND entity_id = $2 AND exited_at IS NULL`,
        [JSON.stringify({ reason, correlationId, actor: input.actor.username }), row.orderId]
      );
      await client.query(
        `INSERT INTO order_department_transitions
          (entity_type, entity_id, department, entered_at, exit_reason, metadata)
         VALUES ('p1_order', $1, $2, NOW(), NULL, $3::jsonb)`,
        [row.orderId, TARGET_DEPARTMENT, JSON.stringify({ expedited: true, reason, correlationId, actor: input.actor.username })]
      );
      await client.query(
        `INSERT INTO order_activity_events
          (order_id, event_type, event_category, actor_id, actor_type, actor_display_name,
           source, source_route, correlation_id, reason_code, reason_text,
           before_snapshot, after_snapshot, field_diff, department_from, department_to, metadata)
         VALUES ($1, 'P1_EXPEDITED_TO_SHIPPING_QC', 'production', $2, 'user', $3,
                 'admin', '/api/admin/p1-expedite/execute', $4, 'TEMPORARY_ABBREVIATED_FLOW', $5,
                 $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb)`,
        [row.orderId, input.actor.id ?? null, input.actor.username, correlationId, reason,
         JSON.stringify({ currentDepartment: row.currentDepartment, productionDepartment: row.productionDepartment }),
         JSON.stringify({ currentDepartment: TARGET_DEPARTMENT, productionDepartment: TARGET_DEPARTMENT }),
         JSON.stringify({ currentDepartment: { before: row.currentDepartment, after: TARGET_DEPARTMENT } }),
         row.currentDepartment, TARGET_DEPARTMENT,
         JSON.stringify({ requestedId: row.requestedId, customer: row.customerName, normalRoutingUnchanged: true })]
      );
      await client.query(
        `INSERT INTO admin_audit_log
          (order_id, field_name, field_label, old_value, new_value, changed_by, user_role,
           change_type, reason, ip_address, user_agent, timestamp)
         VALUES ($1, 'current_department', 'Pure Precision Fast Track', $2, $3, $4, $5,
                 'P1_EXPEDITE', $6, $7, $8, NOW())`,
        [row.orderId, JSON.stringify(row.currentDepartment), JSON.stringify(TARGET_DEPARTMENT),
         input.actor.username, input.actor.role ?? 'ADMIN', reason, input.ip ?? null, input.userAgent ?? null]
      );
      changed.push(row.orderId);
    }
    await client.query('COMMIT');
    return { success: true, correlationId, changed, unchanged: preview.filter(r => r.alreadyAtShippingQc).map(r => r.orderId), rows: preview };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
