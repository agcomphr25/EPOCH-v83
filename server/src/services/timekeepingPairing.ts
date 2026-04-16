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

export interface GustoExportRow {
  first_name: string;
  last_name: string;
  regular_hours: number;
  overtime_hours: number;
  double_overtime_hours: number;
  sick_hours: number;
  vacation_hours: number;
}

/**
 * Query approved punch_events for the inclusive date range, aggregate hours
 * per employee, split at the 40-hour weekly threshold, and join to the
 * employees table to resolve first/last name.
 */
export async function exportApprovedPunchesForGusto(
  pool: { query: (sql: string, params?: any[]) => Promise<any[]> },
  periodStart: string,
  periodEnd: string
): Promise<GustoExportRow[]> {
  const rows: Array<{ epochEmployeeId: number; punchType: string; punchTime: Date | string }> =
    await pool.query(
      `SELECT
         pe.epoch_employee_id AS "epochEmployeeId",
         pe.punch_type AS "punchType",
         pe.punch_time AS "punchTime"
       FROM punch_events pe
       WHERE pe.approved = true
         AND pe.punch_time >= $1::date
         AND pe.punch_time < ($2::date + INTERVAL '1 day')
       ORDER BY pe.epoch_employee_id, pe.punch_time ASC`,
      [periodStart, periodEnd]
    );

  if (rows.length === 0) return [];

  const byEmployee: Record<number, PunchRecord[]> = {};
  for (const row of rows) {
    const eid = row.epochEmployeeId;
    if (!byEmployee[eid]) byEmployee[eid] = [];
    byEmployee[eid].push({ punchType: row.punchType, punchTime: row.punchTime });
  }

  const employeeIds = Object.keys(byEmployee).map(Number);

  const empRows: Array<{ id: number; name: string | null }> = await pool.query(
    `SELECT id, name FROM employees WHERE id = ANY($1::int[])`,
    [employeeIds]
  );
  const nameMap: Record<number, string> = {};
  for (const emp of empRows) {
    nameMap[emp.id] = emp.name ?? '';
  }

  return employeeIds.map((eid) => {
    const intervals = pairPunches(byEmployee[eid]);
    const totalHours = sumHours(intervals);
    const regularHours = Math.min(totalHours, 40);
    const overtimeHours = Math.max(0, totalHours - 40);

    const fullName = nameMap[eid] ?? '';
    const spaceIdx = fullName.indexOf(' ');
    const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
    const lastName = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : '';

    return {
      first_name: firstName,
      last_name: lastName,
      regular_hours: Math.round(regularHours * 100) / 100,
      overtime_hours: Math.round(overtimeHours * 100) / 100,
      double_overtime_hours: 0,
      sick_hours: 0,
      vacation_hours: 0,
    };
  });
}
