export interface PunchRecord {
  punchType: string;
  punchTime: Date | string;
}

export interface WorkInterval {
  clockIn: string;
  clockOut: string;
  durationHours: number;
}

export function pairPunches(punches: PunchRecord[]): WorkInterval[] {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime()
  );

  const intervals: WorkInterval[] = [];
  let currentIn: PunchRecord | null = null;

  for (const p of sorted) {
    if (p.punchType === 'clock_in') {
      currentIn = p;
    }

    if (p.punchType === 'clock_out' && currentIn) {
      const inMs = new Date(currentIn.punchTime).getTime();
      const outMs = new Date(p.punchTime).getTime();
      intervals.push({
        clockIn: new Date(currentIn.punchTime).toISOString(),
        clockOut: new Date(p.punchTime).toISOString(),
        durationHours: (outMs - inMs) / 3_600_000,
      });
      currentIn = null;
    }
  }

  return intervals;
}

export function sumHours(intervals: WorkInterval[]): number {
  return intervals.reduce((sum, i) => sum + i.durationHours, 0);
}
