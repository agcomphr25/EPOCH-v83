import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../../middleware/auth';
import { storage } from '../../storage';

const router = Router();

function stableCanonicalId(numericId: number): string {
  const hex = numericId.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

router.post('/punch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { type } = req.body;

    if (!type || (type !== 'clock_in' && type !== 'clock_out')) {
      return res.status(400).json({ error: 'type must be clock_in or clock_out' });
    }

    const resolvedId = user.employeeId ?? user.id;
    const canonicalId = stableCanonicalId(resolvedId);

    await storage.createPunchEvent({
      externalPunchId: randomUUID(),
      canonicalId,
      epochEmployeeId: user.employeeId ?? null,
      punchType: type,
      punchTime: new Date(),
      source: 'epoch_native',
      departmentCode: null,
      jobCode: null,
      locationCode: null,
      metadata: null,
      signature: null,
    });

    console.log(`[Timekeeping] ${type} recorded for user ${user.username} (employee ${user.employeeId})`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Timekeeping] Punch error:', err);
    res.status(500).json({ error: 'Failed to record punch' });
  }
});

router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (!user.employeeId) {
      return res.json({ status: 'OUT', clockIn: null, clockOut: null });
    }

    const punches = await storage.getPunchEventsByEmployeeId(user.employeeId, 20);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPunches = punches
      .filter(p => new Date(p.punchTime) >= today)
      .sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());

    if (todayPunches.length === 0) {
      return res.json({ status: 'OUT', clockIn: null, clockOut: null });
    }

    const lastPunch = todayPunches[todayPunches.length - 1];
    const isIn = lastPunch.punchType === 'clock_in';

    const firstClockIn = todayPunches.find(p => p.punchType === 'clock_in');
    const lastClockOut = [...todayPunches].reverse().find(p => p.punchType === 'clock_out');

    res.json({
      status: isIn ? 'IN' : 'OUT',
      clockIn: firstClockIn?.punchTime?.toISOString() ?? null,
      clockOut: lastClockOut?.punchTime?.toISOString() ?? null,
    });
  } catch (err: any) {
    console.error('[Timekeeping] Status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

export default router;
