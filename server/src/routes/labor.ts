import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  getPayPeriodDates,
} from '../services/laborSummary';
import { DEFAULT_SESSIONS_LIMIT, MAX_SESSIONS_LIMIT } from '../constants/sessions';

const router = Router();

// These endpoints previously read from public.punch_events which was dropped in
// migration 0048_drop_punch_events.sql. Labor analytics are now served by the
// standalone Timekeeper module.

router.get('/summary/employee/:canonicalId', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for employee labor summaries.' });
});

router.get('/summary/job/:jobCode', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for job labor summaries.' });
});

router.get('/summary/site/:siteId', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for site labor summaries.' });
});

router.get('/open-punches', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for open punch queries.' });
});

router.get('/hours-today/:canonicalId', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for hours-today queries.' });
});

router.get('/awareness/:canonicalId', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for punch awareness.' });
});

router.get('/awareness-by-employee/:employeeId', authenticateToken, (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for punch awareness.' });
});

router.get('/pay-period-info', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const dates = getPayPeriodDates();
    const now = new Date();
    const daysRemaining = Math.ceil((dates.end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    res.json({
      periodStart: dates.start,
      periodEnd: dates.end,
      daysRemaining: Math.max(0, daysRemaining),
      currentDate: now,
    });
  } catch (error) {
    console.error('[IC-F1] Get pay period info error:', error);
    res.status(500).json({ error: 'Failed to fetch pay period info' });
  }
});

// GET /api/labor/sessions?employeeId=:id — time clock entry history for an employee
router.get('/sessions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { employeeId, date, limit, offset } = req.query;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'HR' || user.role === 'OWNER';

    let effectiveEmployeeId: string;

    if (isAdmin) {
      if (!employeeId || typeof employeeId !== 'string') {
        return res.status(400).json({ error: 'employeeId query parameter is required' });
      }
      effectiveEmployeeId = employeeId;
    } else {
      if (!user.employeeId) {
        return res.status(403).json({ error: 'No employee record linked to your account' });
      }
      if (employeeId && typeof employeeId === 'string' && employeeId !== String(user.employeeId)) {
        return res.status(403).json({ error: 'Access denied: you can only view your own sessions' });
      }
      effectiveEmployeeId = String(user.employeeId);
    }

    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : DEFAULT_SESSIONS_LIMIT;
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_SESSIONS_LIMIT)
      : DEFAULT_SESSIONS_LIMIT;
    const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : 0;
    const effectiveOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const entries = await storage.getTimeClockEntries(
      effectiveEmployeeId,
      typeof date === 'string' ? date : undefined,
      effectiveLimit,
      effectiveOffset,
    );
    const sessions = entries.map((e) => {
      const clockIn = e.clockIn ? new Date(e.clockIn) : null;
      const clockOut = e.clockOut ? new Date(e.clockOut) : null;
      const totalHours =
        clockIn && clockOut
          ? (clockOut.getTime() - clockIn.getTime()) / 3_600_000
          : null;
      const status = !clockIn ? 'cancelled' : !clockOut ? 'open' : 'closed';
      return {
        id: e.id,
        employeeId: e.employeeId,
        chargeCode: e.chargeCode ?? null,
        workOrderId: e.productionWorkOrderId ?? null,
        travelerId: e.travelerId ?? null,
        projectId: null,
        startedAt: (clockIn ?? new Date(e.date)).toISOString(),
        endedAt: clockOut ? clockOut.toISOString() : null,
        totalHours: totalHours !== null ? Math.round(totalHours * 100) / 100 : null,
        status,
        notes: null,
      };
    });
    res.json(sessions);
  } catch (error) {
    console.error('[Labor] Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch work sessions' });
  }
});

export default router;
