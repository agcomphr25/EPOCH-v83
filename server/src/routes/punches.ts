import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertPunchEventSchema } from '@shared/schema';
import crypto from 'crypto';

const router = Router();

const PUNCH_WEBHOOK_SECRET = process.env.PUNCH_WEBHOOK_SECRET || 'dev-secret';

function validateSignature(payload: string, signature: string): boolean {
  if (process.env.NODE_ENV === 'development' && !process.env.PUNCH_WEBHOOK_SECRET) {
    return true;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', PUNCH_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-punch-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    if (signature && !validateSignature(rawBody, signature)) {
      console.warn('[IC-7] Invalid punch webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const { event, data } = req.body;
    
    if (event !== 'PUNCH_RECORDED') {
      return res.status(200).json({ message: 'Event ignored', event });
    }
    
    const existingPunch = await storage.getPunchEventByExternalId(data.externalPunchId);
    if (existingPunch) {
      console.log(`[IC-7] Punch already exists: ${data.externalPunchId}`);
      return res.status(200).json({ message: 'Punch already recorded', id: existingPunch.id });
    }
    
    let epochEmployeeId: number | null = null;
    if (data.canonicalId) {
      const identity = await storage.getCanonicalIdentityById(data.canonicalId);
      if (identity) {
        const employees = await storage.getAllEmployees();
        const matchedEmployee = employees.find(e => e.canonicalId === data.canonicalId);
        if (matchedEmployee) {
          epochEmployeeId = matchedEmployee.id;
          console.log(`[IC-7] Matched employee ${epochEmployeeId} for canonical ${data.canonicalId}`);
        }
      }
    }
    
    const punchData = insertPunchEventSchema.parse({
      externalPunchId: data.externalPunchId,
      canonicalId: data.canonicalId,
      epochEmployeeId,
      punchType: data.punchType,
      punchTime: data.punchTime,
      source: data.source || 'timeclock',
      departmentCode: data.departmentCode,
      jobCode: data.jobCode,
      locationCode: data.locationCode,
      metadata: data.metadata,
      signature: signature,
    });
    
    const punch = await storage.createPunchEvent(punchData);
    console.log(`[IC-7] PUNCH_RECORDED stored: ${punch.id} (external: ${data.externalPunchId})`);
    
    res.status(201).json({ 
      message: 'Punch recorded',
      id: punch.id,
      epochEmployeeId,
    });
  } catch (error) {
    console.error('[IC-7] Punch webhook error:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid punch data', details: error.message });
    }
    res.status(500).json({ error: 'Failed to process punch' });
  }
});

router.get('/by-employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const limit = parseInt(req.query.limit as string) || 100;
    
    const punches = await storage.getPunchEventsByEmployeeId(employeeId, limit);
    res.json(punches);
  } catch (error) {
    console.error('[IC-7] Get punches by employee error:', error);
    res.status(500).json({ error: 'Failed to fetch punches' });
  }
});

router.get('/by-canonical/:canonicalId', async (req: Request, res: Response) => {
  try {
    const { canonicalId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const punches = await storage.getPunchEventsByCanonicalId(canonicalId, limit);
    res.json(punches);
  } catch (error) {
    console.error('[IC-7] Get punches by canonical ID error:', error);
    res.status(500).json({ error: 'Failed to fetch punches' });
  }
});

router.get('/by-date-range', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    const punches = await storage.getPunchEventsByDateRange(start, end);
    res.json(punches);
  } catch (error) {
    console.error('[IC-7] Get punches by date range error:', error);
    res.status(500).json({ error: 'Failed to fetch punches' });
  }
});

router.get('/labor-summary/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { startDate, endDate } = req.query;
    
    let punches: any[];
    
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      punches = (await storage.getPunchEventsByDateRange(start, end))
        .filter(p => p.epochEmployeeId === employeeId);
    } else {
      punches = await storage.getPunchEventsByEmployeeId(employeeId, 500);
    }
    
    const sortedPunches = punches.sort((a, b) => 
      new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
    );
    
    let totalMinutes = 0;
    let lastClockIn: Date | null = null;
    
    for (const punch of sortedPunches) {
      if (punch.punchType === 'clock_in') {
        lastClockIn = new Date(punch.punchTime);
      } else if (punch.punchType === 'clock_out' && lastClockIn) {
        const clockOut = new Date(punch.punchTime);
        const minutes = (clockOut.getTime() - lastClockIn.getTime()) / (1000 * 60);
        totalMinutes += minutes;
        lastClockIn = null;
      }
    }
    
    const jobCodeBreakdown: Record<string, number> = {};
    let currentJobCode: string | null = null;
    let jobStartTime: Date | null = null;
    
    for (const punch of sortedPunches) {
      if (punch.punchType === 'clock_in') {
        currentJobCode = punch.jobCode || 'unassigned';
        jobStartTime = new Date(punch.punchTime);
      } else if (punch.punchType === 'clock_out' && jobStartTime && currentJobCode) {
        const clockOut = new Date(punch.punchTime);
        const minutes = (clockOut.getTime() - jobStartTime.getTime()) / (1000 * 60);
        jobCodeBreakdown[currentJobCode] = (jobCodeBreakdown[currentJobCode] || 0) + minutes;
        currentJobCode = null;
        jobStartTime = null;
      }
    }
    
    res.json({
      employeeId,
      totalMinutes: Math.round(totalMinutes),
      totalHours: Math.round(totalMinutes / 60 * 100) / 100,
      punchCount: punches.length,
      jobCodeBreakdown,
    });
  } catch (error) {
    console.error('[IC-7] Labor summary error:', error);
    res.status(500).json({ error: 'Failed to calculate labor summary' });
  }
});

export default router;
