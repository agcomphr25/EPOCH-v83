import { db, punchesTable, employeesTable } from "@workspace/db";
import { eq, and, gte, lte, desc, isNotNull } from "drizzle-orm";
import type { Punch, Employee, InsertPunch } from "@workspace/db";
import {
  derivePunchStatus,
  resolveNextPunchType,
  type PunchStatus,
} from "../lib/timekeeping";
import { logAction, type AuditActor } from "./audit.service";
import { isInApprovedTimesheetPeriod } from "./timesheets.service";
import { comparePinToHash } from "./employees.service";

export type { PunchStatus };

export interface PunchStatusResult {
  status: PunchStatus;
  lastPunch: Punch | null;
  clockedInAt: Date | null;
  hoursToday: number;
}

export async function getEmployeePunchStatus(
  employeeId: number,
  timezone: string = "UTC"
): Promise<PunchStatusResult> {
  const punches = await db
    .select()
    .from(punchesTable)
    .where(eq(punchesTable.employeeId, employeeId))
    .orderBy(desc(punchesTable.punchedAt))
    .limit(50);

  const result = derivePunchStatus(punches, timezone);
  return {
    status: result.status,
    lastPunch: result.lastPunch as Punch | null,
    clockedInAt: result.clockedInAt,
    hoursToday: result.hoursToday,
  };
}

export async function listPunches(filters?: {
  employeeId?: number;
  type?: string;
  from?: string;
  to?: string;
}): Promise<Punch[]> {
  const conditions = [];
  if (filters?.employeeId != null) {
    conditions.push(eq(punchesTable.employeeId, filters.employeeId));
  }
  if (filters?.type) {
    conditions.push(eq(punchesTable.type, filters.type));
  }
  if (filters?.from) {
    conditions.push(gte(punchesTable.punchedAt, new Date(filters.from)));
  }
  if (filters?.to) {
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(punchesTable.punchedAt, toDate));
  }

  return db
    .select()
    .from(punchesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(punchesTable.punchedAt);
}

export async function getPunch(id: number): Promise<Punch | null> {
  const [row] = await db
    .select()
    .from(punchesTable)
    .where(eq(punchesTable.id, id));
  return row ?? null;
}

export async function createPunch(
  data: InsertPunch,
  actor: AuditActor
): Promise<Punch> {
  const [row] = await db.insert(punchesTable).values(data).returning();

  await logAction({
    tableName: "punches",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function updatePunch(
  id: number,
  data: { punchedAt?: string; note?: string; editNote?: string; costCode?: string | null },
  actor: AuditActor
): Promise<Punch | { error: string; statusCode: number }> {
  const existing = await getPunch(id);
  if (!existing) return { error: "Punch not found", statusCode: 404 };

  const locked = await isInApprovedTimesheetPeriod(
    existing.employeeId,
    new Date(existing.punchedAt)
  );
  if (locked) {
    return {
      error: "This punch falls within an approved timesheet period and cannot be edited",
      statusCode: 409,
    };
  }

  const updateData: Record<string, unknown> = { isEdited: true };
  if (data.punchedAt) updateData.punchedAt = new Date(data.punchedAt);
  if (data.note !== undefined) updateData.note = data.note;
  if (data.editNote !== undefined) updateData.editNote = data.editNote;
  if (data.costCode !== undefined) updateData.costCode = data.costCode;

  const [row] = await db
    .update(punchesTable)
    .set(updateData)
    .where(eq(punchesTable.id, id))
    .returning();

  await logAction({
    tableName: "punches",
    recordId: id,
    action: "UPDATE",
    oldValues: existing as Record<string, unknown>,
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function deletePunch(
  id: number,
  actor: AuditActor
): Promise<Punch | { error: string; statusCode: number }> {
  const existing = await getPunch(id);
  if (!existing) return { error: "Punch not found", statusCode: 404 };

  const locked = await isInApprovedTimesheetPeriod(
    existing.employeeId,
    new Date(existing.punchedAt)
  );
  if (locked) {
    return {
      error: "This punch falls within an approved timesheet period and cannot be deleted",
      statusCode: 409,
    };
  }

  const [row] = await db
    .delete(punchesTable)
    .where(eq(punchesTable.id, id))
    .returning();

  await logAction({
    tableName: "punches",
    recordId: id,
    action: "DELETE",
    oldValues: existing as Record<string, unknown>,
    actor,
  });

  return row!;
}

export interface KioskPunchResult {
  punch: Punch;
  action: string;
  employee: Employee;
  message: string;
}

export async function kioskPunch(params: {
  employeeId?: number | null;
  pin?: string | null;
  timezone?: string;
  requestedAction?: "clock_in" | "clock_out" | "break_start" | "break_end";
  costCode?: string | null;
}): Promise<KioskPunchResult | { error: string; statusCode: number }> {
  let employee: Employee | null = null;

  if (params.employeeId != null) {
    const [row] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, params.employeeId));
    employee = row ?? null;
  } else if (params.pin) {
    const allWithPins = await db
      .select()
      .from(employeesTable)
      .where(isNotNull(employeesTable.pin));
    for (const row of allWithPins) {
      if (!row.pin) continue;
      if (await comparePinToHash(params.pin, row.pin)) {
        employee = row;
        break;
      }
    }
  }

  if (!employee) return { error: "Employee not found", statusCode: 404 };
  if (employee.status !== "active") {
    return { error: "Employee is not active", statusCode: 403 };
  }

  const punchTime = new Date();
  const periodLocked = await isInApprovedTimesheetPeriod(employee.id, punchTime);
  if (periodLocked) {
    return {
      error: "This date falls within an approved timesheet period. Punch cannot be recorded via kiosk.",
      statusCode: 409,
    };
  }

  const employeeTZ = employee.timezone ?? "UTC";
  const { status } = await getEmployeePunchStatus(employee.id, employeeTZ);
  const action = params.requestedAction ?? resolveNextPunchType(status);

  const kioskActor: AuditActor = {
    id: null,
    email: `kiosk:employee:${employee.id}`,
    role: "kiosk",
    ip: null,
  };

  const [punch] = await db
    .insert(punchesTable)
    .values({
      employeeId: employee.id,
      type: action,
      punchedAt: new Date(),
      timezone: params.timezone ?? employeeTZ,
      source: "kiosk",
      costCode: params.costCode ?? null,
    })
    .returning();

  await logAction({
    tableName: "punches",
    recordId: punch!.id,
    action: "INSERT",
    newValues: punch as Record<string, unknown>,
    actor: kioskActor,
  });

  const messages: Record<string, string> = {
    clock_in: `Welcome, ${employee.firstName}! You are now clocked in.`,
    clock_out: `Goodbye, ${employee.firstName}! You have clocked out.`,
    break_start: `Enjoy your break, ${employee.firstName}!`,
    break_end: `Welcome back, ${employee.firstName}! Break ended.`,
  };

  const { pin: _pin, ...safeEmployee } = employee;
  return {
    punch: punch!,
    action,
    employee: safeEmployee,
    message: messages[action] ?? "Punch recorded.",
  };
}
