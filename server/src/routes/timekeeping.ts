import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { pool } from '../../db';
import { pairPunches, sumHours } from '../services/timekeepingPairing';

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
    const { type } = req.body;

    if (!type || !ALLOWED_PUNCH_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${ALLOWED_PUNCH_TYPES.join(', ')}` });
    }

    const punchType = type as PunchType;
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

    await storage.createPunchEvent({
      externalPunchId: randomUUID(),
      canonicalId,
      epochEmployeeId: user.employeeId ?? null,
      punchType,
      punchTime: new Date(),
      source: 'epoch_native',
      departmentCode: null,
      jobCode: null,
      locationCode: null,
      metadata: null,
      signature: null,
    });

    try {
      await storage.createAdminAuditLog({
        orderId: 'TIMEKEEPING',
        fieldName: 'TIME_PUNCH',
        fieldLabel: 'Time Punch',
        oldValue: null,
        newValue: { type: punchType },
        changedBy: user.username,
        userRole: user.role,
        changeType: 'TIMEKEEPING',
        reason: 'Employee punch',
      });
    } catch (auditErr) {
      console.warn('[Timekeeping] Audit log failed (non-fatal):', auditErr);
    }

    console.log(`[Timekeeping] ${punchType} recorded for user ${user.username} (employee ${user.employeeId})`);
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

    const lastPunch = todayPunches.length > 0
      ? todayPunches[todayPunches.length - 1]
      : null;

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

// GET /api/timekeeping/hours?startDate=&endDate=
router.get('/hours', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (!user.employeeId) {
      return res.json({ intervals: [], totalHours: 0 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : today;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const rows = await pool.query(
      `SELECT punch_type AS "punchType", punch_time AS "punchTime"
       FROM punch_events
       WHERE epoch_employee_id = $1
         AND punch_time BETWEEN $2 AND $3
       ORDER BY punch_time ASC`,
      [user.employeeId, startDate, endDate]
    );

    const intervals = pairPunches(rows);
    const totalHours = sumHours(intervals);

    res.json({ intervals, totalHours });
  } catch (err: any) {
    console.error('[Timekeeping] Hours error:', err);
    res.status(500).json({ error: 'Failed to fetch hours' });
  }
});

// GET /api/timekeeping/admin/employee/:id  — admin view all punches for an employee
router.get(
  '/admin/employee/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const employeeId = parseInt(req.params.id, 10);
      if (isNaN(employeeId)) {
        return res.status(400).json({ error: 'Invalid employee ID' });
      }

      const rows = await pool.query(
        `SELECT id, punch_type AS "punchType", punch_time AS "punchTime",
                source, department_code AS "departmentCode",
                created_at AS "createdAt"
         FROM punch_events
         WHERE epoch_employee_id = $1
         ORDER BY punch_time DESC`,
        [employeeId]
      );

      const intervals = pairPunches([...rows].reverse());
      const totalHours = sumHours(intervals);

      res.json({ punches: rows, intervals, totalHours });
    } catch (err: any) {
      console.error('[Timekeeping] Admin view error:', err);
      res.status(500).json({ error: 'Failed to fetch punch records' });
    }
  }
);

// PUT /api/timekeeping/admin/punch/:id  — admin correct a punch time
router.put(
  '/admin/punch/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const punchId = req.params.id;
      const { punchTime } = req.body;

      if (!punchTime) {
        return res.status(400).json({ error: 'punchTime is required' });
      }

      const existing = await pool.query(
        `SELECT punch_time AS "punchTime", punch_type AS "punchType"
         FROM punch_events WHERE id = $1`,
        [punchId]
      );

      if (!existing[0]) {
        return res.status(404).json({ error: 'Punch not found' });
      }

      const oldTime = existing[0].punchTime;

      await pool.query(
        `UPDATE punch_events SET punch_time = $1 WHERE id = $2`,
        [new Date(punchTime), punchId]
      );

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

      console.log(`[Timekeeping] Admin ${user.username} corrected punch ${punchId}: ${oldTime} → ${punchTime}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Timekeeping] Admin edit error:', err);
      res.status(500).json({ error: 'Failed to update punch' });
    }
  }
);

// DELETE /api/timekeeping/admin/punch/:id  — admin remove a punch
router.delete(
  '/admin/punch/:id',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const punchId = req.params.id;

      const existing = await pool.query(
        `SELECT punch_time AS "punchTime", punch_type AS "punchType", epoch_employee_id AS "epochEmployeeId"
         FROM punch_events WHERE id = $1`,
        [punchId]
      );

      if (!existing[0]) {
        return res.status(404).json({ error: 'Punch not found' });
      }

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

      console.log(`[Timekeeping] Admin ${user.username} deleted punch ${punchId}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Timekeeping] Admin delete error:', err);
      res.status(500).json({ error: 'Failed to delete punch' });
    }
  }
);

export default router;
