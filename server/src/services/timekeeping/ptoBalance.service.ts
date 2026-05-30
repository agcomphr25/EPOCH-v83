import { db } from "../../../db";
import { employeePtoSchedulesTable, ptoBalanceEventsTable, timeOffRequestsTable } from "../../schema/timekeeping";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type WeeklyPtoHours = {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
};

export type PtoBalanceSummary = {
  employeeId: number;
  availableHours: number;
  pendingReservedHours: number;
  approvedReservedHours: number;
  currentBalanceHours: number;
  hasSchedule: boolean;
  schedule: WeeklyPtoHours | null;
  lastEventAt: string | null;
  recentEvents: Array<{
    id: number;
    eventType: string;
    hours: number;
    note: string | null;
    timeOffRequestId: number | null;
    createdAt: string;
  }>;
};

const DAY_KEYS: Array<keyof WeeklyPtoHours> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function normalizeWeeklyHours(input: Partial<Record<keyof WeeklyPtoHours, unknown>>): WeeklyPtoHours {
  const normalized = {
    mon: Number(input.mon ?? 0),
    tue: Number(input.tue ?? 0),
    wed: Number(input.wed ?? 0),
    thu: Number(input.thu ?? 0),
    fri: Number(input.fri ?? 0),
    sat: Number(input.sat ?? 0),
    sun: Number(input.sun ?? 0),
  };
  for (const [day, hours] of Object.entries(normalized)) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new Error(`Invalid PTO schedule hours for ${day}`);
    }
  }
  return normalized;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Date must be YYYY-MM-DD");
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getActivePtoSchedule(employeeId: number, onDate = new Date().toISOString().slice(0, 10)): Promise<WeeklyPtoHours | null> {
  const [schedule] = await db
    .select()
    .from(employeePtoSchedulesTable)
    .where(
      and(
        eq(employeePtoSchedulesTable.employeeId, employeeId),
        sql`${employeePtoSchedulesTable.effectiveStart} <= ${onDate}`,
        sql`(${employeePtoSchedulesTable.effectiveEnd} IS NULL OR ${employeePtoSchedulesTable.effectiveEnd} >= ${onDate})`,
      ),
    )
    .orderBy(desc(employeePtoSchedulesTable.effectiveStart), desc(employeePtoSchedulesTable.id))
    .limit(1);

  return schedule ? normalizeWeeklyHours(schedule.weeklyHours as Partial<Record<keyof WeeklyPtoHours, unknown>>) : null;
}

export async function setPtoSchedule(params: {
  employeeId: number;
  weeklyHours: WeeklyPtoHours;
  effectiveStart: string;
  note?: string | null;
  actorUserId?: number | null;
}): Promise<WeeklyPtoHours> {
  const previousEnd = dateOnly(addDays(parseDateOnly(params.effectiveStart), -1));
  await db.transaction(async (tx) => {
    await tx
      .update(employeePtoSchedulesTable)
      .set({ effectiveEnd: previousEnd, updatedAt: new Date() })
      .where(and(eq(employeePtoSchedulesTable.employeeId, params.employeeId), isNull(employeePtoSchedulesTable.effectiveEnd)));

    await tx.insert(employeePtoSchedulesTable).values({
      employeeId: params.employeeId,
      effectiveStart: params.effectiveStart,
      effectiveEnd: null,
      weeklyHours: params.weeklyHours,
      note: params.note ?? null,
      createdByUserId: params.actorUserId ?? null,
    });
  });

  return params.weeklyHours;
}

export async function calculatePtoRequestHours(params: {
  employeeId: number;
  startDate: string;
  endDate: string;
  requestUnit: string;
  requestedHours?: number | null;
}): Promise<{ hours: number; schedule: WeeklyPtoHours; days: Array<{ date: string; hours: number }> }> {
  const schedule = await getActivePtoSchedule(params.employeeId, params.startDate);
  if (!schedule) {
    throw new Error("PTO schedule is required before time off can be requested.");
  }

  if (params.requestUnit === "hourly") {
    const hours = Number(params.requestedHours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) throw new Error("requestedHours is required when requestUnit is 'hourly'");
    return { hours: round2(hours), schedule, days: [{ date: params.startDate, hours: round2(hours) }] };
  }

  const start = parseDateOnly(params.startDate);
  const end = parseDateOnly(params.endDate);
  if (start > end) throw new Error("startDate must not be after endDate");

  const days: Array<{ date: string; hours: number }> = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = DAY_KEYS[d.getUTCDay()];
    const scheduledHours = Number(schedule[key] ?? 0);
    const hours = params.requestUnit === "half_day" ? scheduledHours / 2 : scheduledHours;
    if (hours > 0) days.push({ date: dateOnly(d), hours: round2(hours) });
  }

  const hours = round2(days.reduce((sum, day) => sum + day.hours, 0));
  if (hours <= 0) {
    throw new Error("Selected dates do not include scheduled PTO hours.");
  }
  return { hours, schedule, days };
}

export async function getPtoBalanceSummary(employeeId: number, opts: { includeEvents?: boolean } = {}): Promise<PtoBalanceSummary> {
  const [events, schedule, pendingRows, approvedRows] = await Promise.all([
    db
      .select()
      .from(ptoBalanceEventsTable)
      .where(eq(ptoBalanceEventsTable.employeeId, employeeId))
      .orderBy(desc(ptoBalanceEventsTable.createdAt), desc(ptoBalanceEventsTable.id)),
    getActivePtoSchedule(employeeId),
    db
      .select({ hours: ptoBalanceEventsTable.hours })
      .from(ptoBalanceEventsTable)
      .innerJoin(timeOffRequestsTable, eq(timeOffRequestsTable.id, ptoBalanceEventsTable.timeOffRequestId))
      .where(and(eq(ptoBalanceEventsTable.employeeId, employeeId), eq(ptoBalanceEventsTable.eventType, "request_submitted"), sql`${timeOffRequestsTable.status} IN ('pending','pending_supervisor','pending_hr','pending_vp')`)),
    db
      .select({ hours: ptoBalanceEventsTable.hours })
      .from(ptoBalanceEventsTable)
      .innerJoin(timeOffRequestsTable, eq(timeOffRequestsTable.id, ptoBalanceEventsTable.timeOffRequestId))
      .where(and(eq(ptoBalanceEventsTable.employeeId, employeeId), eq(ptoBalanceEventsTable.eventType, "request_submitted"), eq(timeOffRequestsTable.status, "approved"))),
  ]);

  const currentBalanceHours = round2(events.reduce((sum, event) => sum + Number(event.hours || 0), 0));
  return {
    employeeId,
    availableHours: currentBalanceHours,
    pendingReservedHours: round2(Math.abs(pendingRows.reduce((sum, row) => sum + Number(row.hours || 0), 0))),
    approvedReservedHours: round2(Math.abs(approvedRows.reduce((sum, row) => sum + Number(row.hours || 0), 0))),
    currentBalanceHours,
    hasSchedule: !!schedule,
    schedule,
    lastEventAt: events[0]?.createdAt?.toISOString?.() ?? null,
    recentEvents: opts.includeEvents ? events.slice(0, 20).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      hours: Number(event.hours || 0),
      note: event.note,
      timeOffRequestId: event.timeOffRequestId,
      createdAt: event.createdAt.toISOString(),
    })) : [],
  };
}

export async function addManualPtoBalanceEvent(params: {
  employeeId: number;
  hours: number;
  note?: string | null;
  actorUserId?: number | null;
}): Promise<PtoBalanceSummary> {
  if (!Number.isFinite(params.hours)) throw new Error("hours must be a valid number");
  await db.insert(ptoBalanceEventsTable).values({
    employeeId: params.employeeId,
    eventType: "manual_adjustment",
    hours: round2(params.hours),
    note: params.note ?? "Manual PTO balance adjustment",
    createdByUserId: params.actorUserId ?? null,
  });
  return getPtoBalanceSummary(params.employeeId, { includeEvents: true });
}

export async function reservePtoForRequest(params: {
  employeeId: number;
  requestId: number;
  hours: number;
  actorUserId?: number | null;
}): Promise<void> {
  if (params.hours <= 0) throw new Error("PTO request hours must be greater than zero");
  await db.insert(ptoBalanceEventsTable).values({
    employeeId: params.employeeId,
    eventType: "request_submitted",
    hours: -round2(params.hours),
    timeOffRequestId: params.requestId,
    note: `Reserved PTO for request #${params.requestId}`,
    createdByUserId: params.actorUserId ?? null,
  });
}

export async function restorePtoForRequest(params: {
  employeeId: number;
  requestId: number;
  reason: string;
  actorUserId?: number | null;
}): Promise<void> {
  const events = await db
    .select()
    .from(ptoBalanceEventsTable)
    .where(and(eq(ptoBalanceEventsTable.employeeId, params.employeeId), eq(ptoBalanceEventsTable.timeOffRequestId, params.requestId)));

  const alreadyRestored = events.some((event) => event.eventType === "request_cancelled" || event.eventType === "request_rejected");
  if (alreadyRestored) return;

  const reserved = Math.abs(events.filter((event) => event.eventType === "request_submitted").reduce((sum, event) => sum + Number(event.hours || 0), 0));
  if (reserved <= 0) return;

  await db.insert(ptoBalanceEventsTable).values({
    employeeId: params.employeeId,
    eventType: params.reason === "cancelled" ? "request_cancelled" : "request_rejected",
    hours: round2(reserved),
    timeOffRequestId: params.requestId,
    note: `Released PTO reservation for ${params.reason} request #${params.requestId}`,
    createdByUserId: params.actorUserId ?? null,
  });
}
