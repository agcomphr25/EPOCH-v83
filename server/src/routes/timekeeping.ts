import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../../middleware/auth';
import { storage } from '../../storage';

const router = Router();

const ALLOWED_PUNCH_TYPES = ['clock_in', 'clock_out', 'break_start', 'break_end'] as const;
type PunchType = typeof ALLOWED_PUNCH_TYPES[number];

function stableCanonicalId(numericId: number): string {
  const hex = numericId.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

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

export default router;
