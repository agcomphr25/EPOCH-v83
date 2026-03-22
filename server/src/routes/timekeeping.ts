import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { pool } from '../../db';
import { pairPunches, sumHours } from '../services/timekeepingPairing';
import { getPayPeriod } from '../services/payPeriod';

const router = Router();

const ALLOWED_PUNCH_TYPES = ['clock_in', 'clock_out', 'break_start', 'break_end'] as const;
type PunchType = typeof ALLOWED_PUNCH_TYPES[number];

function stableCanonicalId(numericId: number): string {
  const hex = numericId.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// POST /api/timekeeping/punch
router.post('/punch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { type, workBucketId } = req.body;

    if (!type || !ALLOWED_PUNCH_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${ALLOWED_PUNCH_TYPES.join(', ')}` });
    }

    const punchType = type as PunchType;

    // Bucket required on clock_in only
    if (punchType === 'clock_in' && !workBucketId) {
      return res.status(400).json({ error: 'workBucketId is required when clocking in' });
    }

    // Validate bucket exists if provided
    if (workBucketId) {
      const bucket = await pool.query(
        `SELECT id FROM work_buckets WHERE id = $1 AND active = true`,
        [workBucketId]
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
          punch_type, punch_time, source, work_bucket_id)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, 'epoch_native', $6)`,
      [
        externalPunchId,
        canonicalId,
        user.employeeId ?? null,
        punchType,
        now,
        workBucketId ?? null,
      ]
    );

    try {
      await storage.createAdminAuditLog({
        orderId: 'TIMEKEEPING',
        fieldName: 'TIME_PUNCH',
        fieldLabel: 'Time Punch',
        oldValue: null,
        newValue: { type: punchType, workBucketId: workBucketId ?? null },
        changedBy: user.username,
        userRole: user.role,
        changeType: 'TIMEKEEPING',
        reason: 'Employee punch',
      });
    } catch (auditErr) {
      console.warn('[Timekeeping] Audit log failed (non-fatal):', auditErr);
    }

    console.log(`[Timekeeping] ${punchType} recorded for user ${user.username} (employee ${user.employeeId}) bucket: ${workBucketId ?? 'none'}`);
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
      return res.json({ status: null, lastPunch: null, clockIn: null, clockOut: null });
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

// GET /api/timekeeping/buckets — list active work buckets
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
         wb.name AS "bucketName",
         wb.type AS "bucketType"
       FROM punch_events pe
       LEFT JOIN work_buckets wb ON wb.id = pe.work_bucket_id
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
           wb.name AS "bucketName",
           pe.created_at AS "createdAt"
         FROM punch_events pe
         LEFT JOIN work_buckets wb ON wb.id = pe.work_bucket_id
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

export default router;
