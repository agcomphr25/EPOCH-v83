import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { z } from 'zod';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { employees, punchLedger, laborApprovals } from '../../../schema';
import { authenticateToken, requireRole } from '../../../middleware/auth';
import { storage } from '../../../storage';

const router = Router();

const ALLOWED_ROLES = ['ADMIN', 'OWNER', 'HR'];

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) =>
    fn(req, res, next).catch((err) => {
      console.error('[timekeeping/laborApprovals]', err?.message ?? err);
      if (!res.headersSent) res.status(500).json({ error: err?.message ?? 'Internal server error' });
    });
}

const CreateApprovalBody = z.object({
  productionWorkOrderId: z.string().uuid('productionWorkOrderId must be a valid UUID'),
  employeeId: z.string().regex(/^\d+$/, 'employeeId must be a numeric string'),
  reason: z.string().min(1, 'reason is required'),
  hoursAtApproval: z.number().positive().optional(),
});

// POST /api/timekeeping/labor-approvals
// Supervisor creates an approval record for a WAD-linked employee/work-order labor group.
// approvedBy is always derived server-side from the authenticated user — never trusted from the client.
router.post(
  '/labor-approvals',
  authenticateToken,
  requireRole(...ALLOWED_ROLES),
  h(async (req, res) => {
    const body = CreateApprovalBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.errors.map((e) => e.message).join('; ') });
      return;
    }

    const { productionWorkOrderId, employeeId, reason, hoursAtApproval: providedHours } = body.data;
    const numericEmpId = parseInt(employeeId, 10);

    // Validate employee exists
    const [emp] = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.id, numericEmpId))
      .limit(1);
    if (!emp) {
      res.status(404).json({ error: `Employee '${employeeId}' not found` });
      return;
    }

    // Validate at least one punch session exists for this employee + work order
    const [wadCheck] = await db
      .select({ wao: punchLedger.productionWorkOrderId })
      .from(punchLedger)
      .where(
        and(
          eq(punchLedger.productionWorkOrderId, productionWorkOrderId),
          eq(punchLedger.employeeId, numericEmpId),
        ),
      )
      .limit(1);
    if (!wadCheck) {
      res.status(404).json({
        error: `No punch_ledger sessions found for employee '${employeeId}' on work order '${productionWorkOrderId}'`,
      });
      return;
    }

    // Calculate hoursAtApproval from closed REGULAR sessions if not supplied by caller
    let hoursAtApproval: string | null = providedHours != null ? String(providedHours) : null;
    if (hoursAtApproval == null) {
      const [hoursRow] = await db
        .select({
          totalHours: sql<number>`
            COALESCE(
              SUM(EXTRACT(EPOCH FROM (${punchLedger.clockOut} - ${punchLedger.clockIn})) / 3600),
              0
            )`,
        })
        .from(punchLedger)
        .where(
          and(
            eq(punchLedger.employeeId, numericEmpId),
            eq(punchLedger.productionWorkOrderId, productionWorkOrderId),
            isNotNull(punchLedger.clockOut),
            eq(punchLedger.laborClass, 'REGULAR'),
          ),
        );
      hoursAtApproval = hoursRow?.totalHours != null ? String(Number(hoursRow.totalHours).toFixed(4)) : '0';
    }

    // approvedBy is the authenticated user's identity — never accepted from client
    const approvedBy =
      req.user?.username ??
      (req.user as any)?.email ??
      `user:${req.user?.id ?? 'unknown'}`;

    // Per Architecture Constitution §5.2 (Task #77): creating a labor approval is the
    // ONLY path that flips a TRAVELER-source punch from PENDING_APPROVAL → APPROVED.
    // We perform the approval insert and the punch_ledger flip in a single transaction
    // so a partial failure cannot leave a punch silently APPROVED without an audit row.
    const approval = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(laborApprovals)
        .values({
          productionWorkOrderId,
          employeeId,
          approvedBy,
          department: null,
          reason,
          hoursAtApproval,
        })
        .returning();

      // Flip every PENDING_APPROVAL / FLAGGED punch in this (employee, WAD) group
      // to APPROVED and stamp the labor_approval_id link. APPROVED_OVERRUN punches
      // are left alone — they were already pre-approved at write time via override.
      const flipResult = await tx.execute(sql`
        UPDATE punch_ledger
        SET approval_status = 'APPROVED',
            labor_approval_id = ${created.id},
            updated_at = NOW()
        WHERE employee_id = ${numericEmpId}
          AND production_work_order_id = ${productionWorkOrderId}::uuid
          AND approval_status IN ('PENDING_APPROVAL', 'FLAGGED')
      `);
      const punchesFlipped = (flipResult as { rowCount?: number }).rowCount ?? 0;

      return { ...created, punchesFlipped };
    });

    res.status(201).json({
      ...approval,
      employeeName: emp.name,
    });
  }),
);

// GET /api/timekeeping/labor-approvals/unapproved
// Returns WAD-linked closed REGULAR punch_ledger sessions that have no matching
// labor_approvals row (same employee_id + production_work_order_id).
// Groups by employee + work order to match the scorer's granularity.
router.get(
  '/labor-approvals/unapproved',
  authenticateToken,
  requireRole(...ALLOWED_ROLES),
  h(async (req, res) => {
    const rows = await db.execute(sql`
      SELECT
        pl.employee_id::text                        AS "employeeId",
        e.name                                      AS "employeeName",
        pl.production_work_order_id::text           AS "productionWorkOrderId",
        COUNT(*)::integer                           AS "sessionCount",
        ROUND(
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600
          ), 0)::numeric,
          2
        )::float                                    AS "totalHours",
        MIN(pl.clock_in)                            AS "earliestClockIn",
        MAX(pl.clock_out)                           AS "latestClockOut",
        ARRAY_AGG(pl.id ORDER BY pl.clock_in)       AS "punchLedgerIds"
      FROM punch_ledger pl
      LEFT JOIN employees e ON e.id = pl.employee_id
      WHERE
        pl.clock_out IS NOT NULL
        AND pl.labor_class = 'REGULAR'
        AND pl.production_work_order_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM labor_approvals la
          WHERE la.employee_id = pl.employee_id::text
            AND la.production_work_order_id = pl.production_work_order_id
        )
      GROUP BY pl.employee_id, e.name, pl.production_work_order_id
      ORDER BY MIN(pl.clock_in) DESC
    `);

    res.json(rows.rows);
  }),
);

// GET /api/timekeeping/labor-approvals
// List all existing labor approval records (for audit history).
router.get(
  '/labor-approvals',
  authenticateToken,
  requireRole(...ALLOWED_ROLES),
  h(async (req, res) => {
    const rows = await db
      .select()
      .from(laborApprovals)
      .orderBy(laborApprovals.approvedAt);
    res.json(rows);
  }),
);

export default router;
