import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { authenticateToken } from "../../../middleware/auth";
import { pool } from "../../../db";
import { getPayrollReviewBatch, type PayrollReviewBatch } from "../../services/timekeeping/dashboard.service";
import { getAdminReviewQueue } from "../../services/timekeeping/salariedTimesheet.service";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[timekeeping/myTasks]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Internal server error" });
  });
}

const router: IRouter = Router();

const INCOMPLETE_HOURLY_ISSUES = new Set([
  "missing_punch",
  "pending_correction",
  "unapproved_labor",
  "missing_timesheet",
]);

const BILLING_TASK_OWNER_USERNAME = "glennj";
const BILLING_GRACE_DAYS = 2;
const BILLING_OVERDUE_DAYS = 3;

function emptyPayrollReviewBatch(): PayrollReviewBatch {
  return {
    periodStart: "",
    periodEnd: "",
    label: "Unavailable",
    generatedAt: new Date().toISOString(),
    summary: {
      employeeCount: 0,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      leaveHours: 0,
      missingPunchCount: 0,
      blockedCount: 0,
      readyCount: 0,
      lockedCount: 0,
      pendingCorrectionCount: 0,
    },
    hourly: [],
    salaried: [],
  };
}

let billingTaskTablesEnsured = false;
async function ensureBillingTaskTables() {
  if (billingTaskTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS p2_billing_task_snoozes (
      id SERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      username TEXT NOT NULL,
      snoozed_until TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, username)
    );
    CREATE TABLE IF NOT EXISTS p1_billing_task_snoozes (
      id SERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      username TEXT NOT NULL,
      snoozed_until TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, username)
    );
  `);
  billingTaskTablesEnsured = true;
}

async function optionalValue<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err: any) {
    console.error(`[timekeeping/myTasks] Optional task source failed (${label})`, err?.message ?? err);
    return fallback;
  }
}

function isBillingTaskOwner(user: any): boolean {
  return String(user?.username ?? "").trim().toLowerCase() === BILLING_TASK_OWNER_USERNAME;
}

async function getP2BillingTasksForUser(user: any) {
  if (!isBillingTaskOwner(user)) return [];

  await ensureBillingTaskTables();

  const { rows } = await optionalQuery<any>(
    "p2BillingTasks",
    `
      WITH eligible_slips AS (
        SELECT
          ps.id,
          ps.packing_slip_number,
          ps.customer_id,
          ps.customer_name,
          ps.po_number,
          ps.lot_number_id,
          ps.shipment_number,
          ps.created_at,
          ps.ship_date,
          ps.status,
          inv_any.id AS invoice_id,
          inv_any.invoice_number,
          inv_any.status AS invoice_status,
          posted_invoice.id AS posted_invoice_id
        FROM p2_packing_slips ps
        LEFT JOIN LATERAL (
          SELECT id, invoice_number, status
          FROM ar_invoices
          WHERE packing_slip_id = ps.id
            AND COALESCE(status, '') <> 'VOID'
          ORDER BY created_at DESC
          LIMIT 1
        ) inv_any ON true
        LEFT JOIN LATERAL (
          SELECT inv.id
          FROM ar_invoices inv
          WHERE inv.packing_slip_id = ps.id
            AND COALESCE(inv.status, '') <> 'VOID'
            AND (
              inv.status = 'POSTED'
              OR EXISTS (
                SELECT 1
                FROM journal_entries je
                WHERE je.reference_uuid = inv.id
                  AND je.transaction_type = 'AR_INVOICE'
                  AND COALESCE(je.status, 'POSTED') = 'POSTED'
              )
            )
          ORDER BY inv.created_at DESC
          LIMIT 1
        ) posted_invoice ON true
        WHERE posted_invoice.id IS NULL
          AND COALESCE(ps.status, '') <> 'VOID'
          AND ps.created_at <= NOW() - ($1::int * INTERVAL '1 day')
      ),
      unsnoozed_slips AS (
        SELECT es.*
        FROM eligible_slips es
        LEFT JOIN p2_billing_task_snoozes s
          ON s.customer_id = es.customer_id
         AND LOWER(s.username) = LOWER($2)
         AND s.snoozed_until > NOW()
        WHERE s.id IS NULL
      )
      SELECT
        customer_id,
        COALESCE(NULLIF(customer_name, ''), customer_id) AS customer_name,
        COUNT(*)::int AS packing_slip_count,
        MIN(created_at) AS oldest_created_at,
        MAX(created_at) AS newest_created_at,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', id,
            'packingSlipNumber', packing_slip_number,
            'poNumber', po_number,
            'lotNumberId', lot_number_id,
            'shipmentNumber', shipment_number,
            'createdAt', created_at,
            'shipDate', ship_date,
            'status', status,
            'invoiceId', invoice_id,
            'invoiceNumber', invoice_number,
            'invoiceStatus', invoice_status
          )
          ORDER BY created_at ASC
        ) AS items
      FROM unsnoozed_slips
      GROUP BY customer_id, COALESCE(NULLIF(customer_name, ''), customer_id)
      ORDER BY MIN(created_at) ASC
      LIMIT 25
    `,
    [BILLING_GRACE_DAYS, BILLING_TASK_OWNER_USERNAME],
  );

  return rows.map((row: any) => {
    const oldest = new Date(row.oldest_created_at);
    const ageDays = Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86_400_000));
    const count = Number(row.packing_slip_count ?? 0);
    const label = count === 1 ? "shipment record" : "shipment records";
    return {
      id: `p2-billing-${row.customer_id}`,
      type: "p2_invoice_posting_group",
      title: `Post P2 invoices: ${row.customer_name}`,
      description: `${count} ${label} past the ${BILLING_GRACE_DAYS}-day grace period without a posted invoice`,
      employeeName: BILLING_TASK_OWNER_USERNAME,
      createdAt: row.oldest_created_at,
      priority: ageDays >= BILLING_OVERDUE_DAYS ? "overdue" : "normal",
      actionUrl: "/p2/shipments",
      sourceId: 0,
      customerId: row.customer_id,
      customerName: row.customer_name,
      packingSlipCount: count,
      oldestCreatedAt: row.oldest_created_at,
      newestCreatedAt: row.newest_created_at,
      graceDays: BILLING_GRACE_DAYS,
      overdueDays: BILLING_OVERDUE_DAYS,
      items: Array.isArray(row.items) ? row.items : [],
    };
  });
}

async function getP1BillingTasksForUser(user: any) {
  if (!isBillingTaskOwner(user)) return [];

  await ensureBillingTaskTables();

  const { rows } = await optionalQuery<any>(
    "p1BillingTasks",
    `
      WITH shipment_lines AS (
        SELECT
          sr.id AS shipment_id,
          COALESCE(sr.customer_id::text, po.customer_id::text, '0') AS customer_id,
          COALESCE(NULLIF(sr.customer_name, ''), NULLIF(po.customer_name, ''),
                   NULLIF(sr.ship_to_snapshot->>'name', ''), 'P1 customer') AS customer_name,
          sr.reference,
          sr.master_tracking_number,
          sr.invoice_number AS shipment_invoice_number,
          sr.shipped_at,
          sr.created_at,
          COALESCE(NULLIF(si.po_number, ''), prod_ord.po_number, po.po_number) AS po_number,
          si.order_id
        FROM shipment_records sr
        JOIN shipment_items si ON si.shipment_id = sr.id
        LEFT JOIN production_orders prod_ord ON prod_ord.order_id = si.order_id
        LEFT JOIN purchase_order_items poi ON poi.id = si.po_item_id
        LEFT JOIN purchase_orders po ON po.id = poi.po_id
      ),
      shipment_po_groups AS (
        SELECT
          shipment_id,
          customer_id,
          MAX(customer_name) AS customer_name,
          MAX(reference) AS reference,
          MAX(master_tracking_number) AS master_tracking_number,
          MAX(shipment_invoice_number) AS shipment_invoice_number,
          MAX(shipped_at) AS shipped_at,
          MAX(created_at) AS created_at,
          po_number,
          ARRAY_AGG(DISTINCT order_id) FILTER (WHERE order_id IS NOT NULL) AS order_ids,
          (
            SELECT COUNT(DISTINCT sl2.po_number)
            FROM shipment_lines sl2
            WHERE sl2.shipment_id = shipment_lines.shipment_id
              AND NULLIF(sl2.po_number, '') IS NOT NULL
          ) AS shipment_po_count
        FROM shipment_lines
        WHERE NULLIF(po_number, '') IS NOT NULL
        GROUP BY shipment_id, customer_id, po_number
      ),
      eligible_groups AS (
        SELECT spg.*, invoice_match.*
        FROM shipment_po_groups spg
        LEFT JOIN LATERAL (
          SELECT
            (ARRAY_AGG(inv.id ORDER BY inv.created_at DESC)
              FILTER (WHERE COALESCE(inv.status, '') <> 'VOID'))[1] AS invoice_id,
            (ARRAY_AGG(inv.invoice_number ORDER BY inv.created_at DESC)
              FILTER (WHERE COALESCE(inv.status, '') <> 'VOID'))[1] AS invoice_number,
            (ARRAY_AGG(inv.status ORDER BY inv.created_at DESC)
              FILTER (WHERE COALESCE(inv.status, '') <> 'VOID'))[1] AS invoice_status,
            COALESCE(BOOL_OR(
              COALESCE(inv.status, '') <> 'VOID'
              AND (
                inv.status = 'POSTED'
                OR EXISTS (
                  SELECT 1 FROM journal_entries je
                  WHERE je.reference_uuid = inv.id
                    AND je.transaction_type = 'AR_INVOICE'
                    AND COALESCE(je.status, 'POSTED') = 'POSTED'
                )
              )
            ), false) AS has_posted_invoice
          FROM ar_invoices inv
          WHERE EXISTS (
            SELECT 1
            FROM ar_invoice_lines line
            WHERE line.invoice_id = inv.id
              AND line.dimension_tags->>'source' = 'p1_oem_packing_slip'
              AND line.dimension_tags->>'poNumber' = spg.po_number
              AND (
                line.dimension_tags->>'shipmentRecordId' = spg.shipment_id::text
                OR line.dimension_tags->>'orderId' = ANY(spg.order_ids)
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(line.dimension_tags->'orderIds') = 'array'
                         THEN line.dimension_tags->'orderIds' ELSE '[]'::jsonb END
                  ) order_id(value)
                  WHERE order_id.value = ANY(spg.order_ids)
                )
              )
          )
          OR (
            spg.shipment_po_count = 1
            AND inv.po_override = spg.po_number
            AND inv.invoice_number = spg.shipment_invoice_number
          )
        ) invoice_match ON true
        WHERE NOT invoice_match.has_posted_invoice
          AND spg.shipped_at <= NOW() - ($1::int * INTERVAL '1 day')
      ),
      unsnoozed_groups AS (
        SELECT eg.*
        FROM eligible_groups eg
        LEFT JOIN p1_billing_task_snoozes s
          ON s.customer_id = eg.customer_id
         AND LOWER(s.username) = LOWER($2)
         AND s.snoozed_until > NOW()
        WHERE s.id IS NULL
      )
      SELECT
        customer_id,
        MAX(customer_name) AS customer_name,
        COUNT(*)::int AS shipment_po_count,
        MIN(shipped_at) AS oldest_shipped_at,
        MAX(shipped_at) AS newest_shipped_at,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', shipment_id::text || ':' || po_number,
            'shipmentId', shipment_id,
            'poNumber', po_number,
            'shipmentReference', reference,
            'trackingNumber', master_tracking_number,
            'createdAt', created_at,
            'shipDate', shipped_at,
            'invoiceId', invoice_id,
            'invoiceNumber', invoice_number,
            'invoiceStatus', invoice_status
          ) ORDER BY shipped_at ASC, po_number ASC
        ) AS items
      FROM unsnoozed_groups
      GROUP BY customer_id
      ORDER BY MIN(shipped_at) ASC
      LIMIT 25
    `,
    [BILLING_GRACE_DAYS, BILLING_TASK_OWNER_USERNAME],
  );

  return rows.map((row: any) => {
    const oldest = new Date(row.oldest_shipped_at);
    const ageDays = Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86_400_000));
    const count = Number(row.shipment_po_count ?? 0);
    const label = count === 1 ? "shipment/PO" : "shipment/PO combinations";
    return {
      id: `p1-billing-${row.customer_id}`,
      type: "p1_invoice_posting_group",
      title: `Post P1 PO invoices: ${row.customer_name}`,
      description: `${count} ${label} past the ${BILLING_GRACE_DAYS}-day grace period without a posted invoice`,
      employeeName: BILLING_TASK_OWNER_USERNAME,
      createdAt: row.oldest_shipped_at,
      priority: ageDays >= BILLING_OVERDUE_DAYS ? "overdue" : "normal",
      actionUrl: "/oem-shipments",
      sourceId: 0,
      customerId: row.customer_id,
      customerName: row.customer_name,
      packingSlipCount: count,
      oldestCreatedAt: row.oldest_shipped_at,
      newestCreatedAt: row.newest_shipped_at,
      graceDays: BILLING_GRACE_DAYS,
      overdueDays: BILLING_OVERDUE_DAYS,
      items: Array.isArray(row.items) ? row.items : [],
    };
  });
}

async function optionalQuery<T>(label: string, query: string, params: unknown[]): Promise<{ rows: T[] }> {
  try {
    return await pool.query<T>(query, params);
  } catch (err: any) {
    console.error(`[timekeeping/myTasks] Optional task query failed (${label})`, err?.message ?? err);
    return { rows: [] };
  }
}

let forkliftTablesEnsured = false;
async function ensureForkliftTaskTables() {
  if (forkliftTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forklift_written_attempts (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      test_type TEXT NOT NULL DEFAULT 'initial',
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL DEFAULT false,
      question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forklift_operator_evaluations (
      id SERIAL PRIMARY KEY,
      written_attempt_id INTEGER REFERENCES forklift_written_attempts(id),
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      evaluator_employee_id INTEGER NOT NULL REFERENCES employees(id),
      test_type TEXT NOT NULL DEFAULT 'initial',
      status TEXT NOT NULL DEFAULT 'pending_evaluation',
      practical_result TEXT,
      evaluator_notes TEXT,
      certified_at TIMESTAMP,
      agc_refresher_due_at TIMESTAMP,
      osha_evaluation_due_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forklift_evaluation_items (
      id SERIAL PRIMARY KEY,
      evaluation_id INTEGER NOT NULL REFERENCES forklift_operator_evaluations(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL,
      label TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      result TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(evaluation_id, item_key)
    )
  `);
  forkliftTablesEnsured = true;
}

async function resolveEmployeeIdForUser(user: any): Promise<number | null> {
  if (!user) return null;

  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (!username && user.id == null) return user.employeeId == null ? null : Number(user.employeeId);

  const { rows } = await pool.query<{ employee_id: number | null }>(
    `
      SELECT e.id AS employee_id
      FROM employees e
      LEFT JOIN users u ON u.id = $1
      WHERE e.id = u.employee_id
         OR e.id = $3
         OR LOWER(e.employee_code) = LOWER($2)
         OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
         OR LOWER(CONCAT(
              REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
              LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
            )) = LOWER($2)
         OR LOWER(CONCAT(
              LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
              REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
            )) = LOWER($2)
      ORDER BY
        CASE
          WHEN e.id = u.employee_id THEN 0
          WHEN LOWER(e.employee_code) = LOWER($2) THEN 1
          WHEN u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email) THEN 2
          WHEN LOWER(CONCAT(
                 REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'),
                 LEFT(REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g'), 1)
               )) = LOWER($2) THEN 3
          WHEN LOWER(CONCAT(
                 LEFT(REGEXP_REPLACE(SPLIT_PART(TRIM(e.name), ' ', 1), '[^[:alnum:]]', '', 'g'), 1),
                 REGEXP_REPLACE((REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'))[ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(e.name), '[[:space:]]+'), 1)], '[^[:alnum:]]', '', 'g')
               )) = LOWER($2) THEN 4
          WHEN e.id = $3 THEN 5
          ELSE 6
        END,
        e.id ASC
      LIMIT 1
    `,
    [user.id ?? null, username, user.employeeId == null ? null : Number(user.employeeId)],
  );

  return rows[0]?.employee_id ?? null;
}

router.get(
  "/my-employee-id",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = await resolveEmployeeIdForUser(req.user as any);
    res.json({ employeeId });
  }),
);

router.post(
  "/my-tasks/p2-billing/:customerId/snooze",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const user = req.user as any;
    if (!isBillingTaskOwner(user)) {
      res.status(403).json({ error: "Only glennj can snooze P2 billing tasks." });
      return;
    }

    const customerId = String(req.params.customerId ?? "").trim();
    if (!customerId) {
      res.status(400).json({ error: "Customer ID is required." });
      return;
    }

    await ensureBillingTaskTables();
    const { rows } = await pool.query<{ snoozed_until: string }>(
      `
        INSERT INTO p2_billing_task_snoozes (customer_id, username, snoozed_until, updated_at)
        VALUES ($1, $2, DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + INTERVAL '8 hours', NOW())
        ON CONFLICT (customer_id, username)
        DO UPDATE SET snoozed_until = EXCLUDED.snoozed_until, updated_at = NOW()
        RETURNING snoozed_until
      `,
      [customerId, BILLING_TASK_OWNER_USERNAME],
    );

    res.json({ customerId, snoozedUntil: rows[0]?.snoozed_until ?? null });
  }),
);

router.post(
  "/my-tasks/p1-billing/:customerId/snooze",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const user = req.user as any;
    if (!isBillingTaskOwner(user)) {
      res.status(403).json({ error: "Only glennj can snooze P1 billing tasks." });
      return;
    }

    const customerId = String(req.params.customerId ?? "").trim();
    if (!customerId) {
      res.status(400).json({ error: "Customer ID is required." });
      return;
    }

    await ensureBillingTaskTables();
    const { rows } = await pool.query<{ snoozed_until: string }>(
      `
        INSERT INTO p1_billing_task_snoozes (customer_id, username, snoozed_until, updated_at)
        VALUES ($1, $2, DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + INTERVAL '8 hours', NOW())
        ON CONFLICT (customer_id, username)
        DO UPDATE SET snoozed_until = EXCLUDED.snoozed_until, updated_at = NOW()
        RETURNING snoozed_until
      `,
      [customerId, BILLING_TASK_OWNER_USERNAME],
    );

    res.json({ customerId, snoozedUntil: rows[0]?.snoozed_until ?? null });
  }),
);

router.get(
  "/my-tasks/:employeeId",
  authenticateToken,
  h(async (req, res): Promise<void> => {
    const employeeId = Number(req.params.employeeId);
    if (!employeeId) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const user = req.user as any;
    const isElevated = user?.role === "ADMIN" || user?.role === "OWNER";
    const resolvedEmployeeId = await resolveEmployeeIdForUser(user);
    if (!isElevated && resolvedEmployeeId !== employeeId) {
      res.status(403).json({ error: "You can only view your own timekeeping tasks." });
      return;
    }

    await optionalValue("ensureForkliftTaskTables", ensureForkliftTaskTables(), undefined);

    const [pto, punchCorrections, salaried, hourly, forklift, payrollReview, salariedReviewQueue, p2BillingTasks, p1BillingTasks] = await Promise.all([
      optionalQuery(
        "pto",
        `
          SELECT r.id,
                 r.employee_id,
                 e.name AS employee_name,
                 r.start_date,
                 r.end_date,
                 r.request_unit,
                 r.requested_hours,
                 r.status,
                 r.employee_note,
                 r.created_at
          FROM timekeeping.time_off_requests r
          JOIN employees e ON e.id = r.employee_id
          WHERE r.status IN ('pending_supervisor', 'pending')
            AND COALESCE(r.supervisor_id, e.supervisor_employee_id) = $1
          ORDER BY r.created_at ASC
        `,
        [employeeId],
      ),
      optionalQuery(
        "punchCorrections",
        `
          SELECT r.id,
                 r.employee_id,
                 e.name AS employee_name,
                 r.punch_ledger_id,
                 r.request_type,
                 r.status,
                 r.reason,
                 r.submitted_at,
                 r.created_at
          FROM timekeeping.punch_correction_requests r
          JOIN employees e ON e.id = r.employee_id
          WHERE r.status = 'pending_supervisor'
            AND COALESCE(r.supervisor_id, e.supervisor_employee_id) = $1
          ORDER BY COALESCE(r.submitted_at, r.created_at) ASC
        `,
        [employeeId],
      ),
      optionalQuery(
        "salariedTimesheets",
        `
          SELECT st.id,
                 st.employee_id,
                 e.name AS employee_name,
                 st.period_start,
                 st.period_end,
                 st.total_actual_hours,
                 st.created_at,
                 st.certified_at
          FROM timekeeping.salaried_timesheets st
          JOIN employees e ON e.id = st.employee_id
          WHERE st.status = 'SUBMITTED'
            AND COALESCE(st.supervisor_employee_id, e.supervisor_employee_id) = $1
          ORDER BY COALESCE(st.certified_at, st.created_at) ASC
        `,
        [employeeId],
      ),
      optionalQuery(
        "hourlyTimesheets",
        `
          SELECT t.id,
                 t.employee_id,
                 e.name AS employee_name,
                 t.period_start,
                 t.period_end,
                 t.total_hours,
                 t.submitted_at,
                 t.created_at
          FROM timekeeping.timesheets t
          JOIN employees e ON e.id = t.employee_id
          WHERE t.status = 'submitted'
            AND e.supervisor_employee_id = $1
          ORDER BY COALESCE(t.submitted_at, t.created_at) ASC
        `,
        [employeeId],
      ),
      optionalQuery(
        "forkliftEvaluations",
        `
          SELECT ev.id,
                 ev.employee_id,
                 e.name AS employee_name,
                 ev.test_type,
                 ev.created_at,
                 wa.score AS written_score,
                 wa.submitted_at AS written_submitted_at
          FROM forklift_operator_evaluations ev
          JOIN employees e ON e.id = ev.employee_id
          LEFT JOIN forklift_written_attempts wa ON wa.id = ev.written_attempt_id
          WHERE ev.status = 'pending_evaluation'
            AND ev.evaluator_employee_id = $1
          ORDER BY ev.created_at ASC
        `,
        [employeeId],
      ),
      optionalValue("payrollReviewBatch", getPayrollReviewBatch(), emptyPayrollReviewBatch()),
      optionalValue("salariedReviewQueue", getAdminReviewQueue(), []),
      optionalValue("p2BillingTasks", getP2BillingTasksForUser(user), []),
      optionalValue("p1BillingTasks", getP1BillingTasksForUser(user), []),
    ]);

    const ptoTasks = pto.rows.map((r: any) => ({
      id: `pto-${r.id}`,
      type: "pto_approval",
      title: `Review PTO: ${r.employee_name}`,
      description: `${r.start_date} to ${r.end_date}${r.requested_hours ? ` (${r.requested_hours} hours)` : ""}`,
      employeeName: r.employee_name,
      startDate: r.start_date,
      endDate: r.end_date,
      requestUnit: r.request_unit,
      requestedHours: r.requested_hours,
      employeeNote: r.employee_note,
      createdAt: r.created_at,
      priority: "normal",
      actionUrl: "/pto-command-center",
      sourceId: r.id,
    }));

    const needsReviewSalariedIds = new Set(
      salariedReviewQueue
        .filter((row) => row.needsReviewDraftCount > 0)
        .map((row) => row.timesheet.id),
    );

    const salariedTasks = salaried.rows
      .filter((r: any) => !needsReviewSalariedIds.has(Number(r.id)))
      .map((r: any) => ({
      id: `salaried-${r.id}`,
      type: "salaried_timesheet_approval",
      title: `Approve salaried timesheet: ${r.employee_name}`,
      description: `${r.period_start} to ${r.period_end} (${Number(r.total_actual_hours ?? 0).toFixed(2)} hours)`,
      employeeName: r.employee_name,
      createdAt: r.certified_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=timesheets",
      sourceId: r.id,
    }));

    const subordinateRows = await pool.query<{ id: number }>(
      `SELECT id FROM employees WHERE supervisor_employee_id = $1`,
      [employeeId],
    );
    const subordinateEpochIds = new Set(subordinateRows.rows.map((row) => Number(row.id)));
    const incompleteHourlyRows = payrollReview.hourly
      .filter((row) => subordinateEpochIds.has(row.employeeId))
      .filter((row) => row.issues.some((issue) => INCOMPLETE_HOURLY_ISSUES.has(issue.code)));
    const incompleteHourlyTimesheetIds = new Set(
      incompleteHourlyRows.map((row) => row.timesheetId).filter((id): id is number => id != null),
    );

    const hourlyTasks = hourly.rows
      .filter((r: any) => !incompleteHourlyTimesheetIds.has(Number(r.id)))
      .map((r: any) => ({
      id: `hourly-${r.id}`,
      type: "hourly_timesheet_approval",
      title: `Approve hourly timesheet: ${r.employee_name}`,
      description: `${r.period_start} to ${r.period_end} (${Number(r.total_hours ?? 0).toFixed(2)} hours)`,
      employeeName: r.employee_name,
      createdAt: r.submitted_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=timesheets",
      sourceId: r.id,
    }));

    const punchCorrectionTasks = punchCorrections.rows.map((r: any) => ({
      id: `punch-correction-${r.id}`,
      type: "punch_correction_approval",
      title: `Review punch edit: ${r.employee_name}`,
      description: `${String(r.request_type || "correction").replace(/_/g, " ")}${r.punch_ledger_id ? ` for punch #${r.punch_ledger_id}` : ""} - ${r.reason}`,
      employeeName: r.employee_name,
      employeeNote: r.reason,
      createdAt: r.submitted_at ?? r.created_at,
      priority: "normal",
      actionUrl: "/time-clock-admin?tab=corrections",
      sourceId: r.id,
      requestType: r.request_type,
    }));

    const blockedHourlyTasks = incompleteHourlyRows.map((row) => ({
        id: `hourly-blocked-${row.employeeId}-${row.timesheetId ?? "missing"}`,
        type: "hourly_timesheet_blocked",
        title: `Blocked hourly timesheet: ${row.employeeName}`,
        description: `${payrollReview.periodStart} to ${payrollReview.periodEnd} - ${row.issues.map((issue) => issue.label).join(", ")}`,
        employeeName: row.employeeName,
        createdAt: payrollReview.generatedAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=payroll",
        sourceId: row.timesheetId ?? row.employeeId,
      }));

    const missingSalariedTasks = payrollReview.salaried
      .filter((row) => subordinateEpochIds.has(row.employeeId))
      .filter((row) => row.issues.some((issue) => issue.code === "missing_salaried_timesheet"))
      .filter((row) => row.status !== "SUBMITTED")
      .map((row) => ({
        id: `salaried-blocked-${row.employeeId}-${row.timesheetId ?? "missing"}`,
        type: "salaried_timesheet_blocked",
        title: `Blocked salaried timesheet: ${row.employeeName}`,
        description: `${payrollReview.periodStart} to ${payrollReview.periodEnd} - ${row.issues.map((issue) => issue.label).join(", ")}`,
        employeeName: row.employeeName,
        createdAt: payrollReview.generatedAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=payroll",
        sourceId: row.timesheetId ?? row.employeeId,
      }));

    const needsReviewSalariedTasks = salariedReviewQueue
      .filter((row) => row.needsReviewDraftCount > 0)
      .filter((row) => subordinateEpochIds.has(row.timesheet.employeeId))
      .map((row) => ({
        id: `salaried-blocked-${row.timesheet.employeeId}-${row.timesheet.id}`,
        type: "salaried_timesheet_blocked",
        title: `Blocked salaried timesheet: ${row.employeeName ?? `Employee #${row.timesheet.employeeId}`}`,
        description: `${row.timesheet.periodStart} to ${row.timesheet.periodEnd} - ${row.needsReviewDraftCount} labor draft${row.needsReviewDraftCount === 1 ? "" : "s"} need review`,
        employeeName: row.employeeName ?? `Employee #${row.timesheet.employeeId}`,
        createdAt: row.timesheet.certifiedAt ?? row.timesheet.createdAt,
        priority: "overdue",
        actionUrl: "/time-clock-admin?tab=timesheets",
        sourceId: row.timesheet.id,
      }));

    const forkliftTasks = forklift.rows.map((r: any) => ({
      id: `forklift-${r.id}`,
      type: "forklift_evaluation",
      title: `Evaluate forklift operator: ${r.employee_name}`,
      description: `Written test passed at ${Number(r.written_score ?? 0)}% - ${String(r.test_type || "initial").replace(/_/g, " ")} evaluation`,
      employeeName: r.employee_name,
      createdAt: r.created_at,
      priority: "normal",
      actionUrl: "/training/my-training",
      sourceId: r.id,
      writtenScore: r.written_score,
      testType: r.test_type,
    }));

    const tasks = [...p2BillingTasks, ...p1BillingTasks, ...ptoTasks, ...punchCorrectionTasks, ...salariedTasks, ...hourlyTasks, ...blockedHourlyTasks, ...missingSalariedTasks, ...needsReviewSalariedTasks, ...forkliftTasks].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const overdueCount = tasks.filter((task: any) => task.priority === "overdue").length;

    res.json({
      tasks,
      stats: {
        total: tasks.length,
        pending: tasks.length,
        completed: 0,
        overdue: overdueCount,
      },
    });
  }),
);

export default router;
