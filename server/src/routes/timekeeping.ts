import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { pool } from '../../db';
import { pairPunches, sumHours } from '../services/timekeepingPairing';
import { getPayPeriod } from '../services/payPeriod';
import { buildJobIntervals } from '../services/jobLabor';

const router = Router();

const ALLOWED_PUNCH_TYPES = ['clock_in', 'clock_out', 'break_start', 'break_end'] as const;
type PunchType = typeof ALLOWED_PUNCH_TYPES[number];

function stableCanonicalId(numericId: number): string {
  const hex = numericId.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Given a production_orders row, try to match its current_department to a work bucket.
 * Returns the bucket id (UUID string) or null.
 */
async function bucketFromDepartment(dept: string | null): Promise<string | null> {
  if (!dept) return null;
  const result = await pool.query(
    `SELECT id FROM work_buckets WHERE name ILIKE $1 AND active = true LIMIT 1`,
    [`%${dept}%`]
  );
  return result[0]?.id ?? null;
}

// POST /api/timekeeping/punch
router.post('/punch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { type, jobId, workBucketId: explicitBucketId } = req.body;

    if (!type || !ALLOWED_PUNCH_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${ALLOWED_PUNCH_TYPES.join(', ')}` });
    }

    const punchType = type as PunchType;

    // jobId required for clock_in
    if (punchType === 'clock_in' && !jobId) {
      return res.status(400).json({ error: 'jobId is required when clocking in' });
    }

    // Validate job + auto-derive bucket
    let resolvedBucketId: string | null = explicitBucketId ?? null;
    let resolvedJobId: number | null = null;

    if (jobId) {
      const numericJobId = parseInt(String(jobId), 10);
      if (isNaN(numericJobId)) {
        return res.status(400).json({ error: 'Invalid jobId' });
      }
      const job = await pool.query(
        `SELECT id, current_department FROM production_orders WHERE id = $1`,
        [numericJobId]
      );
      if (!job[0]) {
        return res.status(400).json({ error: 'Job not found' });
      }
      resolvedJobId = numericJobId;
      if (!resolvedBucketId) {
        resolvedBucketId = await bucketFromDepartment(job[0].current_department);
      }
    }

    // Validate explicit bucket if still needed
    if (resolvedBucketId && !resolvedJobId) {
      const bucket = await pool.query(
        `SELECT id FROM work_buckets WHERE id = $1 AND active = true`,
        [resolvedBucketId]
      );
      if (!bucket[0]) {
        return res.status(400).json({ error: 'Invalid or inactive work bucket' });
      }
    }

    const resolvedId = user.employeeId ?? user.id;
    const canonicalId = stableCanonicalId(resolvedId);

    if (user.employeeId) {
      const recent = await storage.getPunchEventsByEmployeeId(user.employeeId, 1);
      const lastType = (recent[0]?.punchType ?? null) as PunchType | null;

      if (punchType === 'clock_in' && lastType === 'clock_in') {
        return res.status(400).json({ error: 'Already clocked in' });
      }
      if (punchType === 'clock_out' && lastType !== 'clock_in' && lastType !== 'break_end') {
        return res.status(400).json({ error: 'Must clock in first' });
      }
      if (punchType === 'break_start' && lastType !== 'clock_in') {
        return res.status(400).json({ error: 'Must be clocked in to start a break' });
      }
      if (punchType === 'break_end' && lastType !== 'break_start') {
        return res.status(400).json({ error: 'No active break to end' });
      }
    }

    const externalPunchId = randomUUID();
    const now = new Date();

    await pool.query(
      `INSERT INTO punch_events
         (id, external_punch_id, canonical_id, epoch_employee_id,
          punch_type, punch_time, source, work_bucket_id, job_id)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, 'epoch_native', $6, $7)`,
      [
        externalPunchId,
        canonicalId,
        user.employeeId ?? null,
        punchType,
        now,
        resolvedBucketId,
        resolvedJobId,
      ]
    );

    try {
      await storage.createAdminAuditLog({
        orderId: 'TIMEKEEPING',
        fieldName: 'TIME_PUNCH',
        fieldLabel: 'Time Punch',
        oldValue: null,
        newValue: { type: punchType, jobId: resolvedJobId, workBucketId: resolvedBucketId },
        changedBy: user.username,
        userRole: user.role,
        changeType: 'TIMEKEEPING',
        reason: 'Employee punch',
      });
    } catch (auditErr) {
      console.warn('[Timekeeping] Audit log failed (non-fatal):', auditErr);
    }

    console.log(`[Timekeeping] ${punchType} for user ${user.username} job: ${resolvedJobId ?? 'none'} bucket: ${resolvedBucketId ?? 'none'}`);
    res.json({ success: true, punchType });
  } catch (err: any) {
    console.error('[Timekeeping] Punch error:', err);
    res.status(500).json({ error: 'Failed to record punch' });
  }
});

// GET /api/timekeeping/status
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (!user.employeeId) {
      return res.json({ status: null, lastPunch: null, clockIn: null, clockOut: null, jobId: null });
    }

    const punches = await storage.getPunchEventsByEmployeeId(user.employeeId, 50);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPunches = punches
      .filter(p => new Date(p.punchTime) >= today)
      .sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());

    const lastPunch = todayPunches.length > 0 ? todayPunches[todayPunches.length - 1] : null;
    const firstClockIn = todayPunches.find(p => p.punchType === 'clock_in');
    const lastClockOut = [...todayPunches].reverse().find(p => p.punchType === 'clock_out');

    res.json({
      status: lastPunch?.punchType ?? null,
      lastPunch: lastPunch
        ? { punchType: lastPunch.punchType, punchTime: lastPunch.punchTime }
        : null,
      clockIn: firstClockIn?.punchTime?.toISOString() ?? null,
      clockOut: lastClockOut?.punchTime?.toISOString() ?? null,
    });
  } catch (err: any) {
    console.error('[Timekeeping] Status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// GET /api/timekeeping/active-job
router.get('/active-job', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const empId = user.employeeId ?? user.id;

    const last = await pool.query(
      `SELECT job_id AS "jobId", punch_type AS "punchType"
       FROM punch_events
       WHERE epoch_employee_id = $1
       ORDER BY punch_time DESC LIMIT 1`,
      [empId]
    );

    if (!last[0] || last[0].punchType === 'clock_out') {
      return res.json({ jobId: null });
    }
    res.json({ jobId: last[0].jobId ?? null });
  } catch (err: any) {
    console.error('[Timekeeping] Active job error:', err);
    res.status(500).json({ error: 'Failed to fetch active job' });
  }
});

// GET /api/timekeeping/jobs — active production orders
router.get('/jobs', authenticateToken, async (req: Request, res: Response) => {
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

// GET /api/timekeeping/hours?startDate=&endDate=
router.get('/hours', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (!user.employeeId) {
      return res.json({ intervals: [], totalHours: 0, payPeriod: getPayPeriod() });
    }

    const payPeriod = getPayPeriod();
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : payPeriod.start;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : payPeriod.end;

    const rows = await pool.query(
      `SELECT
         pe.punch_type AS "punchType",
         pe.punch_time AS "punchTime",
         pe.work_bucket_id AS "workBucketId",
         pe.job_id AS "jobId",
         wb.name AS "bucketName",
         wb.type AS "bucketType",
         po.order_id AS "jobOrderNumber"
       FROM punch_events pe
       LEFT JOIN work_buckets wb ON wb.id = pe.work_bucket_id
       LEFT JOIN production_orders po ON po.id = pe.job_id
       WHERE pe.epoch_employee_id = $1
         AND pe.punch_time BETWEEN $2 AND $3
       ORDER BY pe.punch_time ASC`,
      [user.employeeId, startDate, endDate]
    );

    const intervals = pairPunches(rows);
    const totalHours = sumHours(intervals);

    res.json({
      intervals,
      totalHours,
      payPeriod: { start: payPeriod.start, end: payPeriod.end, label: payPeriod.label },
    });
  } catch (err: any) {
    console.error('[Timekeeping] Hours error:', err);
    res.status(500).json({ error: 'Failed to fetch hours' });
  }
});

// GET /api/timekeeping/admin/employee/:id
router.get(
  '/admin/employee/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const employeeId = parseInt(req.params.id, 10);
      if (isNaN(employeeId)) return res.status(400).json({ error: 'Invalid employee ID' });

      const payPeriod = getPayPeriod();
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : payPeriod.start;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : payPeriod.end;

      const rows = await pool.query(
        `SELECT
           pe.id,
           pe.punch_type AS "punchType",
           pe.punch_time AS "punchTime",
           pe.source,
           pe.approved,
           pe.work_bucket_id AS "workBucketId",
           pe.job_id AS "jobId",
           wb.name AS "bucketName",
           po.order_id AS "jobOrderNumber",
           pe.created_at AS "createdAt"
         FROM punch_events pe
         LEFT JOIN work_buckets wb ON wb.id = pe.work_bucket_id
         LEFT JOIN production_orders po ON po.id = pe.job_id
         WHERE pe.epoch_employee_id = $1
           AND pe.punch_time BETWEEN $2 AND $3
         ORDER BY pe.punch_time ASC`,
        [employeeId, startDate, endDate]
      );

      const intervals = pairPunches(rows);
      const totalHours = sumHours(intervals);

      res.json({
        punches: rows,
        intervals,
        totalHours,
        payPeriod: { start: payPeriod.start, end: payPeriod.end, label: payPeriod.label },
      });
    } catch (err: any) {
      console.error('[Timekeeping] Admin view error:', err);
      res.status(500).json({ error: 'Failed to fetch punch records' });
    }
  }
);

// POST /api/timekeeping/admin/approve/:employeeId
router.post(
  '/admin/approve/:employeeId',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const employeeId = parseInt(req.params.employeeId, 10);
      if (isNaN(employeeId)) return res.status(400).json({ error: 'Invalid employee ID' });

      const payPeriod = getPayPeriod();

      const result = await pool.query(
        `UPDATE punch_events
         SET approved = true
         WHERE epoch_employee_id = $1
           AND punch_time BETWEEN $2 AND $3
           AND approved = false`,
        [employeeId, payPeriod.start, payPeriod.end]
      );

      try {
        await storage.createAdminAuditLog({
          orderId: 'TIMEKEEPING',
          fieldName: 'PAY_PERIOD_APPROVAL',
          fieldLabel: 'Pay Period Approved',
          oldValue: null,
          newValue: { employeeId, payPeriod: payPeriod.label },
          changedBy: user.username,
          userRole: user.role,
          changeType: 'TIME_ADMIN',
          reason: `Pay period approved: ${payPeriod.label}`,
        });
      } catch (auditErr) {
        console.warn('[Timekeeping] Approval audit failed (non-fatal):', auditErr);
      }

      res.json({ success: true, approvedCount: (result as any).rowCount ?? 0, payPeriod: payPeriod.label });
    } catch (err: any) {
      console.error('[Timekeeping] Approve error:', err);
      res.status(500).json({ error: 'Failed to approve pay period' });
    }
  }
);

// PUT /api/timekeeping/admin/punch/:id
router.put(
  '/admin/punch/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const punchId = req.params.id;
      const { punchTime } = req.body;

      if (!punchTime) return res.status(400).json({ error: 'punchTime is required' });

      const newTime = new Date(punchTime);
      if (newTime > new Date()) {
        return res.status(400).json({ error: 'Punch time cannot be in the future' });
      }

      const existing = await pool.query(
        `SELECT punch_time AS "punchTime", punch_type AS "punchType", approved
         FROM punch_events WHERE id = $1`,
        [punchId]
      );

      if (!existing[0]) return res.status(404).json({ error: 'Punch not found' });
      if (existing[0].approved) return res.status(400).json({ error: 'Punch is approved and locked' });

      const oldTime = existing[0].punchTime;
      await pool.query(`UPDATE punch_events SET punch_time = $1 WHERE id = $2`, [newTime, punchId]);

      try {
        await storage.createAdminAuditLog({
          orderId: 'TIMEKEEPING',
          fieldName: 'TIME_EDIT',
          fieldLabel: 'Time Edit',
          oldValue: { punchId, oldTime },
          newValue: { punchId, newTime: punchTime },
          changedBy: user.username,
          userRole: user.role,
          changeType: 'TIME_ADMIN',
          reason: 'Manual time correction',
        });
      } catch (auditErr) {
        console.warn('[Timekeeping] Admin edit audit failed (non-fatal):', auditErr);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Timekeeping] Admin edit error:', err);
      res.status(500).json({ error: 'Failed to update punch' });
    }
  }
);

// DELETE /api/timekeeping/admin/punch/:id
router.delete(
  '/admin/punch/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const punchId = req.params.id;

      const existing = await pool.query(
        `SELECT punch_time AS "punchTime", punch_type AS "punchType",
                epoch_employee_id AS "epochEmployeeId", approved
         FROM punch_events WHERE id = $1`,
        [punchId]
      );

      if (!existing[0]) return res.status(404).json({ error: 'Punch not found' });
      if (existing[0].approved) return res.status(400).json({ error: 'Punch is approved and locked' });

      await pool.query(`DELETE FROM punch_events WHERE id = $1`, [punchId]);

      try {
        await storage.createAdminAuditLog({
          orderId: 'TIMEKEEPING',
          fieldName: 'TIME_DELETE',
          fieldLabel: 'Punch Deleted',
          oldValue: existing[0],
          newValue: null,
          changedBy: user.username,
          userRole: user.role,
          changeType: 'TIME_ADMIN',
          reason: 'Admin punch removal',
        });
      } catch (auditErr) {
        console.warn('[Timekeeping] Admin delete audit failed (non-fatal):', auditErr);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Timekeeping] Admin delete error:', err);
      res.status(500).json({ error: 'Failed to delete punch' });
    }
  }
);

// GET /api/timekeeping/admin/payroll
router.get(
  '/admin/payroll',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const payPeriod = getPayPeriod();
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : payPeriod.start;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : payPeriod.end;

      const rows = await pool.query(
        `SELECT
           epoch_employee_id AS "epochEmployeeId",
           punch_type AS "punchType",
           punch_time AS "punchTime",
           approved
         FROM punch_events
         WHERE approved = true AND punch_time BETWEEN $1 AND $2
         ORDER BY epoch_employee_id, punch_time`,
        [startDate, endDate]
      );

      const byEmployee: Record<number, any> = {};
      for (const row of rows) {
        const eid = row.epochEmployeeId;
        if (!byEmployee[eid]) byEmployee[eid] = { epochEmployeeId: eid, punches: [], totalHours: 0, intervals: [] };
        byEmployee[eid].punches.push(row);
      }
      for (const emp of Object.values(byEmployee)) {
        emp.intervals = pairPunches(emp.punches);
        emp.totalHours = sumHours(emp.intervals);
      }

      res.json({
        payPeriod: { start: payPeriod.start, end: payPeriod.end, label: payPeriod.label },
        employees: Object.values(byEmployee),
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[Timekeeping] Payroll export error:', err);
      res.status(500).json({ error: 'Failed to export payroll' });
    }
  }
);

// GET /api/timekeeping/admin/labor-by-bucket
router.get(
  '/admin/labor-by-bucket',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const payPeriod = getPayPeriod();
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : payPeriod.start;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : payPeriod.end;

      const rows = await pool.query(
        `SELECT
           pe.work_bucket_id AS "workBucketId",
           wb.name AS "bucketName",
           wb.type AS "bucketType",
           COUNT(*) FILTER (WHERE pe.punch_type = 'clock_in') AS "sessions",
           COUNT(DISTINCT pe.epoch_employee_id) AS "uniqueEmployees"
         FROM punch_events pe
         LEFT JOIN work_buckets wb ON wb.id = pe.work_bucket_id
         WHERE pe.punch_time BETWEEN $1 AND $2
         GROUP BY pe.work_bucket_id, wb.name, wb.type
         ORDER BY wb.name NULLS LAST`,
        [startDate, endDate]
      );

      res.json({
        payPeriod: { start: payPeriod.start, end: payPeriod.end, label: payPeriod.label },
        buckets: rows,
      });
    } catch (err: any) {
      console.error('[Timekeeping] Labor by bucket error:', err);
      res.status(500).json({ error: 'Failed to fetch labor by bucket' });
    }
  }
);

// ─── KIOSK ENDPOINTS (no auth — tablet/kiosk use) ───────────────────────────

function stableCanonicalIdKiosk(numericId: number): string {
  const hex = numericId.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

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

// GET /api/timekeeping/kiosk/status/:employeeId
router.get('/kiosk/status/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const rows = await pool.query(
      `SELECT
         pe.punch_type AS "punchType",
         pe.punch_time AS "punchTime",
         pe.job_id AS "jobId",
         po.order_id AS "jobOrderNumber"
       FROM punch_events pe
       LEFT JOIN production_orders po ON po.id = pe.job_id
       WHERE pe.epoch_employee_id = $1 AND pe.punch_time >= $2 AND pe.punch_time < $3
       ORDER BY pe.punch_time ASC`,
      [employeeId, today, tomorrow]
    );

    const lastPunch = rows.length > 0 ? rows[rows.length - 1] : null;
    const firstClockIn = rows.find((r: any) => r.punchType === 'clock_in');
    const lastClockOut = [...rows].reverse().find((r: any) => r.punchType === 'clock_out');

    // Current active job (from last clock_in that hasn't been clocked out)
    const activeJobId = (lastPunch?.punchType !== 'clock_out') ? (lastPunch?.jobId ?? null) : null;

    res.json({
      status: lastPunch?.punchType ?? null,
      lastPunch,
      clockIn: firstClockIn?.punchTime ?? null,
      clockOut: lastClockOut?.punchTime ?? null,
      activeJobId,
    });
  } catch (err: any) {
    console.error('[Kiosk] Status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// POST /api/timekeeping/kiosk/punch
router.post('/kiosk/punch', async (req: Request, res: Response) => {
  try {
    const { employeeId, type, jobId, workBucketId: explicitBucketId } = req.body;

    const numericId = parseInt(String(employeeId), 10);
    if (isNaN(numericId) || numericId <= 0) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    if (!type || !ALLOWED_PUNCH_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${ALLOWED_PUNCH_TYPES.join(', ')}` });
    }

    const punchType = type as PunchType;

    if (punchType === 'clock_in' && !jobId) {
      return res.status(400).json({ error: 'jobId is required when clocking in' });
    }

    // Validate job + auto-derive bucket
    let resolvedBucketId: string | null = explicitBucketId ?? null;
    let resolvedJobId: number | null = null;

    if (jobId) {
      const numericJobId = parseInt(String(jobId), 10);
      if (isNaN(numericJobId)) return res.status(400).json({ error: 'Invalid jobId' });

      const job = await pool.query(
        `SELECT id, current_department FROM production_orders WHERE id = $1`,
        [numericJobId]
      );
      if (!job[0]) return res.status(400).json({ error: 'Job not found' });

      resolvedJobId = numericJobId;
      if (!resolvedBucketId) {
        resolvedBucketId = await bucketFromDepartment(job[0].current_department);
      }
    }

    // Sequence validation
    const recent = await pool.query(
      `SELECT punch_type AS "punchType"
       FROM punch_events WHERE epoch_employee_id = $1
       ORDER BY punch_time DESC LIMIT 1`,
      [numericId]
    );
    const lastType = (recent[0]?.punchType ?? null) as PunchType | null;

    if (punchType === 'clock_in' && lastType === 'clock_in') {
      return res.status(400).json({ error: 'Already clocked in' });
    }
    if (punchType === 'clock_out' && lastType !== 'clock_in' && lastType !== 'break_end') {
      return res.status(400).json({ error: 'Must clock in first' });
    }
    if (punchType === 'break_start' && lastType !== 'clock_in') {
      return res.status(400).json({ error: 'Must be clocked in to start a break' });
    }
    if (punchType === 'break_end' && lastType !== 'break_start') {
      return res.status(400).json({ error: 'No active break to end' });
    }

    const now = new Date();
    await pool.query(
      `INSERT INTO punch_events
         (id, external_punch_id, canonical_id, epoch_employee_id,
          punch_type, punch_time, source, work_bucket_id, job_id)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, 'kiosk', $6, $7)`,
      [
        randomUUID(),
        stableCanonicalIdKiosk(numericId),
        numericId,
        punchType,
        now,
        resolvedBucketId,
        resolvedJobId,
      ]
    );

    console.log(`[Kiosk] ${punchType} for employee ${numericId} job: ${resolvedJobId ?? 'none'} bucket: ${resolvedBucketId ?? 'none'}`);
    res.json({ success: true, punchType });
  } catch (err: any) {
    console.error('[Kiosk] Punch error:', err);
    res.status(500).json({ error: 'Failed to record punch' });
  }
});

// GET /api/timekeeping/admin/job-labor/:jobId — total hours for a job
router.get('/admin/job-labor/:jobId', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Fetch all punches for employees who clocked into this job — clock_outs don't carry job_id
    const punches = await pool.query(
      `SELECT punch_type AS "punchType", punch_time AS "punchTime",
              job_id AS "jobId", epoch_employee_id AS "epochEmployeeId"
       FROM punch_events
       WHERE epoch_employee_id IN (
         SELECT DISTINCT epoch_employee_id FROM punch_events
         WHERE job_id = $1 AND punch_type = 'clock_in'
       )
       ORDER BY punch_time ASC`,
      [jobId]
    );

    const allIntervals = buildJobIntervals(punches);
    // Keep only intervals that started on this job
    const intervals = allIntervals.filter(i => i.jobId === jobId);
    const totalHours = intervals.reduce((sum, i) => sum + i.hours, 0);

    res.json({ jobId, totalHours, intervals });
  } catch (err: any) {
    console.error('[job-labor]', err);
    res.status(500).json({ error: 'Failed to calculate job labor' });
  }
});

// GET /api/timekeeping/admin/job-labor-breakdown/:jobId — per-employee hours + cost for a job
router.get('/admin/job-labor-breakdown/:jobId', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Fetch all punches for employees who clocked into this job (clock_outs have null job_id)
    const rows = await pool.query(
      `SELECT pe.punch_type AS "punchType",
              pe.punch_time AS "punchTime",
              pe.job_id AS "jobId",
              pe.epoch_employee_id AS "epochEmployeeId",
              COALESCE(e.labor_rate, 0) AS "laborRate",
              COALESCE(e.name, '') AS "employeeName"
       FROM punch_events pe
       LEFT JOIN employees e ON e.id = pe.epoch_employee_id
       WHERE pe.epoch_employee_id IN (
         SELECT DISTINCT epoch_employee_id FROM punch_events
         WHERE job_id = $1 AND punch_type = 'clock_in'
       )
       ORDER BY pe.epoch_employee_id, pe.punch_time ASC`,
      [jobId]
    );

    // Group by employee
    const byEmployee: Record<number, typeof rows> = {};
    for (const row of rows) {
      const empId = row.epochEmployeeId;
      if (!byEmployee[empId]) byEmployee[empId] = [];
      byEmployee[empId].push(row);
    }

    const breakdown = Object.entries(byEmployee).map(([empId, empPunches]) => {
      const allIntervals = buildJobIntervals(empPunches);
      // Only count intervals where the clock_in was for this job
      const intervals = allIntervals.filter(i => i.jobId === jobId);
      const hours = intervals.reduce((sum, i) => sum + i.hours, 0);
      const laborRate = Number(empPunches[0]?.laborRate ?? 0);
      const cost = hours * laborRate;
      return {
        employeeId: Number(empId),
        employeeName: empPunches[0]?.employeeName || null,
        hours,
        laborRate,
        cost,
      };
    });

    const totalHours = breakdown.reduce((sum, r) => sum + r.hours, 0);
    const totalCost = breakdown.reduce((sum, r) => sum + r.cost, 0);

    // Phase 5 — apply allocations to distribute cost/hours across projects
    const allocRows = await pool.query(
      `SELECT ja.project_id AS "projectId", ja.allocation_units AS "allocationUnits",
              p.project_code AS "projectCode", p.project_name AS "projectName"
       FROM job_allocations ja
       LEFT JOIN projects p ON p.id = ja.project_id
       WHERE ja.job_id = $1`,
      [jobId]
    );
    const totalUnits = allocRows.reduce((sum: number, a: any) => sum + Number(a.allocationUnits ?? 0), 0);
    const projectAllocation = allocRows.map((a: any) => {
      const ratio = totalUnits > 0 ? Number(a.allocationUnits) / totalUnits : 0;
      return {
        projectId: a.projectId,
        projectCode: a.projectCode,
        projectName: a.projectName,
        allocationUnits: Number(a.allocationUnits),
        hours: totalHours * ratio,
        cost: totalCost * ratio,
      };
    });

    res.json({ jobId, totalHours, totalCost, breakdown, projectAllocation });
  } catch (err: any) {
    console.error('[job-labor-breakdown]', err);
    res.status(500).json({ error: 'Failed to calculate job labor breakdown' });
  }
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

export default router;


