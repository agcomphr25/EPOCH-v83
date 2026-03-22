export interface JobLaborPunch {
  punchType: string;
  punchTime: string | Date;
  jobId?: number | null;
  epochEmployeeId?: number | null;
}

export interface JobLaborInterval {
  jobId: number | null;
  employeeId: number | null;
  start: string;
  end: string;
  hours: number;
}

/**
 * Pairs clock_in / clock_out punches into intervals.
 * Handles interspersed break_start / break_end by ignoring them for duration.
 */
export function buildJobIntervals(punches: JobLaborPunch[]): JobLaborInterval[] {
  const intervals: JobLaborInterval[] = [];
  let current: JobLaborPunch | null = null;

  const sorted = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
  );

  for (const p of sorted) {
    if (p.punchType === 'clock_in') {
      current = p;
    }
    if (p.punchType === 'clock_out' && current) {
      const start = new Date(current.punchTime);
      const end = new Date(p.punchTime);
      const hours = (end.getTime() - start.getTime()) / 3_600_000;
      intervals.push({
        jobId: current.jobId ?? null,
        employeeId: current.epochEmployeeId ?? null,
        start: start.toISOString(),
        end: end.toISOString(),
        hours: Math.max(0, hours),
      });
      current = null;
    }
  }

  return intervals;
}
