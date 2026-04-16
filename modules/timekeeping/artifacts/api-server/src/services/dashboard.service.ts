import { db, employeesTable, punchesTable, timesheetsTable, certificationsTable } from "@workspace/db";
import { eq, gte, and, desc } from "drizzle-orm";
import {
  computeHoursFromPunches,
  computeTimesheetHours,
  toTZDateStr,
  startOfWeekInTZ,
} from "../lib/timekeeping";
import { getEmployeePunchStatus } from "./punches.service";
import { getOrCreateSettings } from "./settings.service";
import type { Punch } from "@workspace/db";

export interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  clockedInNow: number;
  onBreakNow: number;
  pendingTimesheets: number;
  hoursThisWeek: number;
  overtimeHoursThisWeek: number;
  expiringCertifications: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;
  const weekStart = startOfWeekInTZ(tz, settings.workweekStartDay);

  const [allEmployees, allPunches, allTimesheets, allCerts] = await Promise.all([
    db.select().from(employeesTable),
    db
      .select()
      .from(punchesTable)
      .orderBy(desc(punchesTable.punchedAt)),
    db.select().from(timesheetsTable),
    db.select().from(certificationsTable),
  ]);

  const totalEmployees = allEmployees.length;
  const activeEmployees = allEmployees.filter((e) => e.status === "active").length;
  const activeEmpIds = new Set(
    allEmployees.filter((e) => e.status === "active").map((e) => e.id)
  );

  const latestPunchByEmployee = new Map<number, typeof punchesTable.$inferSelect>();
  for (const p of allPunches) {
    if (!latestPunchByEmployee.has(p.employeeId)) {
      latestPunchByEmployee.set(p.employeeId, p);
    }
  }

  let clockedInNow = 0;
  let onBreakNow = 0;
  for (const [empId, punch] of latestPunchByEmployee) {
    if (!activeEmpIds.has(empId)) continue;
    if (punch.type === "clock_in" || punch.type === "break_end") clockedInNow++;
    else if (punch.type === "break_start") onBreakNow++;
  }

  const pendingTimesheets = allTimesheets.filter(
    (t) => t.status === "submitted"
  ).length;

  const weekPunches = allPunches.filter(
    (p) => new Date(p.punchedAt) >= weekStart
  );

  const weekPunchesByEmp = new Map<number, Punch[]>();
  for (const p of weekPunches) {
    if (!weekPunchesByEmp.has(p.employeeId))
      weekPunchesByEmp.set(p.employeeId, []);
    weekPunchesByEmp.get(p.employeeId)!.push(p);
  }

  let hoursThisWeek = 0;
  let overtimeHoursThisWeek = 0;

  for (const empPunches of weekPunchesByEmp.values()) {
    const { totalHours, overtimeHours } = computeTimesheetHours(empPunches, {
      timezone: tz,
      overtimeThresholdDaily: settings.overtimeThresholdDaily,
      overtimeThresholdWeekly: settings.overtimeThresholdWeekly,
      roundingMinutes: settings.roundingRuleMinutes,
    });
    hoursThisWeek += totalHours;
    overtimeHoursThisWeek += overtimeHours;
  }

  const now = new Date();
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const expiringCertifications = allCerts.filter((c) => {
    if (!c.expiresDate) return false;
    const exp = new Date(c.expiresDate);
    return exp >= now && exp <= thirtyDaysOut;
  }).length;

  return {
    totalEmployees,
    activeEmployees,
    clockedInNow: clockedInNow + onBreakNow,
    onBreakNow,
    pendingTimesheets,
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
    overtimeHoursThisWeek: Math.round(overtimeHoursThisWeek * 100) / 100,
    expiringCertifications,
  };
}

export interface ClockedInEmployee {
  employee: typeof employeesTable.$inferSelect;
  clockedInAt: string;
  status: string;
  hoursToday: number;
}

export async function getClockedInEmployees(): Promise<ClockedInEmployee[]> {
  const employees = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.status, "active"));

  const result: ClockedInEmployee[] = [];
  for (const emp of employees) {
    const { status, clockedInAt, hoursToday } = await getEmployeePunchStatus(
      emp.id,
      emp.timezone ?? "UTC"
    );
    if (status === "clocked_in" || status === "on_break") {
      result.push({
        employee: emp,
        clockedInAt: clockedInAt?.toISOString() ?? new Date().toISOString(),
        status,
        hoursToday,
      });
    }
  }
  return result;
}

export interface DailyHours {
  date: string;
  hours: number;
  regularHours: number;
  overtimeHours: number;
}

export async function getWeeklyHours(filters?: {
  employeeId?: number;
}): Promise<DailyHours[]> {
  const settings = await getOrCreateSettings();
  const tz = settings.timezone;
  const weekStart = startOfWeekInTZ(tz, settings.workweekStartDay);

  const conditions: ReturnType<typeof eq>[] = [
    gte(punchesTable.punchedAt, weekStart),
  ];
  if (filters?.employeeId != null) {
    conditions.push(eq(punchesTable.employeeId, filters.employeeId));
  }

  const punches = await db
    .select()
    .from(punchesTable)
    .where(and(...conditions));

  const dayMap = new Map<string, Punch[]>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = toTZDateStr(d, tz);
    dayMap.set(key, []);
  }

  for (const p of punches) {
    const key = toTZDateStr(new Date(p.punchedAt), tz);
    if (dayMap.has(key)) {
      dayMap.get(key)!.push(p);
    }
  }

  const result: DailyHours[] = [];
  for (const [date, dayPunches] of dayMap) {
    const hours = computeHoursFromPunches(dayPunches, settings.roundingRuleMinutes);
    const regularHours = Math.min(hours, settings.overtimeThresholdDaily);
    const overtimeHours = Math.max(0, hours - settings.overtimeThresholdDaily);
    result.push({ date, hours, regularHours, overtimeHours });
  }

  return result;
}
