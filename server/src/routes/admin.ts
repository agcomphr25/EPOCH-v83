import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { seedOrderReferenceTables } from '../../seeds/orderReferenceTables';
import { pool } from '../../db';

const router = Router();

router.post(
  '/seed-reference-tables',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      console.log('🌱 Admin seed endpoint called - seeding reference tables...');
      
      await seedOrderReferenceTables();
      
      console.log('✅ Reference tables seeded successfully');
      res.json({
        success: true,
        message: 'Order reference tables (departments and statuses) have been seeded successfully.',
        details: {
          departments: [
            'Production Queue',
            'Layup/Plugging',
            'Barcode',
            'CNC',
            'Gunsmith',
            'Finish',
            'Finish QC',
            'Shipping QC',
            'Shipping'
          ],
          statuses: [
            'Holding',
            'Finalized',
            'In Progress',
            'Fulfilled',
            'Cancelled'
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error seeding reference tables:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to seed reference tables',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// ─── Domain Truth Inspector ──────────────────────────────────────────────────

const DEPARTMENT_FLOW = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
];

const EXCLUDED_STATUSES = ['SCRAPPED', 'CANCELLED', 'FULFILLED'];

router.get(
  '/domain-truth/order/:orderId',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      // pool.query() from server/db.ts returns the rows array directly (not { rows: [...] })
      const safeQuery = async (sql: string, params: any[]): Promise<any[]> => {
        try {
          const rows = await pool.query(sql, params) as any[];
          return Array.isArray(rows) ? rows : [];
        } catch (err) {
          console.warn('[DomainTruth] Query failed:', (err as Error).message, '|', sql.slice(0, 80));
          return [];
        }
      };

      // ── 1. Core order from all_orders ─────────────────────────────────────
      const [orderRows, legacyRows, productionRows, payments, kickbacks, adminAuditLog, auditEventsRows, departmentTransitions] =
        await Promise.all([
          safeQuery(
            `SELECT
              ao.order_id,
              ao.status,
              ao.current_department,
              ao.current_department_id,
              ao.scrap_date,
              ao.is_cancelled,
              ao.is_flattop,
              ao.features,
              ao.model_id,
              ao.order_source,
              ao.created_at,
              ao.due_date,
              ao.customer_id,
              ao.department_history,
              ao.shipped_date,
              ao.is_paid,
              ao.is_replacement,
              ao.urgency,
              ao.priority_score,
              ao.scrap_reason,
              ao.updated_at,
              c.name AS customer_name,
              c.email AS customer_email
            FROM all_orders ao
            LEFT JOIN customers c ON ao.customer_id = CAST(c.id AS TEXT)
            WHERE ao.order_id = $1
            LIMIT 1`,
            [orderId]
          ),
          safeQuery(
            `SELECT order_id, status, current_department, created_at
             FROM orders WHERE order_id = $1 LIMIT 1`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, order_id, production_status, current_department, department_history, created_at
             FROM production_orders WHERE order_id = $1 LIMIT 1`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, order_id, payment_amount, payment_type, payment_date
             FROM payments WHERE order_id = $1 ORDER BY payment_date DESC`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, order_id, kickback_dept, reason_code, reason_text, status, priority,
                    reported_by, kickback_date, resolved_at, resolved_by, resolution_notes
             FROM kickbacks WHERE order_id = $1 ORDER BY kickback_date DESC`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, order_id, field_name, field_label, old_value, new_value,
                    changed_by, user_role, change_type, timestamp
             FROM admin_audit_log WHERE order_id = $1
             ORDER BY timestamp DESC LIMIT 100`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, entity_type, entity_id, action, actor_name, actor_role,
                    reason, fields_changed, meta, timestamp
             FROM audit_events WHERE entity_id = $1
             ORDER BY timestamp DESC LIMIT 100`,
            [orderId]
          ),
          safeQuery(
            `SELECT id, entity_type, entity_id, department, entered_at, exited_at,
                    duration_minutes, exit_reason, cycle_number
             FROM order_department_transitions WHERE entity_id = $1
             ORDER BY entered_at DESC`,
            [orderId]
          ),
        ]);

      const order = orderRows[0] || null;
      const legacyOrder = legacyRows[0] || null;
      const productionOrder = productionRows[0] || null;

      // ── 5. Queue eligibility evaluation ──────────────────────────────────
      let queueEvaluation: any = null;

      if (order) {
        const dept = order.current_department;
        const statusOk = !EXCLUDED_STATUSES.includes(order.status);
        const notScrapped = order.status !== 'SCRAPPED';
        const notCancelled = order.status !== 'CANCELLED';
        const notFulfilled = order.status !== 'FULFILLED';
        const scrapDateNull = order.scrap_date === null;
        const isCancelledFalse = order.is_cancelled !== true;
        const hasDept = !!dept;

        const visible =
          hasDept && statusOk && scrapDateNull && isCancelledFalse;

        queueEvaluation = {
          department: dept || '(none)',
          visible,
          checks: [
            {
              rule: 'has current_department',
              result: hasDept,
              detail: dept || 'null — order not in any queue',
            },
            {
              rule: 'status not SCRAPPED',
              result: notScrapped,
              detail: `status = "${order.status}"`,
            },
            {
              rule: 'status not CANCELLED',
              result: notCancelled,
              detail: `status = "${order.status}"`,
            },
            {
              rule: 'status not FULFILLED',
              result: notFulfilled,
              detail: `status = "${order.status}"`,
            },
            {
              rule: 'scrap_date IS NULL',
              result: scrapDateNull,
              detail: order.scrap_date
                ? `scrap_date = ${order.scrap_date}`
                : 'null (ok)',
            },
            {
              rule: 'is_cancelled != true',
              result: isCancelledFalse,
              detail: `is_cancelled = ${order.is_cancelled}`,
            },
          ],
          departmentPosition: dept ? DEPARTMENT_FLOW.indexOf(dept) : -1,
          departmentFlow: DEPARTMENT_FLOW,
        };
      }

      // ── 6. Routing flags ──────────────────────────────────────────────────
      const routingFlags: any[] = [];

      if (order) {
        if (order.is_flattop) {
          routingFlags.push({
            flag: 'is_flattop',
            effect: 'Bypasses CNC and Gunsmith — routes Layup/Plugging → Finish directly',
            severity: 'info',
          });
        }

        let features: any = {};
        try {
          features =
            typeof order.features === 'string'
              ? JSON.parse(order.features)
              : order.features || {};
        } catch (_) {}

        const railAccessory = features?.rail_accessory;
        const hasNoRail = Array.isArray(railAccessory)
          ? railAccessory.includes('no_rail')
          : typeof railAccessory === 'string' && railAccessory.includes('no_rail');

        if (hasNoRail) {
          routingFlags.push({
            flag: 'no_rail',
            effect: 'Bypasses Gunsmith — routes CNC → Finish directly',
            severity: 'info',
          });
        }

        const stockModel = order.model_id || '';
        const noStockValues = ['no_stock', 'no stock', 'none'];
        if (noStockValues.includes(stockModel?.toLowerCase())) {
          routingFlags.push({
            flag: 'no_stock_model',
            effect: 'Auto-moved to Shipping QC by background process (no physical stock needed)',
            severity: 'warning',
            value: stockModel,
          });
        }

        if (!stockModel || stockModel === '') {
          routingFlags.push({
            flag: 'missing_stock_model',
            effect: 'Flagged for attention — background process may hold in P1 Production Queue',
            severity: 'warning',
          });
        }

        const actionLength = features?.action_length;
        if (
          !order.is_flattop &&
          stockModel &&
          !noStockValues.includes(stockModel?.toLowerCase()) &&
          (!actionLength && actionLength !== 0)
        ) {
          routingFlags.push({
            flag: 'missing_action_length',
            effect: 'Flagged for attention — background process may hold in P1 Production Queue',
            severity: 'warning',
          });
        }

        if (order.order_source === 'PO_RELEASE') {
          routingFlags.push({
            flag: 'po_release_order',
            effect: 'Created from a P1 Purchase Order line — may also appear in production_orders table',
            severity: 'info',
          });
        }
      }

      // ── 7. System warnings ────────────────────────────────────────────────
      const systemWarnings: any[] = [];

      if (order) {
        if (order.status === 'FINALIZED' && order.is_cancelled === true) {
          systemWarnings.push({
            code: 'CANCEL_FLAG_MISMATCH',
            message: 'status is FINALIZED but is_cancelled is true — order may appear in queue incorrectly',
            fields: ['status', 'is_cancelled'],
          });
        }

        if (order.scrap_date && order.status !== 'SCRAPPED') {
          systemWarnings.push({
            code: 'SCRAP_STATE_MISMATCH',
            message: `scrap_date is set (${order.scrap_date}) but status is "${order.status}" — inconsistent scrap state`,
            fields: ['scrap_date', 'status'],
          });
        }

        if (!order.scrap_date && order.status === 'SCRAPPED') {
          systemWarnings.push({
            code: 'SCRAPPED_NO_DATE',
            message: 'status is SCRAPPED but scrap_date is null — scrap date missing',
            fields: ['scrap_date', 'status'],
          });
        }

        if (order.current_department && !DEPARTMENT_FLOW.includes(order.current_department)) {
          systemWarnings.push({
            code: 'UNKNOWN_DEPARTMENT',
            message: `current_department "${order.current_department}" is not in the canonical department flow — order will not appear in any queue`,
            fields: ['current_department'],
          });
        }

        if (!legacyOrder) {
          systemWarnings.push({
            code: 'LEGACY_TABLE_MISSING',
            message: 'Order exists in all_orders but NOT in the legacy orders table',
            fields: ['orders'],
          });
        } else if (legacyOrder.current_department !== order.current_department) {
          systemWarnings.push({
            code: 'LEGACY_DEPARTMENT_MISMATCH',
            message: `current_department in all_orders ("${order.current_department}") differs from legacy orders table ("${legacyOrder.current_department}")`,
            fields: ['current_department'],
          });
        }

        if (!order.current_department && !EXCLUDED_STATUSES.includes(order.status)) {
          systemWarnings.push({
            code: 'NO_DEPARTMENT_ACTIVE_ORDER',
            message: `Order has no current_department but status is "${order.status}" — order is invisible to all queues`,
            fields: ['current_department', 'status'],
          });
        }

        if (productionOrder && productionOrder.current_department !== order.current_department) {
          systemWarnings.push({
            code: 'PRODUCTION_ORDER_DEPARTMENT_MISMATCH',
            message: `current_department in all_orders ("${order.current_department}") differs from production_orders table ("${productionOrder.current_department}")`,
            fields: ['current_department'],
          });
        }

        const openKickbacks = kickbacks.filter((k: any) => k.status === 'OPEN');
        if (openKickbacks.length > 0) {
          systemWarnings.push({
            code: 'OPEN_KICKBACKS',
            message: `Order has ${openKickbacks.length} open kickback(s) — quality issues may affect production`,
            fields: ['kickbacks'],
          });
        }
      } else {
        systemWarnings.push({
          code: 'ORDER_NOT_FOUND',
          message: `No order found in all_orders with order_id = "${orderId}"`,
          fields: ['order_id'],
        });
      }

      // ── 8. Response ───────────────────────────────────────────────────────
      res.json({
        orderId,
        order,
        legacyOrder,
        productionOrder,
        customer: order
          ? { name: order.customer_name, email: order.customer_email, id: order.customer_id }
          : null,
        payments,
        kickbacks,
        adminAuditLog,
        auditEvents: auditEventsRows,
        departmentTransitions,
        queueEvaluation,
        routingFlags,
        systemWarnings,
        rawDepartmentHistory: order?.department_history ?? null,
        parsedHistory: (() => {
          const raw = order?.department_history;
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          try { return JSON.parse(raw as string); } catch { return []; }
        })(),
      });
    } catch (error) {
      console.error('❌ Domain Truth Inspector error:', error);
      res.status(500).json({
        error: 'Failed to load domain truth data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ─── Order Flight Recorder ───────────────────────────────────────────────────

interface FlightEvent {
  timestamp: string | null;
  type: string;
  description: string;
  actor: string | null;
  metadata: Record<string, any>;
}

router.get(
  '/order-flight-recorder/:orderId',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const safeQ = async (sql: string, params: any[]): Promise<any[]> => {
        try {
          const rows = await pool.query(sql, params) as any[];
          return Array.isArray(rows) ? rows : [];
        } catch (err) {
          console.warn('[FlightRecorder] Query failed:', (err as Error).message, '|', sql.slice(0, 80));
          return [];
        }
      };

      // ── Load all event sources in parallel ───────────────────────────────
      const [
        orderRows,
        auditEventRows,
        adminLogRows,
        badgeScanRows,
        transitionRows,
      ] = await Promise.all([
        safeQ(
          `SELECT created_at, updated_at, department_history, status, current_department
           FROM all_orders WHERE order_id = $1 LIMIT 1`,
          [orderId]
        ),
        safeQ(
          `SELECT action, actor_name, actor_role, reason, fields_changed, meta, timestamp
           FROM audit_events WHERE entity_id = $1 ORDER BY timestamp ASC`,
          [orderId]
        ),
        safeQ(
          `SELECT field_name, field_label, old_value, new_value, changed_by, timestamp
           FROM admin_audit_log WHERE order_id = $1 ORDER BY timestamp ASC`,
          [orderId]
        ),
        safeQ(
          `SELECT employee_code, action_type, action_payload, outcome, error_message, scanned_at
           FROM badge_scan_audit_log
           WHERE action_payload->>'targetBarcode' = $1
           ORDER BY scanned_at ASC`,
          [orderId]
        ),
        safeQ(
          `SELECT department, entered_at, exited_at, duration_minutes, exit_reason, cycle_number
           FROM order_department_transitions WHERE entity_id = $1 ORDER BY entered_at ASC`,
          [orderId]
        ),
      ]);

      const events: FlightEvent[] = [];

      // ── 1. ORDER CREATED ─────────────────────────────────────────────────
      const orderRow = orderRows[0];
      if (orderRow?.created_at) {
        events.push({
          timestamp: new Date(orderRow.created_at).toISOString(),
          type: 'ORDER_CREATED',
          description: `Order ${orderId} created`,
          actor: null,
          metadata: { status: orderRow.status },
        });
      }

      // ── 2. DEPARTMENT HISTORY (embedded JSONB) ───────────────────────────
      let deptHistory: any[] = [];
      try {
        const raw = orderRow?.department_history;
        deptHistory = Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
          ? JSON.parse(raw)
          : [];
      } catch (_) {}

      for (const entry of deptHistory) {
        const ts = entry.timestamp ?? entry.movedAt ?? null;
        const from = entry.fromDepartment ?? entry.from ?? '?';
        const to = entry.toDepartment ?? entry.to ?? '?';
        const by = entry.movedBy ?? entry.progressedBy ?? entry.assignedTechnician ?? null;
        events.push({
          timestamp: ts ? new Date(ts).toISOString() : null,
          type: 'DEPARTMENT_CHANGE',
          description: `Department: ${from} → ${to}`,
          actor: by,
          metadata: { fromDepartment: from, toDepartment: to },
        });
      }

      // ── 3. AUDIT EVENTS ──────────────────────────────────────────────────
      for (const e of auditEventRows) {
        const desc = e.reason
          ? `${e.action}: ${e.reason}`
          : e.action;
        events.push({
          timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
          type: 'AUDIT_EVENT',
          description: desc,
          actor: e.actor_name ?? null,
          metadata: {
            action: e.action,
            role: e.actor_role,
            fieldsChanged: e.fields_changed,
            meta: e.meta,
          },
        });
      }

      // ── 4. ADMIN AUDIT LOG (field edits) ─────────────────────────────────
      for (const e of adminLogRows) {
        const label = e.field_label || e.field_name;
        const oldVal = e.old_value === null ? 'null' : JSON.stringify(e.old_value);
        const newVal = e.new_value === null ? 'null' : JSON.stringify(e.new_value);
        events.push({
          timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
          type: 'FIELD_CHANGE',
          description: `"${label}" changed: ${oldVal} → ${newVal}`,
          actor: e.changed_by ?? null,
          metadata: { fieldName: e.field_name, oldValue: e.old_value, newValue: e.new_value },
        });
      }

      // ── 5. BADGE SCANS ───────────────────────────────────────────────────
      for (const e of badgeScanRows) {
        const payload = e.action_payload ?? {};
        const from = payload?.actionConfig?.fromDepartment ?? null;
        const to = payload?.actionConfig?.toDepartment ?? null;
        const deptInfo = from && to ? ` (${from} → ${to})` : '';
        const outcomeTag = e.outcome === 'success' ? '' : ` [${e.outcome}]`;
        const errorNote = e.error_message && e.outcome !== 'success' ? ` — ${e.error_message}` : '';
        events.push({
          timestamp: e.scanned_at ? new Date(e.scanned_at).toISOString() : null,
          type: 'BADGE_SCAN',
          description: `Badge scan: ${e.action_type}${deptInfo}${outcomeTag}${errorNote}`,
          actor: e.employee_code ?? null,
          metadata: { actionType: e.action_type, outcome: e.outcome, errorMessage: e.error_message ?? null, payload },
        });
      }

      // ── 6. DEPARTMENT TRANSITIONS ────────────────────────────────────────
      for (const t of transitionRows) {
        events.push({
          timestamp: t.entered_at ? new Date(t.entered_at).toISOString() : null,
          type: 'DEPT_ENTERED',
          description: `Entered: ${t.department}${t.cycle_number > 1 ? ` (cycle ${t.cycle_number})` : ''}`,
          actor: null,
          metadata: { department: t.department, cycle: t.cycle_number },
        });
        if (t.exited_at) {
          const durInfo = t.duration_minutes != null ? ` after ${t.duration_minutes}m` : '';
          const exitInfo = t.exit_reason ? ` [${t.exit_reason}]` : '';
          events.push({
            timestamp: new Date(t.exited_at).toISOString(),
            type: 'DEPT_EXITED',
            description: `Exited: ${t.department}${durInfo}${exitInfo}`,
            actor: null,
            metadata: { department: t.department, durationMinutes: t.duration_minutes, exitReason: t.exit_reason },
          });
        }
      }

      // ── Sort: known timestamps first (ascending), nulls last ─────────────
      events.sort((a, b) => {
        if (!a.timestamp && !b.timestamp) return 0;
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      res.json({ orderId, eventCount: events.length, events });
    } catch (error) {
      console.error('❌ Flight Recorder error:', error);
      res.status(500).json({
        error: 'Failed to load flight recorder data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
