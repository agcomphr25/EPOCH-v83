import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { seedOrderReferenceTables } from '../../seeds/orderReferenceTables';
import { pool } from '../../db';
import { DEPARTMENTS } from '../constants/departments';
import { getQueueIntegrityStatus } from '../services/queueIntegrityService';
import { adminOverrideOrder } from '../services/orderAdminService';
import { validatePipelineState } from '../services/pipelineValidationService';
import { repairPipelineDrift, batchRepairPipelineDrift } from '../services/pipelineRepairService';
import { forecastActiveOrders, forecastOrder, simulateNewOrder } from '../services/productionForecastService';
import { simulateFactoryCompletion, invalidateSimulationCache } from '../services/productionSimulator';
import { normalizeToTuesday } from '@shared/utils/dateNormalization';
import { syncEmployeeRoles, findRoleMismatches } from '../migrations/syncEmployeeRoles';
import { recordAuditEvent } from '../services/auditLedgerService';

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
          departments: [...DEPARTMENTS],
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
    const orderId = req.params.orderId.trim().toUpperCase();

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

      // ── 1. Resolve core order (supports fb_order_number aliases) ─────────
      const orderRows = await safeQuery(
        `SELECT
          ao.order_id,
          ao.fb_order_number,
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
        WHERE ao.order_id = $1 OR ao.fb_order_number = $1
        LIMIT 1`,
        [orderId]
      );

      let order: any = orderRows[0] || null;
      // Use the real order_id from the DB row if found via fb_order_number alias
      const resolvedId = order?.order_id ?? orderId;

      const [legacyRows, productionRows, payments, kickbacks, adminAuditLog, auditEventsRows, departmentTransitions] =
        await Promise.all([
          safeQuery(
            `SELECT order_id, status, current_department, created_at
             FROM orders WHERE order_id = $1 LIMIT 1`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, order_id, production_status, current_department, department_history, created_at
             FROM production_orders WHERE order_id = $1 LIMIT 1`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, order_id, payment_amount, payment_type, payment_date
             FROM payments WHERE order_id = $1 ORDER BY payment_date DESC`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, order_id, kickback_dept, reason_code, reason_text, status, priority,
                    reported_by, kickback_date, resolved_at, resolved_by, resolution_notes
             FROM kickbacks WHERE order_id = $1 ORDER BY kickback_date DESC`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, order_id, field_name, field_label, old_value, new_value,
                    changed_by, user_role, change_type, timestamp
             FROM admin_audit_log WHERE order_id = $1
             ORDER BY timestamp DESC LIMIT 100`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, entity_type, entity_id, action, actor_name, actor_role,
                    reason, fields_changed, meta, timestamp
             FROM audit_events WHERE entity_id = $1
             ORDER BY timestamp DESC LIMIT 100`,
            [resolvedId]
          ),
          safeQuery(
            `SELECT id, entity_type, entity_id, department, entered_at, exited_at,
                    duration_minutes, exit_reason, cycle_number
             FROM order_department_transitions WHERE entity_id = $1
             ORDER BY entered_at DESC`,
            [resolvedId]
          ),
        ]);

      const legacyOrder = legacyRows[0] || null;
      const productionOrder = productionRows[0] || null;

      // ── DTI PATCH: Fallback resolution ────────────────────────────────────
      // If all_orders returned nothing, attempt production_orders then order_drafts.
      console.log(`[DTI] Lookup ${orderId}`);
      let sourceType = 'SO';

      if (!order && productionOrder) {
        // Normalize production_orders fields for display
        order = {
          order_id: productionOrder.order_id,
          fb_order_number: null,
          status: productionOrder.production_status || 'UNKNOWN',
          current_department: productionOrder.current_department || 'UNKNOWN',
          current_department_id: null,
          scrap_date: null,
          is_cancelled: false,
          is_flattop: false,
          features: null,
          model_id: null,
          order_source: 'production_orders',
          created_at: productionOrder.created_at,
          due_date: null,
          customer_id: null,
          department_history: productionOrder.department_history,
          shipped_date: null,
          is_paid: null,
          is_replacement: false,
          urgency: null,
          priority_score: null,
          scrap_reason: null,
          updated_at: null,
          customer_name: null,
          customer_email: null,
          displayId: productionOrder.order_id || String(productionOrder.id),
        };
        sourceType = 'PRODUCTION_ORDER';
      }

      if (!order) {
        // Fallback 2: order_drafts
        const draftRows = await safeQuery(
          `SELECT order_id, status, created_at FROM order_drafts WHERE order_id = $1 LIMIT 1`,
          [orderId]
        );
        if (draftRows[0]) {
          const draft = draftRows[0];
          order = {
            order_id: draft.order_id,
            fb_order_number: null,
            status: draft.status || 'DRAFT',
            current_department: null,
            current_department_id: null,
            scrap_date: null,
            is_cancelled: false,
            is_flattop: false,
            features: null,
            model_id: null,
            order_source: 'order_drafts',
            created_at: draft.created_at,
            due_date: null,
            customer_id: null,
            department_history: null,
            shipped_date: null,
            is_paid: null,
            is_replacement: false,
            urgency: null,
            priority_score: null,
            scrap_reason: null,
            updated_at: null,
            customer_name: null,
            customer_email: null,
            displayId: draft.order_id,
          };
          sourceType = 'DRAFT';
        }
      }

      console.log(`[DTI RESULT] ${sourceType}`);

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
        resolvedId,
        sourceType,
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
    const orderId = req.params.orderId.trim().toUpperCase();

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

      // ── Phase 1: Resolve order (supports fb_order_number aliases) ───────
      const orderRows = await safeQ(
        `SELECT order_id, created_at, updated_at, department_history, status, current_department
         FROM all_orders WHERE order_id = $1 OR fb_order_number = $1 LIMIT 1`,
        [orderId]
      );
      // Use the real DB order_id for all downstream queries
      const resolvedId = orderRows[0]?.order_id ?? orderId;

      // ── Phase 2: Load all event sources in parallel ───────────────────
      const [
        auditEventRows,
        adminLogRows,
        badgeScanRows,
        transitionRows,
      ] = await Promise.all([
        safeQ(
          `SELECT action, actor_name, actor_role, reason, fields_changed, meta, timestamp
           FROM audit_events WHERE entity_id = $1 ORDER BY timestamp ASC`,
          [resolvedId]
        ),
        safeQ(
          `SELECT field_name, field_label, old_value, new_value, changed_by, reason, timestamp
           FROM admin_audit_log WHERE order_id = $1 ORDER BY timestamp ASC`,
          [resolvedId]
        ),
        safeQ(
          `SELECT employee_code, action_type, action_payload, outcome, error_message, scanned_at
           FROM badge_scan_audit_log
           WHERE action_payload->>'targetBarcode' = $1
           ORDER BY scanned_at ASC`,
          [resolvedId]
        ),
        safeQ(
          `SELECT department, entered_at, exited_at, duration_minutes, exit_reason, cycle_number
           FROM order_department_transitions WHERE entity_id = $1 ORDER BY entered_at ASC`,
          [resolvedId]
        ),
      ]);

      const events: FlightEvent[] = [];

      // ── 1. ORDER CREATED ─────────────────────────────────────────────────
      const orderRow = orderRows[0];
      if (orderRow?.created_at) {
        events.push({
          timestamp: new Date(orderRow.created_at).toISOString(),
          type: 'ORDER_CREATED',
          description: `Order ${resolvedId} created`,
          actor: null,
          metadata: { status: orderRow.status },
        });
      }

      // ── 2. DEPARTMENT TIMELINE (from order_department_transitions — primary source) ──
      // JSONB department_history is NOT used here: it is absent for production_orders.
      // order_department_transitions is written for ALL order types by auditService.
      console.log(`[TRACE] Loaded ${transitionRows.length} transitions for ${resolvedId}`);

      let prevDept: string | null = null;
      for (const t of transitionRows) {
        const from = prevDept ?? '(start)';
        const to = t.department ?? '?';
        const durationStr = t.duration_minutes != null ? ` (${t.duration_minutes}m)` : '';
        events.push({
          timestamp: t.entered_at ? new Date(t.entered_at).toISOString() : null,
          type: 'DEPARTMENT_CHANGE',
          description: `Department: ${from} → ${to}${durationStr}`,
          actor: null,
          metadata: {
            fromDepartment: from,
            toDepartment: to,
            enteredAt: t.entered_at,
            exitedAt: t.exited_at ?? null,
            durationMinutes: t.duration_minutes ?? null,
            exitReason: t.exit_reason ?? null,
            cycleNumber: t.cycle_number ?? null,
            source: 'order_department_transitions',
          },
        });
        prevDept = to;
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

      // ── 4. ADMIN AUDIT LOG (field edits + order created) ─────────────────
      for (const e of adminLogRows) {
        // ORDER_CREATED rows are written at INSERT time — render as a distinct
        // event rather than a malformed FIELD_CHANGE ("null → <full order JSON>")
        if (e.field_name === 'ORDER_CREATED') {
          events.push({
            timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
            type: 'ORDER_CREATED',
            description: `Order created`,
            actor: e.changed_by ?? null,
            metadata: { reason: e.reason ?? null },
          });
          continue;
        }

        const label = e.field_label || e.field_name;
        const oldVal = e.old_value === null ? 'null' : JSON.stringify(e.old_value);
        const newVal = e.new_value === null ? 'null' : JSON.stringify(e.new_value);
        const reasonSuffix = e.reason ? ` — ${e.reason}` : '';
        events.push({
          timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
          type: 'FIELD_CHANGE',
          description: `"${label}" changed: ${oldVal} → ${newVal}${reasonSuffix}`,
          actor: e.changed_by ?? null,
          metadata: { fieldName: e.field_name, oldValue: e.old_value, newValue: e.new_value, reason: e.reason ?? null },
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

      res.json({ orderId, resolvedId, eventCount: events.length, events });
    } catch (error) {
      console.error('❌ Flight Recorder error:', error);
      res.status(500).json({
        error: 'Failed to load flight recorder data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Queue Integrity Monitor
// GET /api/admin/queue-integrity
// ─────────────────────────────────────────────────────────────────────────────

// Queue integrity status — lightweight summary for health widgets
router.get(
  '/queue-integrity/status',
  authenticateToken,
  requireRole('ADMIN'),
  (_req: Request, res: Response) => {
    res.json(getQueueIntegrityStatus());
  }
);

router.get(
  '/queue-integrity',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      // Helper: safely run a pool query and return [] on failure
      const safeQ = async (sql: string, params: any[] = []): Promise<any[]> => {
        try {
          const rows = await pool.query(sql, params) as any[];
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      };

      // Run all department comparisons + global scans in parallel
      const [deptResults, invalidRows, orphanRows] = await Promise.all([
        // ── Per-department comparisons ──────────────────────────────────────
        Promise.all(
          DEPARTMENTS.map(async (dept) => {
            const [expectedRows, actualAllOrders, actualProdOrders] = await Promise.all([
              // Expected: canonical domain rules (what SHOULD be in this queue)
              safeQ(
                `SELECT order_id FROM all_orders
                 WHERE current_department = $1
                   AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
                   AND scrap_date IS NULL
                   AND (is_cancelled IS NULL OR is_cancelled = false)`,
                [dept]
              ),
              // Actual from all_orders — mirrors getOrdersByDepartment filter
              safeQ(
                `SELECT order_id FROM all_orders
                 WHERE current_department = $1
                   AND status NOT IN ('SCRAPPED','CANCELLED')
                   AND scrap_date IS NULL`,
                [dept]
              ),
              // Actual from production_orders — also included by getOrdersByDepartment
              safeQ(
                `SELECT order_id FROM production_orders
                 WHERE current_department = $1`,
                [dept]
              ),
            ]);

            // Expected = (all_orders filtered by domain rules) ∪ (production_orders same as actual)
            // production_orders are included in both sides so they never create false mismatches
            const expectedSet = new Set<string>([
              ...expectedRows.map((r: any) => String(r.order_id)),
              ...actualProdOrders.map((r: any) => String(r.order_id)),
            ]);
            const actualSet = new Set<string>([
              ...actualAllOrders.map((r: any) => String(r.order_id)),
              ...actualProdOrders.map((r: any) => String(r.order_id)),
            ]);

            const missingOrders = [...expectedSet].filter((id) => !actualSet.has(id));
            const unexpectedOrders = [...actualSet].filter((id) => !expectedSet.has(id));

            const severity: 'CRITICAL' | 'WARNING' | 'OK' =
              missingOrders.length > 0 ? 'CRITICAL' :
              unexpectedOrders.length > 0 ? 'WARNING' : 'OK';

            return {
              department: dept,
              expectedCount: expectedSet.size,
              actualCount: actualSet.size,
              delta: actualSet.size - expectedSet.size,
              severity,
              missingOrders,
              unexpectedOrders,
              ok: severity === 'OK',
            };
          })
        ),

        // ── Invalid department scan ─────────────────────────────────────────
        safeQ(
          `SELECT order_id, current_department AS invalid_department
           FROM all_orders
           WHERE current_department IS NOT NULL
             AND current_department NOT IN (${DEPARTMENTS.map((_: string, i: number) => `$${i + 1}`).join(',')})
             AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
             AND scrap_date IS NULL
             AND (is_cancelled IS NULL OR is_cancelled = false)
           ORDER BY current_department, order_id`,
          [...DEPARTMENTS]
        ),

        // ── Orphaned orders (no department, not closed) ─────────────────────
        safeQ(
          `SELECT order_id, status, created_at
           FROM all_orders
           WHERE current_department IS NULL
             AND status NOT IN ('SCRAPPED','CANCELLED','FULFILLED')
             AND scrap_date IS NULL
             AND (is_cancelled IS NULL OR is_cancelled = false)
           ORDER BY created_at DESC`,
          []
        ),
      ]);

      const totalMismatches = deptResults.filter((d: any) => !d.ok).length;

      res.json({
        generatedAt: new Date().toISOString(),
        summary: {
          departmentsChecked: DEPARTMENTS.length,
          departmentsWithMismatches: totalMismatches,
          invalidDepartmentCount: invalidRows.length,
          orphanedOrderCount: orphanRows.length,
        },
        departments: deptResults,
        invalidDepartments: invalidRows.map((r: any) => ({
          orderId: r.order_id,
          invalidDepartment: r.invalid_department,
        })),
        orphanedOrders: orphanRows.map((r: any) => ({
          orderId: r.order_id,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    } catch (error) {
      console.error('Queue integrity check error:', error);
      res.status(500).json({
        error: 'Failed to run queue integrity check',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// GET /api/admin/explain-queue/:orderId/:department
router.get(
  '/explain-queue/:orderId/:department',
  authenticateToken,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    const { orderId, department } = req.params;
    try {
      const searchId = orderId.trim().toUpperCase();
      const rows = (await pool.query(
        `SELECT * FROM all_orders WHERE order_id = $1 OR fb_order_number = $1 LIMIT 1`,
        [searchId]
      )) as any[];

      if (!rows.length) {
        return res.status(404).json({ error: `Order ${orderId} not found in all_orders` });
      }

      const { evaluateQueueVisibility } = await import('../services/queueVisibilityService');
      const result = evaluateQueueVisibility(rows[0], department);
      res.json(result);
    } catch (error) {
      console.error('Explain queue visibility error:', error);
      res.status(500).json({
        error: 'Failed to evaluate queue visibility',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

const DEPARTMENT_THRESHOLDS: Record<string, number> = {
  'P1 Production Queue': 7,
  'Layup/Plugging': 7,
  'Barcode': 3,
  'CNC': 5,
  'Gunsmith': 5,
  'Finish': 7,
  'Finish QC': 3,
  'Paint': 5,
  'Shipping QC': 3,
  'Shipping': 2,
};

router.get(
  '/stuck-orders',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const thresholdCases = Object.entries(DEPARTMENT_THRESHOLDS)
        .map(([dept, days], i) => `WHEN current_department = $${i + 1} THEN ${days}`)
        .join(' ');
      const deptParams = Object.keys(DEPARTMENT_THRESHOLDS);

      const result = await pool.query(
        `SELECT
          o.order_id,
          o.order_id AS order_number,
          COALESCE(c.name, 'Unknown') AS customer_name,
          o.current_department AS department,
          ROUND(EXTRACT(EPOCH FROM NOW() - o.updated_at) / 86400.0, 1) AS days_in_department,
          o.due_date
        FROM all_orders o
        LEFT JOIN customers c ON c.id::text = o.customer_id
        WHERE o.status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
          AND o.current_department IS NOT NULL
          AND o.scrap_date IS NULL
          AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
          AND EXTRACT(EPOCH FROM NOW() - o.updated_at) / 86400.0 > CASE ${thresholdCases} ELSE 7 END
        ORDER BY EXTRACT(EPOCH FROM NOW() - o.updated_at) DESC
        LIMIT 50`,
        deptParams
      );

      const rows = Array.isArray(result) ? result : (result?.rows ?? []);

      res.json({
        stuckOrders: rows.map((r: any) => ({
          orderId: r.order_id,
          orderNumber: r.order_number,
          customerName: r.customer_name,
          department: r.department,
          daysInDepartment: parseFloat(r.days_in_department) || 0,
          dueDate: r.due_date,
        })),
        totalCount: rows.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Stuck orders query error:', error);
      res.status(500).json({
        error: 'Failed to fetch stuck orders',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

let throughputCache: { data: any; cachedAt: number } | null = null;
const THROUGHPUT_CACHE_TTL = 60_000;

router.get(
  '/throughput-analytics',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      if (throughputCache && Date.now() - throughputCache.cachedAt < THROUGHPUT_CACHE_TTL) {
        return res.json(throughputCache.data);
      }

      const cycleTimeResult = await pool.query(
        `SELECT department, ROUND(AVG(days)::numeric, 1) AS avg_days FROM (
          SELECT 'Layup/Plugging' AS department,
            EXTRACT(EPOCH FROM (cnc_completed_at - COALESCE(layup_completed_at, plugging_completed_at))) / 86400.0 AS days
          FROM all_orders
          WHERE COALESCE(layup_completed_at, plugging_completed_at) IS NOT NULL AND cnc_completed_at IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND cnc_completed_at > COALESCE(layup_completed_at, plugging_completed_at)

          UNION ALL SELECT 'CNC',
            EXTRACT(EPOCH FROM (COALESCE(gunsmith_completed_at, finish_completed_at) - cnc_completed_at)) / 86400.0
          FROM all_orders
          WHERE cnc_completed_at IS NOT NULL AND COALESCE(gunsmith_completed_at, finish_completed_at) IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND COALESCE(gunsmith_completed_at, finish_completed_at) > cnc_completed_at

          UNION ALL SELECT 'Gunsmith',
            EXTRACT(EPOCH FROM (finish_completed_at - gunsmith_completed_at)) / 86400.0
          FROM all_orders
          WHERE gunsmith_completed_at IS NOT NULL AND finish_completed_at IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND finish_completed_at > gunsmith_completed_at

          UNION ALL SELECT 'Finish',
            EXTRACT(EPOCH FROM (qc_completed_at - finish_completed_at)) / 86400.0
          FROM all_orders
          WHERE finish_completed_at IS NOT NULL AND qc_completed_at IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND qc_completed_at > finish_completed_at

          UNION ALL SELECT 'Finish QC',
            EXTRACT(EPOCH FROM (paint_completed_at - qc_completed_at)) / 86400.0
          FROM all_orders
          WHERE qc_completed_at IS NOT NULL AND paint_completed_at IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND paint_completed_at > qc_completed_at

          UNION ALL SELECT 'Paint',
            EXTRACT(EPOCH FROM (shipping_completed_at - paint_completed_at)) / 86400.0
          FROM all_orders
          WHERE paint_completed_at IS NOT NULL AND shipping_completed_at IS NOT NULL
            AND status NOT IN ('CANCELLED', 'SCRAPPED')
            AND shipping_completed_at > paint_completed_at
        ) AS stage_durations GROUP BY department`
      );

      const cycleRows = Array.isArray(cycleTimeResult) ? cycleTimeResult : (cycleTimeResult?.rows ?? []);

      const completionResult = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE shipping_completed_at >= NOW() - INTERVAL '1 day')::int AS today,
          COUNT(*) FILTER (WHERE shipping_completed_at >= NOW() - INTERVAL '7 days')::int AS week,
          COUNT(*) FILTER (WHERE shipping_completed_at >= NOW() - INTERVAL '30 days')::int AS month
        FROM all_orders
        WHERE shipping_completed_at IS NOT NULL
          AND status NOT IN ('CANCELLED', 'SCRAPPED')`
      );

      const completionRows = Array.isArray(completionResult) ? completionResult : (completionResult?.rows ?? []);
      const counts = completionRows[0] || { today: 0, week: 0, month: 0 };

      const responseData = {
        departmentCycleTimes: cycleRows
          .filter((r: any) => r.avg_days !== null)
          .map((r: any) => ({
            department: r.department,
            avgDays: parseFloat(r.avg_days) || 0,
          })),
        ordersCompletedToday: parseInt(counts.today) || 0,
        ordersCompletedThisWeek: parseInt(counts.week) || 0,
        ordersCompletedThisMonth: parseInt(counts.month) || 0,
        generatedAt: new Date().toISOString(),
      };

      throughputCache = { data: responseData, cachedAt: Date.now() };
      res.json(responseData);
    } catch (error) {
      console.error('Throughput analytics error:', error);
      res.status(500).json({
        error: 'Failed to fetch throughput analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/production-heatmap',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const deptRows = await pool.query(
        `SELECT
          current_department AS department,
          COUNT(*)::int AS order_count,
          ROUND(AVG(EXTRACT(EPOCH FROM now() - updated_at) / 86400.0)::numeric, 1) AS avg_days_in_stage
        FROM all_orders
        WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
          AND current_department IS NOT NULL
          AND scrap_date IS NULL
          AND (is_cancelled IS NULL OR is_cancelled = false)
        GROUP BY current_department
        ORDER BY order_count DESC`
      );
      const departments = Array.isArray(deptRows) ? deptRows : (deptRows?.rows ?? []);

      const totalActive = departments.reduce((sum: number, d: any) => sum + (d.order_count || 0), 0);

      let pipelineErrors = 0;
      let queueErrors = 0;
      try {
        const pipelineStatus = await validatePipelineState();
        pipelineErrors = pipelineStatus.errors.length;
      } catch (_) {}

      try {
        const queueStatus = getQueueIntegrityStatus();
        queueErrors = queueStatus.criticalCount + queueStatus.warningCount;
      } catch (_) {}

      const stalledThresholdDays = 14;
      const stalledResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM all_orders
         WHERE status NOT IN ('FULFILLED', 'CANCELLED', 'SCRAPPED')
           AND current_department IS NOT NULL
           AND scrap_date IS NULL
           AND (is_cancelled IS NULL OR is_cancelled = false)
           AND updated_at < NOW() - INTERVAL '${stalledThresholdDays} days'`
      );
      const stalledRows = Array.isArray(stalledResult) ? stalledResult : (stalledResult?.rows ?? []);
      const stalledCount = stalledRows[0]?.count || 0;

      res.json({
        totalActive,
        pipelineErrors,
        queueErrors,
        stalledOrders: stalledCount,
        departments: departments.map((d: any) => ({
          department: d.department,
          orderCount: d.order_count,
          avgDaysInStage: parseFloat(d.avg_days_in_stage) || 0,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Production heatmap error:', error);
      res.status(500).json({
        error: 'Failed to generate production heatmap',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/pipeline-validation',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const report = await validatePipelineState();
      res.json(report);
    } catch (error) {
      console.error('Pipeline validation error:', error);
      res.status(500).json({
        error: 'Failed to run pipeline validation',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/pipeline-validation/status',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const report = await validatePipelineState();
      res.json({
        healthy: report.errors.length === 0,
        totalOrdersChecked: report.totalOrdersChecked,
        errorCount: report.errors.length,
        summary: report.summary,
        generatedAt: report.generatedAt,
      });
    } catch (error) {
      console.error('Pipeline validation status error:', error);
      res.status(500).json({
        error: 'Failed to get pipeline validation status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.post(
  '/pipeline-repair/batch',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const result = await batchRepairPipelineDrift();
      res.json(result);
    } catch (error) {
      console.error('Batch pipeline repair error:', error);
      res.status(500).json({
        error: 'Failed to run batch pipeline repair',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.post(
  '/pipeline-repair/:orderId',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const result = await repairPipelineDrift(orderId);
      if (result) {
        res.json({ success: true, result });
      } else {
        res.json({ success: true, message: 'No repair needed — order is already in the correct stage.' });
      }
    } catch (error) {
      console.error('Pipeline repair error:', error);
      res.status(500).json({
        error: 'Failed to repair pipeline drift',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/order-forecast',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const result = await forecastActiveOrders();
      res.json(result);
    } catch (error) {
      console.error('Order forecast error:', error);
      res.status(500).json({
        error: 'Failed to generate order forecasts',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/order-forecast/:orderId',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const result = await forecastOrder(orderId);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'Order not found or has no remaining stages' });
      }
    } catch (error) {
      console.error('Order forecast error:', error);
      res.status(500).json({
        error: 'Failed to forecast order',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.post(
  '/order-forecast/simulate',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const model_id = typeof body.model_id === 'string' ? body.model_id : null;
      const is_flattop = body.is_flattop === true;
      const features = typeof body.features === 'object' && body.features !== null ? body.features : {};
      const result = await simulateNewOrder({ model_id, is_flattop, features });

      try {
        const userId = (req as any).user?.id || null;
        await pool.query(
          `INSERT INTO forecast_simulation_logs
            (model_id, is_flattop, estimated_cycle_days, suggested_due_date, csr_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            model_id || null,
            is_flattop || false,
            result.estimatedCycleDays,
            result.suggestedDueDate,
            userId,
          ]
        );
      } catch (logErr) {
        console.error('[ForecastSimulate] Failed to log simulation:', logErr);
      }

      res.json(result);
    } catch (error) {
      console.error('Forecast simulation error:', error);
      res.status(500).json({
        error: 'Failed to simulate forecast',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/department-capacity',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT department, stations, avg_parallel_efficiency, last_updated
         FROM department_capacity
         ORDER BY department`
      );
      const rows = Array.isArray(result) ? result : (result?.rows ?? []);
      res.json(rows);
    } catch (error) {
      console.error('Department capacity fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch department capacity' });
    }
  }
);

router.put(
  '/department-capacity/:department',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { department } = req.params;
      const { stations, avg_parallel_efficiency } = req.body;
      const stationsNum = parseInt(stations, 10);
      if (isNaN(stationsNum) || stationsNum < 1 || stationsNum > 50) {
        return res.status(400).json({ error: 'stations must be an integer between 1 and 50' });
      }
      const effNum = avg_parallel_efficiency != null ? parseFloat(avg_parallel_efficiency) : 0.85;
      if (isNaN(effNum) || effNum <= 0 || effNum > 1.5) {
        return res.status(400).json({ error: 'avg_parallel_efficiency must be between 0.01 and 1.5' });
      }
      const efficiency = effNum;
      await pool.query(
        `INSERT INTO department_capacity (department, stations, avg_parallel_efficiency, last_updated)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (department) DO UPDATE SET
           stations = $2, avg_parallel_efficiency = $3, last_updated = NOW()`,
        [department, stationsNum, efficiency]
      );
      invalidateSimulationCache();
      res.json({ success: true, department, stations, avg_parallel_efficiency: efficiency });
    } catch (error) {
      console.error('Department capacity update error:', error);
      res.status(500).json({ error: 'Failed to update department capacity' });
    }
  }
);

router.get(
  '/order-forecast/:orderId/timeline',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const result = await simulateFactoryCompletion(orderId);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'Order not found in simulation' });
      }
    } catch (error) {
      console.error('Order timeline simulation error:', error);
      res.status(500).json({ error: 'Failed to simulate order timeline' });
    }
  }
);

router.get(
  '/forecast-accuracy',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const { getForecastAccuracy } = await import('../services/forecastAccuracyService');
      const metrics = await getForecastAccuracy();
      res.json(metrics);
    } catch (error) {
      console.error('Forecast accuracy error:', error);
      res.status(500).json({ error: 'Failed to get forecast accuracy' });
    }
  }
);

router.post(
  '/forecast-accuracy/stamp',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const { stampForecastOnOrders } = await import('../services/forecastAccuracyService');
      const count = await stampForecastOnOrders();
      res.json({ stamped: count });
    } catch (error) {
      console.error('Forecast stamp error:', error);
      res.status(500).json({ error: 'Failed to stamp forecasts' });
    }
  }
);

router.post(
  '/cycle-time-learning/rebuild',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const { rebuildModelDepartmentStats } = await import('../services/cycleTimeLearning');
      const report = await rebuildModelDepartmentStats();
      res.json(report);
    } catch (error) {
      console.error('Cycle time rebuild error:', error);
      res.status(500).json({ error: 'Failed to rebuild cycle time stats' });
    }
  }
);

router.get(
  '/cycle-time-learning/stats',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const { getStatsOverview } = await import('../services/cycleTimeLearning');
      const overview = await getStatsOverview();
      res.json(overview);
    } catch (error) {
      console.error('Cycle time stats error:', error);
      res.status(500).json({ error: 'Failed to get cycle time stats' });
    }
  }
);

router.get(
  '/cycle-time-learning/drift-log',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const { getDriftLog } = await import('../services/cycleTimeLearning');
      const log = await getDriftLog(Math.min(limit, 200));
      res.json(log);
    } catch (error) {
      console.error('Drift log error:', error);
      res.status(500).json({ error: 'Failed to get drift log' });
    }
  }
);

router.get(
  '/cycle-time-learning/model-stats',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const { getModelCycleTimes } = await import('../services/cycleTimeLearning');
      const data = await getModelCycleTimes();
      res.json(data);
    } catch (error) {
      console.error('Model cycle times error:', error);
      res.status(500).json({ error: 'Failed to get model cycle times' });
    }
  }
);

// Order → Item Code Lookup
router.get('/order-lookup', authenticateToken, requirePermission('admin.order_lookup'), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.query as { orderId?: string };
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    // First, find all production orders whose order_id contains the input (case-insensitive)
    const candidateRows = await pool.query(
      `SELECT po.id, po.order_id, po.po_number, po.current_department, po.production_status
       FROM production_orders po
       WHERE po.order_id ILIKE $1
       ORDER BY po.order_id
       LIMIT 50`,
      [`%${orderId}%`]
    );

    // No matches at all
    if (candidateRows.length === 0) return res.json({ order: null, matches: [], candidates: [] });

    // Multiple matches — return candidates list for selection
    if (candidateRows.length > 1) {
      return res.json({
        order: null,
        matches: [],
        candidates: candidateRows.map((r: any) => ({
          order_id: r.order_id,
          po_number: r.po_number,
          current_department: r.current_department,
          production_status: r.production_status,
        })),
      });
    }

    // Exactly one match — proceed with full detail lookup using the resolved order_id
    const resolvedOrderId = candidateRows[0].order_id;

    // Get the production order and its specs, plus the item code resolved from the
    // linked PO line. Prefer purchase_order_items.item_name because this card is
    // labeled "via PO link"; production_orders.item_code can be stale on repaired rows.
    const orderRows = await pool.query(
      `SELECT po.id, po.order_id, po.po_number, po.current_department, po.production_status,
              po.specifications, po.item_code, po.item_id, po.item_name, po.po_item_id,
              poi.item_id  AS poi_item_id,
              poi.item_name AS poi_item_name,
              UPPER(TRIM(COALESCE(
                NULLIF(TRIM(poi.item_name), ''),
                NULLIF(TRIM(po.item_code), ''),
                NULLIF(TRIM(po.item_name), ''),
                NULLIF(TRIM(poi.item_id), ''),
                NULLIF(TRIM(po.item_id), '')
              ))) AS resolved_item_code
       FROM production_orders po
       LEFT JOIN purchase_order_items poi ON po.po_item_id = poi.id
       WHERE po.order_id = $1 LIMIT 1`,
      [resolvedOrderId]
    );
    if (orderRows.length === 0) return res.json({ order: null, matches: [], candidates: [] });
    const order = orderRows[0];
    const specs = order.specifications || {};

    // Match po_products by specs, scoring each field match
    const productRows = await pool.query(
      `SELECT id, product_name, customer_name, material, handedness, stock_model,
              action_length, action_inlet, bottom_metal, barrel_inlet, qds,
              swivel_studs, paint_options, texture, flat_top, price, customer_product_number
       FROM po_products ORDER BY id`
    );

    // Determine which spec fields the order actually has values for
    const SCORED_FIELDS: Record<string, string> = {
      stock_model:   specs.stockModel,
      material:      specs.material,
      handedness:    specs.handedness,
      action_inlet:  specs.actionInlet,
      barrel_inlet:  specs.barrelInlet,
      bottom_metal:  specs.bottomMetal,
      paint_options: specs.paintOptions,
      texture:       specs.texture,
      action_length: specs.actionLength,
      qds:           specs.qds,
    };
    // Number of fields the order actually has (the max possible score)
    const maxPossible = Object.values(SCORED_FIELDS).filter(Boolean).length;

    const scored = productRows
      .map((p: any) => {
        const matched: string[] = [];
        const mismatched: string[] = [];
        for (const [field, specVal] of Object.entries(SCORED_FIELDS)) {
          const prodVal = p[field];
          if (prodVal && specVal) {
            (prodVal === specVal ? matched : mismatched).push(field);
          }
        }
        return { ...p, matchedFields: matched, mismatchedFields: mismatched, score: matched.length };
      })
      .filter((p: any) => p.score > 0)
      .sort((a: any, b: any) => b.score - a.score);

    // Only return the top-scoring tier — if there's a 10/10, show only 10/10s
    const topScore = scored.length > 0 ? scored[0].score : 0;
    const matches = scored.filter((p: any) => p.score === topScore);

    res.json({ order, specs, matches, topScore, maxPossible, totalScored: scored.length });
  } catch (error: any) {
    console.error('Order lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Item Code → Orders reverse lookup ────────────────────────────────────

router.get('/item-code-lookup', async (req: Request, res: Response) => {
  try {
    const { itemCode } = req.query as { itemCode?: string };
    if (!itemCode || !itemCode.trim()) return res.status(400).json({ error: 'itemCode is required' });

    const rows = await pool.query(
      `SELECT DISTINCT po.order_id,
              po.po_number,
              po.current_department,
              po.production_status,
              UPPER(TRIM(COALESCE(
                NULLIF(TRIM(poi.item_name), ''),
                NULLIF(TRIM(po.item_code), ''),
                NULLIF(TRIM(po.item_name), ''),
                NULLIF(TRIM(poi.item_id), ''),
                NULLIF(TRIM(po.item_id), '')
              ))) AS resolved_item_code
       FROM production_orders po
       LEFT JOIN purchase_order_items poi ON po.po_item_id = poi.id
       WHERE UPPER(TRIM(COALESCE(
         NULLIF(TRIM(poi.item_name), ''),
         NULLIF(TRIM(po.item_code), ''),
         NULLIF(TRIM(po.item_name), ''),
         NULLIF(TRIM(poi.item_id), ''),
         NULLIF(TRIM(po.item_id), '')
       ))) ILIKE $1
       ORDER BY po.order_id
       LIMIT 200`,
      [`%${itemCode.trim()}%`]
    );

    res.json({ orders: rows });
  } catch (error: any) {
    console.error('Item code lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Order Override — glennj only ─────────────────────────────────────────

const OVERRIDE_ONLY_USER = 'glennj';

// Columns that must NEVER be touched via override (system-managed / calculated)
const PERMANENTLY_BLOCKED_COLUMNS = new Set([
  'id',
  'department_history',
  'signature_data',
  'forecast_completion_date',
  'forecast_confidence',
  'forecast_days_remaining',
  'forecast_stage',
  'forecast_updated_at',
  'calculated_total',
  'source_po_id',
]);

// GET /api/admin/order-statuses
// Returns active statuses from order_statuses lookup table
router.get(
  '/order-statuses',
  authenticateToken,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const rows = await pool.query(
        `SELECT id, name, display_name FROM order_statuses WHERE is_active = true ORDER BY sort_order ASC, name ASC`
      ) as any[];
      res.json({ statuses: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/admin/order-departments
// Returns the canonical list of production department names
router.get(
  '/order-departments',
  authenticateToken,
  requireRole('ADMIN'),
  (_req: Request, res: Response) => {
    res.json({ departments: DEPARTMENTS });
  }
);

// GET /api/admin/order-override/columns
// Returns the full column list from all_orders with tier classification
router.get(
  '/order-override/columns',
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user || user.username !== OVERRIDE_ONLY_USER) {
      return res.status(403).json({ error: 'Access restricted to glennj' });
    }

    try {
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = 'all_orders'
         ORDER BY ordinal_position`,
        []
      ) as any[];

      const SAFE_COLUMNS = new Set([
        'notes', 'internal_notes', 'customer_notes', 'special_instructions',
        'tracking_number', 'carrier', 'customer_po',
        'urgency', 'is_rush', 'is_replacement', 'is_paid',
        'payment_notes', 'payment_type', 'payment_date', 'payment_amount',
        'scrap_reason', 'kickback_reason',
        'fb_order_number', 'dealer_name', 'dealer_po',
        'customer_id', 'customer_name', 'customer_email', 'customer_phone',
      ]);

      const RESTRICTED_COLUMNS = new Set([
        'status', 'status_id',
        'current_department', 'current_department_id',
        'due_date', 'order_date', 'shipped_date', 'week_due_date',
        'priority_score', 'priority_flags',
        'production_status', 'production_notes',
      ]);

      const columns = cols
        .filter((c: any) => !PERMANENTLY_BLOCKED_COLUMNS.has(c.column_name))
        .map((c: any) => {
          let tier: 'safe' | 'restricted' | 'advanced';
          if (SAFE_COLUMNS.has(c.column_name)) tier = 'safe';
          else if (RESTRICTED_COLUMNS.has(c.column_name)) tier = 'restricted';
          else tier = 'advanced';

          return {
            column_name: c.column_name,
            data_type: c.data_type,
            is_nullable: c.is_nullable === 'YES',
            tier,
          };
        });

      res.json({ columns });
    } catch (err: any) {
      console.error('[OrderOverride] Column fetch error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/admin/order-override/order/:orderId
// Fetch a single order row for preview
router.get(
  '/order-override/order/:orderId',
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user || user.username !== OVERRIDE_ONLY_USER) {
      return res.status(403).json({ error: 'Access restricted to glennj' });
    }

    const orderId = req.params.orderId.trim();
    try {
      const rows = await pool.query(
        `SELECT * FROM all_orders WHERE order_id = $1 OR fb_order_number = $1 LIMIT 1`,
        [orderId]
      ) as any[];

      if (!rows.length) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json({ order: rows[0] });
    } catch (err: any) {
      console.error('[OrderOverride] Order fetch error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/admin/order-override
// Apply a single field change to all_orders with full audit trail
router.post(
  '/order-override',
  authenticateToken,
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user || user.username !== OVERRIDE_ONLY_USER) {
      return res.status(403).json({ error: 'Access restricted to glennj' });
    }

    const { orderId, columnName, newValue, reason } = req.body;

    if (!orderId || !columnName || reason === undefined || reason === '') {
      return res.status(400).json({ error: 'orderId, columnName, and reason are required' });
    }

    if (PERMANENTLY_BLOCKED_COLUMNS.has(columnName)) {
      return res.status(400).json({ error: `Column "${columnName}" cannot be modified via override` });
    }

    // Validate column actually exists on all_orders to prevent SQL injection
    const validCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'all_orders' AND column_name = $1`,
      [columnName]
    ) as any[];

    if (!validCols.length) {
      return res.status(400).json({ error: `Column "${columnName}" does not exist on all_orders` });
    }

    try {
      // Fetch the current value for audit
      const currentRows = await pool.query(
        `SELECT ${columnName}, order_id FROM all_orders WHERE order_id = $1 OR fb_order_number = $1 LIMIT 1`,
        [orderId]
      ) as any[];

      if (!currentRows.length) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const resolvedOrderId = currentRows[0].order_id;
      const oldValue = currentRows[0][columnName];

      // Normalize due_date to Tuesday before persisting
      const effectiveValue = (columnName === 'due_date' && newValue && newValue !== '')
        ? normalizeToTuesday(newValue)
        : (newValue === '' ? null : newValue);

      // Apply the update — use parameterized column name via safe whitelist check above
      await pool.query(
        `UPDATE all_orders SET "${columnName}" = $1, updated_at = NOW() WHERE order_id = $2`,
        [effectiveValue, resolvedOrderId]
      );

      // Write to admin_audit_log (picked up by flight recorder as FIELD_CHANGE)
      await pool.query(
        `INSERT INTO admin_audit_log
           (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ADMIN_OVERRIDE', $8, $9, $10, NOW())`,
        [
          resolvedOrderId,
          columnName,
          columnName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          JSON.stringify(oldValue),
          JSON.stringify(effectiveValue),
          user.username,
          user.role ?? 'OWNER',
          reason,
          req.ip ?? null,
          req.headers['user-agent'] ?? null,
        ]
      );

      await recordAuditEvent({
        eventType: 'ADMIN_FIELD_OVERRIDE',
        subjectType: 'order',
        subjectId: resolvedOrderId,
        sourceService: 'admin.orderOverride',
        actor: {
          id: typeof user.id === 'number' ? user.id : null,
          username: user.username,
          role: user.role ?? 'OWNER',
        },
        reason,
        fieldsChanged: {
          [columnName]: { before: oldValue, after: effectiveValue },
        },
        payload: {
          column: columnName,
          oldValue,
          newValue: effectiveValue,
        } as any,
        meta: {
          column: columnName,
          oldValue,
          newValue: effectiveValue,
        } as any,
        entityType: 'order',
        entityId: resolvedOrderId,
      });

      res.json({
        success: true,
        orderId: resolvedOrderId,
        column: columnName,
        oldValue,
        newValue: effectiveValue,
      });
    } catch (err: any) {
      console.error('[OrderOverride] Update error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/admin/orders/override
// Multi-field admin override via adminOverrideOrder service (any ADMIN role, not glennj-only).
// Distinct from POST /order-override which is a single-field glennj-only UI path with audit_events write.
router.post(
  '/orders/override',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { orderId, changes, reason } = req.body;

      if (!orderId || !changes) {
        return res.status(400).json({ error: 'Missing orderId or changes' });
      }

      if (!reason) {
        return res.status(400).json({ error: 'reason is required' });
      }

      const result = await adminOverrideOrder({
        db: pool,
        orderId,
        changes,
        user: (req as any).user,
        reason,
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      });

      res.json({ success: true, updated: result });
    } catch (err: any) {
      console.error('[AdminOverride] Error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/admin/backfill-item-names
// One-time backfill: resolve AG part numbers to human-readable display names
// in the production_orders table for all existing rows that store raw part numbers.
router.post(
  '/backfill-item-names',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { resolveItemDisplayName } = await import('../utils/resolveItemDisplayName');

      const findQuery = `
        SELECT id, item_name
        FROM production_orders
        WHERE item_name ILIKE 'AG-%'
      `;
      const rows = await pool.query(findQuery) as any[];
      const candidates = Array.isArray(rows) ? rows : (rows as any).rows || [];

      console.log(`[backfill-item-names] Found ${candidates.length} production_orders rows with AG- part numbers`);

      let updatedCount = 0;
      const skipped: string[] = [];

      for (const row of candidates) {
        const resolved = resolveItemDisplayName(row.item_name);
        if (resolved === row.item_name) {
          skipped.push(row.item_name);
          continue;
        }
        await pool.query(
          `UPDATE production_orders SET item_name = $1, updated_at = NOW() WHERE id = $2`,
          [resolved, row.id]
        );
        updatedCount++;
      }

      console.log(`[backfill-item-names] Updated ${updatedCount} rows, skipped ${skipped.length} unrecognised part numbers`);

      res.json({
        success: true,
        candidatesFound: candidates.length,
        updatedCount,
        skippedCount: skipped.length,
        skippedSamples: [...new Set(skipped)].slice(0, 20),
        message: `Updated ${updatedCount} of ${candidates.length} production_orders rows to display names`,
      });
    } catch (err: any) {
      console.error('[backfill-item-names] Error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);


// ---------------------------------------------------------------------------
// Role-sync endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/sync-employee-roles
 * Preview: returns all linked employee↔user pairs where the roles currently differ.
 * Does NOT write anything.
 */
router.get(
  '/sync-employee-roles',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const mismatches = await findRoleMismatches();
      res.json({
        success: true,
        mismatchCount: mismatches.length,
        mismatches,
        message:
          mismatches.length === 0
            ? 'All linked user accounts already have the correct role — no action needed.'
            : `${mismatches.length} mismatch(es) found. POST to this endpoint to apply the fix.`,
      });
    } catch (err: any) {
      console.error('[sync-employee-roles] Error during preview:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * POST /api/admin/sync-employee-roles
 * Apply: updates users.role to match employees.user_role for every mismatched pair.
 * Idempotent — safe to call multiple times.
 *
 * Optional body: { dryRun: true } to log but not write.
 */
router.post(
  '/sync-employee-roles',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const dryRun = req.body?.dryRun === true;
      const result = await syncEmployeeRoles(dryRun);
      res.json({
        success: true,
        dryRun: result.dryRun,
        mismatchCount: result.mismatches.length,
        fixed: result.fixed,
        mismatches: result.mismatches,
        message: result.dryRun
          ? `Dry run complete — ${result.mismatches.length} mismatch(es) found, nothing written.`
          : `Sync complete — ${result.fixed} of ${result.mismatches.length} user account(s) updated.`,
      });
    } catch (err: any) {
      console.error('[sync-employee-roles] Error during apply:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Kiosk User-Link Audit ───────────────────────────────────────────────────
// GET /api/admin/kiosk/user-link-audit
// Returns every active employee with their user-account link status so an admin
// can spot and fix any employees that are invisible on the kiosk.
// Status values: 'linked' | 'unlinked' | 'inactive_user' | 'multiple_matches'
// Returns exactly one row per active employee; aggregates linked users.
router.get(
  '/kiosk/user-link-audit',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      // Aggregate all users linked to each employee so we can detect
      // multiple-match situations (more than one active user for an employee).
      const rows = await pool.query(`
        SELECT
          e.id                                    AS "employeeId",
          e.name                                  AS "employeeName",
          e.job_title                             AS "jobTitle",
          COUNT(u.id) FILTER (WHERE u.is_active = true)    AS "activeUserCount",
          COUNT(u.id) FILTER (WHERE u.is_active = false)   AS "inactiveUserCount",
          -- Aggregate usernames for display / remediation
          json_agg(
            json_build_object('userId', u.id, 'username', u.username, 'isActive', u.is_active)
          ) FILTER (WHERE u.id IS NOT NULL)       AS "linkedUsers"
        FROM employees e
        LEFT JOIN users u ON u.employee_id = e.id
        WHERE e.is_active = true
        GROUP BY e.id, e.name, e.job_title
        ORDER BY e.name
      `);

      const result = rows.map((row: any) => {
        const activeCount   = parseInt(row.activeUserCount ?? '0', 10);
        const inactiveCount = parseInt(row.inactiveUserCount ?? '0', 10);
        const linkedUsers: { userId: number; username: string; isActive: boolean }[] =
          row.linkedUsers ?? [];

        let status: 'linked' | 'unlinked' | 'inactive_user' | 'multiple_matches';
        if (activeCount > 1) {
          status = 'multiple_matches';
        } else if (activeCount === 1) {
          status = 'linked';
        } else if (inactiveCount > 0) {
          status = 'inactive_user';
        } else {
          status = 'unlinked';
        }

        const activeUser = linkedUsers.find(u => u.isActive) ?? null;

        return {
          employeeId:   row.employeeId,
          employeeName: row.employeeName,
          jobTitle:     row.jobTitle,
          status,
          userId:       activeUser?.userId ?? null,
          username:     activeUser?.username ?? null,
          // Included for multiple_matches remediation
          allLinkedUsers: status === 'multiple_matches' ? linkedUsers : undefined,
        };
      });

      const summary = {
        total:           result.length,
        linked:          result.filter((r: any) => r.status === 'linked').length,
        unlinked:        result.filter((r: any) => r.status === 'unlinked').length,
        inactiveUser:    result.filter((r: any) => r.status === 'inactive_user').length,
        multipleMatches: result.filter((r: any) => r.status === 'multiple_matches').length,
      };

      res.json({ summary, employees: result });
    } catch (err: any) {
      console.error('[kiosk/user-link-audit] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── Identity Diagnostic ──────────────────────────────────────────────────────

type DiagnosticStatus = 'HEALTHY' | 'ORPHANED_USER' | 'DEAD_LINK' | 'DUPLICATE_LINK' | 'ROLE_MISMATCH' | 'EMAIL_MISMATCH';

interface DiagnosticQueryRow {
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  userRole: string;
  userEmail: string | null;
  employeeId: number | null;
  isActive: boolean;
  employeeName: string | null;
  employeeCode: string | null;
  employeeUserRole: string | null;
  employeeIsActive: boolean | null;
  employeeDepartment: string | null;
  employeeEmail: string | null;
}

router.get(
  '/identity-diagnostic',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      // Find which employeeIds have multiple user accounts linked (duplicate links)
      const dupRows: Array<{ employee_id: number }> = await pool.query(
        `SELECT employee_id
           FROM users
          WHERE employee_id IS NOT NULL
          GROUP BY employee_id
         HAVING COUNT(*) > 1`,
        []
      );
      const duplicateEmployeeIds = new Set<number>(dupRows.map((r) => r.employee_id));

      // Main query: all users with their linked employee
      const rows: DiagnosticQueryRow[] = await pool.query(
        `SELECT
           u.id              AS "userId",
           u.username,
           u.first_name      AS "firstName",
           u.last_name       AS "lastName",
           u.role            AS "userRole",
           u.email           AS "userEmail",
           u.employee_id     AS "employeeId",
           u.is_active       AS "isActive",
           e.name            AS "employeeName",
           e.employee_code   AS "employeeCode",
           e.user_role       AS "employeeUserRole",
           e.is_active       AS "employeeIsActive",
           e.department      AS "employeeDepartment",
           e.email           AS "employeeEmail"
         FROM users u
         LEFT JOIN employees e ON e.id = u.employee_id
         ORDER BY u.username ASC`,
        []
      );

      type EnrichedRow = DiagnosticQueryRow & { status: DiagnosticStatus };

      const enriched: EnrichedRow[] = rows.map((row) => {
        let status: DiagnosticStatus = 'HEALTHY';

        if (!row.employeeId) {
          status = 'ORPHANED_USER';
        } else if (!row.employeeIsActive || row.employeeName == null) {
          status = 'DEAD_LINK';
        } else if (duplicateEmployeeIds.has(row.employeeId)) {
          status = 'DUPLICATE_LINK';
        } else if (row.userRole && row.employeeUserRole && row.userRole !== row.employeeUserRole) {
          status = 'ROLE_MISMATCH';
        } else if (
          row.userEmail && row.employeeEmail &&
          row.userEmail.toLowerCase() !== row.employeeEmail.toLowerCase()
        ) {
          status = 'EMAIL_MISMATCH';
        }

        return { ...row, status };
      });

      const summary = {
        total: enriched.length,
        healthy: enriched.filter((r) => r.status === 'HEALTHY').length,
        warnings: enriched.filter((r) => ['ROLE_MISMATCH', 'EMAIL_MISMATCH'].includes(r.status)).length,
        critical: enriched.filter((r) => ['ORPHANED_USER', 'DEAD_LINK', 'DUPLICATE_LINK'].includes(r.status)).length,
      };

      res.json({ summary, rows: enriched });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[identity-diagnostic] Error:', err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// GET available employees for reassignment (not linked to any active user)
router.get(
  '/identity-diagnostic/employees',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      const rows: Array<{ id: number; name: string; employeeCode: string | null }> = await pool.query(
        `SELECT e.id, e.name, e.employee_code AS "employeeCode"
           FROM employees e
          WHERE e.is_active = true
            AND NOT EXISTS (
              SELECT 1 FROM users u
               WHERE u.employee_id = e.id AND u.is_active = true
            )
          ORDER BY e.name ASC`,
        []
      );
      res.json(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[identity-diagnostic/employees] Error:', err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// PATCH /api/admin/users/:userId/employee-link — reassign or unlink an employee from a user
router.patch(
  '/users/:userId/employee-link',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    // Require explicit `employeeId` key — undefined (missing key) is rejected
    if (!Object.prototype.hasOwnProperty.call(req.body, 'employeeId')) {
      return res.status(400).json({ error: 'Request body must include an employeeId field (use null to unlink)' });
    }

    const { employeeId } = req.body as { employeeId: number | null };

    // employeeId must be a positive integer or explicit null to unlink
    if (employeeId !== null && (typeof employeeId !== 'number' || !Number.isInteger(employeeId) || employeeId < 1)) {
      return res.status(400).json({ error: 'employeeId must be a positive integer or null' });
    }

    try {
      if (employeeId != null) {
        // Validate the target employee exists
        const empRows: Array<{ id: number }> = await pool.query(
          `SELECT id FROM employees WHERE id = $1`,
          [employeeId]
        );
        if (empRows.length === 0) {
          return res.status(404).json({ error: 'Employee not found' });
        }

        // Check the employee is not already linked to a different active user
        const conflictRows: Array<{ id: number }> = await pool.query(
          `SELECT id FROM users WHERE employee_id = $1 AND id <> $2 AND is_active = true`,
          [employeeId, userId]
        );
        if (conflictRows.length > 0) {
          return res.status(409).json({ error: 'This employee is already linked to another user account' });
        }
      }

      const updateResult: Array<{ id: number }> = await pool.query(
        `UPDATE users SET employee_id = $1 WHERE id = $2 RETURNING id`,
        [employeeId ?? null, userId]
      );

      if (updateResult.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, userId, employeeId: employeeId ?? null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[users/:userId/employee-link] Error:', err);
      res.status(500).json({ success: false, error: msg });
    }
  }
);

// ─── Identity Matrix: Employee / User Roster ──────────────────────────────────

router.get(
  '/identity-matrix/roster',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      const rows = await pool.query(
        `SELECT
           e.id              AS "employeeId",
           e.employee_code   AS "employeeCode",
           e.name,
           e.department,
           e.user_role       AS "userRole",
           CASE WHEN e.badge_scan_code IS NOT NULL THEN true ELSE false END AS "hasBadge",
           CASE WHEN e.timekeeper_pin   IS NOT NULL THEN true ELSE false END AS "hasPin",
           CASE WHEN e.portal_token     IS NOT NULL THEN true ELSE false END AS "hasPortalToken",
           e.canonical_id    AS "canonicalId",
           u.id              AS "userId",
           u.username,
           u.role            AS "userRoleFromUser"
         FROM employees e
         LEFT JOIN users u ON u.employee_id = e.id
         ORDER BY e.id ASC`,
        []
      );
      res.json(rows);
    } catch (err: any) {
      console.error('[identity-matrix/roster] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;

