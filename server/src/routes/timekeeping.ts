import { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { pool } from '../../db';
import * as ledger from '../lib/punchLedger';
import { notificationManager } from '../services/notificationManager';
import { checkActivePTOForEmployee } from '../services/timekeeping/timeoff.service';
import { logAction, actorFromUser } from '../services/timekeeping/audit.service';

const router = Router();

// GET /api/timekeeping/active-job — reads from punch_ledger (unified source of truth).
// clockedIn indicates whether the employee has an open punch_ledger session.
router.get('/active-job', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const empId = (user.employeeId ?? user.id) as number | null;
    if (!empId) return res.json({ jobId: null, clockedIn: false });

    const openSession = await ledger.getOpenSession(empId);
    const status = ledger.deriveStatus(openSession);
    const clockedIn = status !== 'clocked_out';
    res.json({ jobId: openSession?.productionWorkOrderId ?? null, clockedIn });
  } catch (err: any) {
    console.error('[Timekeeping] Active job error:', err);
    res.status(500).json({ error: 'Failed to fetch active job' });
  }
});

// GET /api/timekeeping/active-context — returns charge code attribution and labor class from open punch_ledger session.
router.get('/active-context', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const empId = (user.employeeId ?? user.id) as number | null;
    if (!empId) return res.json({ activeJobId: null, activeJobLabel: null, punchType: null, clockedIn: false });

    const openSession = await ledger.getOpenSession(empId);
    const status = ledger.deriveStatus(openSession);

    // Map punch_ledger status to legacy punchType for backward compat with ProductionOrderInspector
    let punchType: string | null = null;
    if (status === 'clocked_in') punchType = 'clock_in';
    else if (status === 'on_break') punchType = 'break_start';

    res.json({
      activeJobId: openSession?.productionWorkOrderId ?? null,
      activeJobLabel: openSession?.chargeCode ?? null,
      punchType,
      clockedIn: status !== 'clocked_out',
      activeChargeCode: openSession?.chargeCode ?? null,
      activeTravelerId: openSession?.travelerId ?? null,
    });
  } catch (err: any) {
    console.error('[Timekeeping] Active context error:', err);
    res.status(500).json({ error: 'Failed to fetch active context' });
  }
});

// GET /api/timekeeping/status — current punch status for the authenticated employee.
// Used by useTimeClock hook; reads from punch_ledger.
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const empId = (user.employeeId ?? user.id) as number | null;
    if (!empId) {
      return res.json({ status: null, lastPunch: null, clockIn: null, clockOut: null, activeJobId: null, activeJobLabel: null, activeChargeCode: null });
    }
    const openSession = await ledger.getOpenSession(empId);
    const derivedStatus = ledger.deriveStatus(openSession);

    // Map ledger status to PunchType-compatible string
    let status: string | null = null;
    if (derivedStatus === 'clocked_in') status = 'clock_in';
    else if (derivedStatus === 'on_break') status = 'break_start';

    res.json({
      status,
      lastPunch: null,
      clockIn: openSession?.clockIn?.toISOString() ?? null,
      clockOut: openSession?.clockOut?.toISOString() ?? null,
      activeJobId: openSession?.productionWorkOrderId ?? null,
      activeJobLabel: openSession?.chargeCode ?? null,
      activeChargeCode: openSession?.chargeCode ?? null,
    });
  } catch (err: any) {
    console.error('[Timekeeping] Status error:', err);
    res.status(500).json({ error: 'Failed to fetch timekeeping status' });
  }
});

// POST /api/timekeeping/punch — self-service punch for Employee Portal.
// Accepts { type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end', jobId? }
router.post('/punch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const empId = (user.employeeId ?? user.id) as number | null;
    if (!empId) return res.status(403).json({ error: 'Your account is not linked to an employee record' });

    const { type } = req.body ?? {};
    const validTypes = ['clock_in', 'clock_out', 'break_start', 'break_end'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const openSession = await ledger.getOpenSession(empId);
    const currentStatus = ledger.deriveStatus(openSession);

    let entry;
    switch (type as string) {
      case 'clock_in': {
        if (currentStatus !== 'clocked_out') return res.status(409).json({ error: `Already ${currentStatus === 'clocked_in' ? 'clocked in' : 'on break'}` });
        // PTO block: refuse clock-in on approved PTO days.
        // ADMIN/OWNER callers may bypass with adminPtoOverride=true + adminOverrideReason.
        const punchToday = new Date().toISOString().slice(0, 10);
        const ptoPunchBlock = await checkActivePTOForEmployee(empId, punchToday);
        if (ptoPunchBlock) {
          const punchAdminOverride = req.body?.adminPtoOverride === true;
          const punchOverrideReason = typeof req.body?.adminOverrideReason === 'string' ? req.body.adminOverrideReason.trim() : null;
          const punchIsAdmin = user.role === 'ADMIN' || user.role === 'OWNER';
          if (punchAdminOverride && punchIsAdmin && punchOverrideReason) {
            await logAction({
              tableName: 'leave_entries',
              recordId: ptoPunchBlock.leaveEntryId,
              action: 'UPDATE',
              oldValues: null,
              newValues: {
                ptoClockInOverride: true,
                overrideActorId: user.id,
                overrideReason: punchOverrideReason,
                overrideTimestamp: new Date().toISOString(),
                source: 'PORTAL',
              },
              actor: actorFromUser(user, req.ip ?? null),
            });
          } else {
            return res.status(422).json({
              error: 'PTO_DAY_BLOCK',
              message: 'This employee has approved PTO for today. Clock-in is not permitted.',
              leaveEntryId: ptoPunchBlock.leaveEntryId,
            });
          }
        }
        entry = await ledger.openSession({ employeeId: empId, source: 'PORTAL', laborClass: 'REGULAR' });
        break;
      }
      case 'clock_out':
        if (currentStatus === 'clocked_out') return res.status(409).json({ error: 'Not clocked in' });
        entry = await ledger.closeSession(empId);
        break;
      case 'break_start':
        if (currentStatus !== 'clocked_in') return res.status(409).json({ error: currentStatus === 'on_break' ? 'Already on break' : 'Not clocked in' });
        await ledger.closeSession(empId);
        entry = await ledger.openSession({ employeeId: empId, source: 'PORTAL', laborClass: 'BREAK' });
        break;
      case 'break_end':
        if (currentStatus !== 'on_break') return res.status(409).json({ error: 'Not on break' });
        await ledger.closeSession(empId);
        entry = await ledger.openSession({ employeeId: empId, source: 'PORTAL', laborClass: 'REGULAR' });
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    notificationManager.broadcast({
      type: 'punch_recorded',
      title: 'Punch recorded',
      message: `Employee ${empId} — ${type}`,
      data: { employeeId: empId, action: type },
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ entry, type });
  } catch (err: any) {
    console.error('[Timekeeping] Punch error:', err);
    res.status(500).json({ error: 'Failed to record punch' });
  }
});

// GET /api/timekeeping/jobs — active production orders (optional ?department= filter)
router.get('/jobs', authenticateToken, async (req: Request, res: Response) => {
  try {
    const department = (req.query.department as string) || null;
    const jobs = await pool.query(
      `SELECT id, order_id AS "orderNumber", current_department AS "department"
       FROM production_orders
       WHERE production_status NOT IN ('COMPLETE', 'COMPLETED', 'CANCELLED')
         AND ($1::text IS NULL OR current_department ILIKE $1)
       ORDER BY id DESC
       LIMIT 100`,
      [department]
    );
    res.json(jobs);
  } catch (err: any) {
    console.error('[Timekeeping] Jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/timekeeping/buckets — list active work buckets (fallback)
router.get('/buckets', authenticateToken, async (req: Request, res: Response) => {
  try {
    const buckets = await pool.query(
      `SELECT id, name, type FROM work_buckets WHERE active = true ORDER BY type, name`
    );
    res.json(buckets);
  } catch (err: any) {
    console.error('[Timekeeping] Buckets error:', err);
    res.status(500).json({ error: 'Failed to fetch work buckets' });
  }
});

// GET /api/timekeeping/hours-legacy — RETIRED (Phase 2)
router.get('/hours-legacy', authenticateToken, (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'Gone: legacy hours endpoint has been retired. Use the standalone Timekeeper module.',
    code: 'ENDPOINT_RETIRED',
  });
});

// GET /api/timekeeping/admin/employee/:id-legacy — RETIRED (Phase 2)
// Employee punch history is now served exclusively by the standalone Timekeeper module.
// This legacy route is permanently retired.
router.get(
  '/admin/employee/:id-legacy',
  authenticateToken,
  requireRole('ADMIN'),
  (_req: Request, res: Response) => {
    return res.status(410).json({
      error: 'Gone: legacy admin employee punch view has been retired. Use the standalone Timekeeper module.',
      code: 'ENDPOINT_RETIRED',
    });
  }
);

// ─── KIOSK ENDPOINTS (no auth — tablet/kiosk use) ───────────────────────────

// GET /api/timekeeping/kiosk/buckets
router.get('/kiosk/buckets', async (_req: Request, res: Response) => {
  try {
    const buckets = await pool.query(
      `SELECT id, name, type FROM work_buckets WHERE active = true ORDER BY type, name`
    );
    res.json(buckets);
  } catch (err: any) {
    console.error('[Kiosk] Buckets error:', err);
    res.status(500).json({ error: 'Failed to fetch buckets' });
  }
});

// GET /api/timekeeping/kiosk/jobs — active jobs for kiosk selector
router.get('/kiosk/jobs', async (_req: Request, res: Response) => {
  try {
    const jobs = await pool.query(
      `SELECT id, order_id AS "orderNumber", current_department AS "department"
       FROM production_orders
       WHERE production_status NOT IN ('COMPLETE', 'COMPLETED', 'CANCELLED')
       ORDER BY id DESC
       LIMIT 100`
    );
    res.json(jobs);
  } catch (err: any) {
    console.error('[Kiosk] Jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST /api/timekeeping/kiosk/punch
// Removed 410 stub — now handled by absorbed tkPunchesRoutes (Tier 1 absorption).

// POST /api/timekeeping/kiosk/punch-legacy — RETIRED (Phase 2)
// Previously inserted directly into punch_events. Kiosk punch recording is now exclusively
// handled by the standalone Timekeeper module.
router.post('/kiosk/punch-legacy', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'Gone: kiosk punch-legacy has been retired. Use the standalone Timekeeper application.',
    code: 'ENDPOINT_RETIRED',
  });
});

// GET /api/timekeeping/admin/projects — list active projects for allocation UI
router.get('/admin/projects', authenticateToken, requireRole('ADMIN', 'OWNER'), async (_req: Request, res: Response) => {
  try {
    const projects = await pool.query(
      `SELECT id, project_code AS "projectCode", project_name AS "projectName"
       FROM projects
       WHERE status = 'active'
       ORDER BY project_code ASC`
    );
    res.json(projects);
  } catch (err: any) {
    console.error('[admin/projects]', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /api/timekeeping/admin/job-allocate — replace allocations for a job
router.post('/admin/job-allocate', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { jobId, allocations } = req.body;
    const numericJobId = parseInt(String(jobId), 10);
    if (isNaN(numericJobId)) return res.status(400).json({ error: 'Invalid jobId' });

    // ── Validation (Prompt 2) ────────────────────────────────────────────────
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'At least one allocation required' });
    }
    const totalUnits = allocations.reduce((sum: number, a: any) => sum + (Number(a.units) || 0), 0);
    if (totalUnits <= 0) {
      return res.status(400).json({ error: 'Total units must be greater than 0' });
    }
    for (const a of allocations) {
      if (!a.projectId) {
        return res.status(400).json({ error: 'projectId required for every allocation' });
      }
      if (!a.units || Number(a.units) <= 0) {
        return res.status(400).json({ error: 'units must be > 0 for every allocation' });
      }
    }
    const projectIds = allocations.map((a: any) => a.projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      return res.status(400).json({ error: 'Duplicate projects not allowed' });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Capture previous allocations for audit old_value (Prompt 3)
    const previousRows = await pool.query(
      `SELECT project_id AS "projectId", allocation_units AS "allocationUnits"
       FROM job_allocations WHERE job_id = $1`,
      [numericJobId]
    );

    // Replace: delete existing, then insert new
    await pool.query(`DELETE FROM job_allocations WHERE job_id = $1`, [numericJobId]);
    for (const a of allocations) {
      await pool.query(
        `INSERT INTO job_allocations (job_id, project_id, allocation_units)
         VALUES ($1, $2, $3)`,
        [numericJobId, a.projectId, Number(a.units)]
      );
    }

    // ── Audit logging (Prompt 3) ─────────────────────────────────────────────
    try {
      const user = (req as any).user;
      await storage.createAdminAuditLog({
        orderId: String(numericJobId),
        fieldName: 'JOB_ALLOCATION',
        fieldLabel: 'Job Cost Allocation',
        oldValue: previousRows.length > 0 ? previousRows : null,
        newValue: { jobId: numericJobId, allocations },
        changedBy: user?.username ?? 'unknown',
        userRole: user?.role ?? 'ADMIN',
        changeType: 'JOB_ALLOCATION',
        reason: 'Manual allocation update',
      });
    } catch (auditErr) {
      console.warn('[job-allocate] Audit log failed (non-fatal):', auditErr);
    }
    // ────────────────────────────────────────────────────────────────────────

    res.json({ success: true, jobId: numericJobId, count: allocations.length });
  } catch (err: any) {
    console.error('[job-allocate]', err);
    res.status(500).json({ error: 'Failed to save job allocations' });
  }
});

// GET /api/timekeeping/admin/job-allocations/:jobId — current allocations for a job
router.get('/admin/job-allocations/:jobId', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const rows = await pool.query(
      `SELECT ja.id, ja.job_id AS "jobId", ja.project_id AS "projectId",
              ja.allocation_units AS "allocationUnits", ja.allocation_percent AS "allocationPercent",
              ja.created_at AS "createdAt",
              p.project_code AS "projectCode", p.project_name AS "projectName"
       FROM job_allocations ja
       LEFT JOIN projects p ON p.id = ja.project_id
       WHERE ja.job_id = $1
       ORDER BY ja.created_at ASC`,
      [jobId]
    );
    res.json(rows);
  } catch (err: any) {
    console.error('[job-allocations]', err);
    res.status(500).json({ error: 'Failed to fetch job allocations' });
  }
});

// GET /api/timekeeping/admin/export/gusto
// Removed 410 stub — now handled by absorbed tkTimesheetsRoutes (Tier 1 absorption).

export default router;
