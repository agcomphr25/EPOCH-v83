import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  calculateLaborSummary,
  calculateJobLaborSummary,
  calculateSiteLaborSummary,
  getPayPeriodDates,
  getTodayDateRange,
  deriveLaborIntervals,
} from '../services/laborSummary';
import { evaluatePunchAwareness, AwarenessConfig } from '../services/missedPunchAwareness';

const router = Router();

router.get('/summary/employee/:canonicalId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { canonicalId } = req.params;
    const { period } = req.query;
    
    let start: Date;
    let end: Date;
    
    if (period === 'today') {
      const dates = getTodayDateRange();
      start = dates.start;
      end = dates.end;
    } else if (period === 'pay-period') {
      const dates = getPayPeriodDates();
      start = dates.start;
      end = dates.end;
    } else {
      const startParam = req.query.startDate as string;
      const endParam = req.query.endDate as string;
      
      if (startParam && endParam) {
        start = new Date(startParam);
        end = new Date(endParam);
      } else {
        const dates = getPayPeriodDates();
        start = dates.start;
        end = dates.end;
      }
    }
    
    const punches = await storage.getPunchEventsByCanonicalId(canonicalId, 1000);
    const periodPunches = punches.filter(p => {
      const punchTime = new Date(p.punchTime);
      return punchTime >= start && punchTime <= end;
    });
    
    const summary = calculateLaborSummary(periodPunches, start, end);
    
    res.json(summary);
  } catch (error) {
    console.error('[IC-F1] Get employee labor summary error:', error);
    res.status(500).json({ error: 'Failed to fetch labor summary' });
  }
});

router.get('/summary/job/:jobCode', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobCode } = req.params;
    const { startDate, endDate } = req.query;
    
    let start: Date;
    let end: Date;
    
    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      const dates = getPayPeriodDates();
      start = dates.start;
      end = dates.end;
    }
    
    const allPunches = await storage.getPunchEventsByDateRange(start, end);
    const summary = calculateJobLaborSummary(allPunches, jobCode);
    
    res.json({
      ...summary,
      periodStart: start,
      periodEnd: end,
    });
  } catch (error) {
    console.error('[IC-F1] Get job labor summary error:', error);
    res.status(500).json({ error: 'Failed to fetch job labor summary' });
  }
});

router.get('/summary/site/:siteId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { startDate, endDate } = req.query;
    
    let start: Date;
    let end: Date;
    
    if (startDate && endDate) {
      start = new Date(startDate as string);
      end = new Date(endDate as string);
    } else {
      const dates = getPayPeriodDates();
      start = dates.start;
      end = dates.end;
    }
    
    const allPunches = await storage.getPunchEventsByDateRange(start, end);
    const summary = calculateSiteLaborSummary(allPunches, siteId);
    
    res.json({
      ...summary,
      periodStart: start,
      periodEnd: end,
    });
  } catch (error) {
    console.error('[IC-F1] Get site labor summary error:', error);
    res.status(500).json({ error: 'Failed to fetch site labor summary' });
  }
});

router.get('/open-punches', authenticateToken, async (req: Request, res: Response) => {
  try {
    const today = getTodayDateRange();
    const allPunches = await storage.getPunchEventsByDateRange(today.start, today.end);
    
    const byEmployee = new Map<string, typeof allPunches>();
    for (const punch of allPunches) {
      const key = punch.canonicalId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, []);
      }
      byEmployee.get(key)!.push(punch);
    }
    
    const openPunches: Array<{
      canonicalId: string;
      epochEmployeeId: number | null;
      clockInTime: Date;
      jobCode: string | null;
      locationCode: string | null;
    }> = [];
    
    Array.from(byEmployee.entries()).forEach(([canonicalId, punches]) => {
      const intervals = deriveLaborIntervals(punches);
      const open = intervals.find(i => i.isOpen);
      if (open) {
        openPunches.push({
          canonicalId,
          epochEmployeeId: open.epochEmployeeId,
          clockInTime: open.clockIn,
          jobCode: open.jobCode,
          locationCode: open.locationCode,
        });
      }
    });
    
    res.json({
      date: today.start.toISOString().split('T')[0],
      openPunches,
      count: openPunches.length,
    });
  } catch (error) {
    console.error('[IC-F1] Get open punches error:', error);
    res.status(500).json({ error: 'Failed to fetch open punches' });
  }
});

router.get('/hours-today/:canonicalId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { canonicalId } = req.params;
    const today = getTodayDateRange();
    
    const punches = await storage.getPunchEventsByCanonicalId(canonicalId, 100);
    const todayPunches = punches.filter(p => {
      const punchTime = new Date(p.punchTime);
      return punchTime >= today.start && punchTime <= today.end;
    });
    
    const summary = calculateLaborSummary(todayPunches, today.start, today.end);
    
    res.json({
      canonicalId,
      date: today.start.toISOString().split('T')[0],
      hoursWorked: summary.totalHours,
      minutesWorked: summary.totalMinutes,
      isCurrentlyClocked: summary.openPunch !== null,
      clockInTime: summary.openPunch?.clockIn || null,
    });
  } catch (error) {
    console.error('[IC-F1] Get hours today error:', error);
    res.status(500).json({ error: 'Failed to fetch hours today' });
  }
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

router.get('/awareness/:canonicalId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { canonicalId } = req.params;
    const thresholdHours = req.query.thresholdHours 
      ? parseFloat(req.query.thresholdHours as string) 
      : undefined;
    
    const config: Partial<AwarenessConfig> = {};
    if (thresholdHours) {
      config.openPunchThresholdHours = thresholdHours;
    }
    
    const today = getTodayDateRange();
    const punches = await storage.getPunchEventsByCanonicalId(canonicalId, 100);
    const recentPunches = punches.filter(p => {
      const punchTime = new Date(p.punchTime);
      return punchTime >= today.start;
    });
    
    const awareness = evaluatePunchAwareness(recentPunches, { 
      openPunchThresholdHours: config.openPunchThresholdHours ?? 10,
      workdayEndHour: 18 
    });
    
    res.json(awareness);
  } catch (error) {
    console.error('[IC-I1] Get punch awareness error:', error);
    res.status(500).json({ error: 'Failed to evaluate punch awareness' });
  }
});

router.get('/awareness-by-employee/:employeeId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }
    
    const employee = await storage.getEmployee(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (!employee.canonicalId) {
      return res.json({
        state: 'looks_good',
        message: null,
        actionText: null,
        openPunchTime: null,
        hoursOpen: null,
      });
    }
    
    const today = getTodayDateRange();
    const punches = await storage.getPunchEventsByCanonicalId(employee.canonicalId, 100);
    const recentPunches = punches.filter(p => {
      const punchTime = new Date(p.punchTime);
      return punchTime >= today.start;
    });
    
    const awareness = evaluatePunchAwareness(recentPunches, { 
      openPunchThresholdHours: 10,
      workdayEndHour: 18 
    });
    
    res.json(awareness);
  } catch (error) {
    console.error('[IC-I1] Get punch awareness by employee error:', error);
    res.status(500).json({ error: 'Failed to evaluate punch awareness' });
  }
});

export default router;
