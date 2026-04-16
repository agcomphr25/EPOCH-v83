import { PunchEvent } from '@shared/schema';

export interface LaborInterval {
  canonicalId: string;
  epochEmployeeId: number | null;
  clockIn: Date;
  clockOut: Date | null;
  durationMinutes: number | null;
  jobCode: string | null;
  locationCode: string | null;
  departmentCode: string | null;
  isOpen: boolean;
}

export interface LaborSummary {
  canonicalId: string;
  epochEmployeeId: number | null;
  totalMinutes: number;
  totalHours: number;
  intervals: LaborInterval[];
  openPunch: LaborInterval | null;
  periodStart: Date;
  periodEnd: Date;
}

export interface JobLaborSummary {
  jobCode: string;
  totalMinutes: number;
  totalHours: number;
  employeeCount: number;
  intervals: LaborInterval[];
}

export interface SiteLaborSummary {
  locationCode: string;
  totalMinutes: number;
  totalHours: number;
  employeeCount: number;
  intervals: LaborInterval[];
}

function isClockIn(punchType: string): boolean {
  return punchType === 'clock_in' || punchType === 'IN' || punchType === 'in';
}

function isClockOut(punchType: string): boolean {
  return punchType === 'clock_out' || punchType === 'OUT' || punchType === 'out';
}

export function deriveLaborIntervals(punches: PunchEvent[]): LaborInterval[] {
  const sortedPunches = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
  );

  const intervals: LaborInterval[] = [];
  let currentClockIn: PunchEvent | null = null;

  for (const punch of sortedPunches) {
    if (isClockIn(punch.punchType)) {
      if (currentClockIn) {
        intervals.push({
          canonicalId: currentClockIn.canonicalId,
          epochEmployeeId: currentClockIn.epochEmployeeId,
          clockIn: new Date(currentClockIn.punchTime),
          clockOut: null,
          durationMinutes: null,
          jobCode: currentClockIn.jobCode,
          locationCode: currentClockIn.locationCode,
          departmentCode: currentClockIn.departmentCode,
          isOpen: true,
        });
      }
      currentClockIn = punch;
    } else if (isClockOut(punch.punchType) && currentClockIn) {
      const clockInTime = new Date(currentClockIn.punchTime);
      const clockOutTime = new Date(punch.punchTime);
      const durationMs = clockOutTime.getTime() - clockInTime.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      intervals.push({
        canonicalId: currentClockIn.canonicalId,
        epochEmployeeId: currentClockIn.epochEmployeeId,
        clockIn: clockInTime,
        clockOut: clockOutTime,
        durationMinutes,
        jobCode: currentClockIn.jobCode,
        locationCode: currentClockIn.locationCode,
        departmentCode: currentClockIn.departmentCode,
        isOpen: false,
      });
      currentClockIn = null;
    }
  }

  if (currentClockIn) {
    intervals.push({
      canonicalId: currentClockIn.canonicalId,
      epochEmployeeId: currentClockIn.epochEmployeeId,
      clockIn: new Date(currentClockIn.punchTime),
      clockOut: null,
      durationMinutes: null,
      jobCode: currentClockIn.jobCode,
      locationCode: currentClockIn.locationCode,
      departmentCode: currentClockIn.departmentCode,
      isOpen: true,
    });
  }

  return intervals;
}

export function calculateLaborSummary(
  punches: PunchEvent[],
  periodStart: Date,
  periodEnd: Date
): LaborSummary {
  const intervals = deriveLaborIntervals(punches);
  
  const completedIntervals = intervals.filter(i => !i.isOpen);
  const totalMinutes = completedIntervals.reduce(
    (sum, i) => sum + (i.durationMinutes || 0),
    0
  );

  const openPunch = intervals.find(i => i.isOpen) || null;
  const canonicalId = punches[0]?.canonicalId || '';
  const epochEmployeeId = punches[0]?.epochEmployeeId || null;

  return {
    canonicalId,
    epochEmployeeId,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    intervals,
    openPunch,
    periodStart,
    periodEnd,
  };
}

export function calculateJobLaborSummary(
  punches: PunchEvent[],
  jobCode: string
): JobLaborSummary {
  const jobPunches = punches.filter(p => p.jobCode === jobCode);
  
  const byEmployee = new Map<string, PunchEvent[]>();
  for (const punch of jobPunches) {
    const key = punch.canonicalId;
    if (!byEmployee.has(key)) {
      byEmployee.set(key, []);
    }
    byEmployee.get(key)!.push(punch);
  }

  const allIntervals: LaborInterval[] = [];
  Array.from(byEmployee.values()).forEach(employeePunches => {
    const intervals = deriveLaborIntervals(employeePunches);
    allIntervals.push(...intervals);
  });

  const completedIntervals = allIntervals.filter(i => !i.isOpen);
  const totalMinutes = completedIntervals.reduce(
    (sum, i) => sum + (i.durationMinutes || 0),
    0
  );

  return {
    jobCode,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    employeeCount: byEmployee.size,
    intervals: allIntervals,
  };
}

export function calculateSiteLaborSummary(
  punches: PunchEvent[],
  locationCode: string
): SiteLaborSummary {
  const sitePunches = punches.filter(p => p.locationCode === locationCode);
  
  const byEmployee = new Map<string, PunchEvent[]>();
  for (const punch of sitePunches) {
    const key = punch.canonicalId;
    if (!byEmployee.has(key)) {
      byEmployee.set(key, []);
    }
    byEmployee.get(key)!.push(punch);
  }

  const allIntervals: LaborInterval[] = [];
  Array.from(byEmployee.values()).forEach(employeePunches => {
    const intervals = deriveLaborIntervals(employeePunches);
    allIntervals.push(...intervals);
  });

  const completedIntervals = allIntervals.filter(i => !i.isOpen);
  const totalMinutes = completedIntervals.reduce(
    (sum, i) => sum + (i.durationMinutes || 0),
    0
  );

  return {
    locationCode,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    employeeCount: byEmployee.size,
    intervals: allIntervals,
  };
}

export { getPayPeriodDates } from './payPeriod';

export function getTodayDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}
