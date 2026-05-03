// CLASSIFICATION NOTE (timekeeping.employees references in this file):
//   - ADMIN-WRITE: db.insert/update/delete on employeesTable — admin operations only
//   - SUPPLEMENTAL-FIELD: resolveByTimekeepingId / listResolvedEmployees provide
//     department, jobTitle, phone, hireDate from timekeeping.employees via LEFT JOIN
//   No runtime identity, PIN, timezone, or status reads start from timekeeping.employees.
//   All such reads flow through public.employees via the resolver functions.

import { db } from "../../../db";
import { employeesTable } from "../../schema/timekeeping";
import type { InsertEmployee } from "../../schema/timekeeping";
import { eq, sql } from "drizzle-orm";
import {
  resolveByTimekeepingId,
  listResolvedEmployees,
  type ResolvedEmployee,
} from "../../lib/timekeepingEmployeeResolver";
import { logAction, type AuditActor } from "./audit.service";
import bcrypt from "bcryptjs";

function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

export async function comparePinToHash(pin: string, hash: string): Promise<boolean> {
  if (!isBcryptHash(hash)) return pin === hash;
  return bcrypt.compare(pin, hash);
}

export type { ResolvedEmployee };

/** API-facing Employee shape. Preserves legacy field names (status, employeeNumber, pin). */
export interface Employee {
  id: number;
  epochEmployeeId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  employeeNumber: string | null;
  pin: string | null;
  status: "active" | "inactive";
  hireDate: string | null;
  hourlyRate: number | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SafeEmployee = Employee;

/** Map ResolvedEmployee → API Employee shape (PIN always redacted).
 *  MUST only be called on employees with a timekeeping anchor (timekeepingId != null).
 *  Use listEmployees() which filters out public-only employees before calling this. */
export function toApiEmployee(emp: ResolvedEmployee): SafeEmployee {
  if (emp.timekeepingId == null) {
    throw new Error(`[toApiEmployee] Called on public-only employee epochId=${emp.epochEmployeeId} with no timekeeping anchor — filter before mapping`);
  }
  return {
    id: emp.timekeepingId,
    epochEmployeeId: emp.epochEmployeeId ?? null,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    department: emp.department,
    jobTitle: emp.jobTitle,
    employeeNumber: emp.employeeCode,
    pin: emp.timekeeperPin ? "••••" : null,
    status: emp.isActive ? "active" : "inactive",
    hireDate: emp.hireDate,
    hourlyRate: emp.hourlyRate != null ? parseFloat(emp.hourlyRate) : null,
    timezone: emp.timezone,
    createdAt: emp.createdAt,
    updatedAt: emp.updatedAt,
  };
}

/** Alias for toApiEmployee — preserves prior call sites in routes. */
export function stripPinHash(emp: ResolvedEmployee): SafeEmployee {
  return toApiEmployee(emp);
}

export async function listEmployees(filters?: {
  status?: string | null;
  department?: string | null;
}): Promise<SafeEmployee[]> {
  let rows = await listResolvedEmployees();
  // Only expose employees with a timekeeping anchor — public-only employees (timekeepingId=null)
  // are excluded from the API until they are enrolled in timekeeping.
  rows = rows.filter((e) => e.timekeepingId != null);
  rows.sort((a, b) => a.name.localeCompare(b.name));
  if (filters?.status && filters.status !== "all") {
    const wantActive = filters.status === "active";
    rows = rows.filter((e) => e.isActive === wantActive);
  }
  if (filters?.department) {
    rows = rows.filter((e) => e.department === filters.department);
  }
  return rows.map(toApiEmployee);
}

export async function getEmployee(id: number): Promise<ResolvedEmployee | null> {
  return resolveByTimekeepingId(id);
}

export async function authenticateKioskEmployee(
  identifier: string,
  pin: string
): Promise<ResolvedEmployee | null> {
  const trimmed = identifier.trim();
  if (!trimmed || !pin) return null;

  const all = await listResolvedEmployees();

  const byCode = all.find(
    (e) => e.isActive && e.employeeCode === trimmed && e.timekeeperPin != null
  );
  if (byCode) {
    if (await comparePinToHash(pin, byCode.timekeeperPin!)) return byCode;
  }

  const lower = trimmed.toLowerCase();
  const candidates = all.filter(
    (e) => e.isActive && e.lastName.toLowerCase() === lower && e.timekeeperPin != null
  );
  const verified: ResolvedEmployee[] = [];
  for (const e of candidates) {
    if (await comparePinToHash(pin, e.timekeeperPin!)) verified.push(e);
  }
  if (verified.length === 1) return verified[0]!;

  return null;
}

export async function createEmployee(
  data: InsertEmployee,
  actor: AuditActor
): Promise<{ timekeepingId: number; resolved: ResolvedEmployee | null }> {
  // ADMIN-WRITE: insert into timekeeping.employees for supplemental fields and FK anchor
  const [row] = await db.insert(employeesTable).values(data).returning();

  await logAction({
    tableName: "employees",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  const resolved = await resolveByTimekeepingId(row!.id);
  if (!resolved) {
    console.warn(
      `[createEmployee] Employee timekeeping.id=${row!.id} has no epoch_employee_id — ` +
      `not resolvable through public.employees until linked.`
    );
  }
  return { timekeepingId: row!.id, resolved };
}

export async function updateEmployee(
  id: number,
  data: Partial<InsertEmployee>,
  actor: AuditActor
): Promise<ResolvedEmployee | null> {
  const existing = await resolveByTimekeepingId(id);
  if (!existing) return null;

  // Primary status write: update public.employees.is_active FIRST — this is the
  // canonical status field. timekeeping.employees.status is updated below as a
  // backward-compat mirror only (ADMIN-WRITE, secondary).
  if (data.status != null && existing.epochEmployeeId != null) {
    const isActive = data.status === "active";
    await db.execute(
      sql`UPDATE employees SET is_active = ${isActive} WHERE id = ${existing.epochEmployeeId}`
    );
  }

  // ADMIN-WRITE: update timekeeping.employees for supplemental fields.
  // timekeeping.employees.status is a backward-compat mirror of public.employees.is_active.
  const [row] = await db
    .update(employeesTable)
    .set(data)
    .where(eq(employeesTable.id, id))
    .returning();

  if (row) {
    await logAction({
      tableName: "employees",
      recordId: id,
      action: "UPDATE",
      oldValues: existing as unknown as Record<string, unknown>,
      newValues: row as unknown as Record<string, unknown>,
      actor,
    });
  }

  return resolveByTimekeepingId(id);
}

export async function deleteEmployee(
  id: number,
  actor: AuditActor
): Promise<ResolvedEmployee | null> {
  const existing = await resolveByTimekeepingId(id);
  if (!existing) return null;

  // ADMIN-WRITE: delete from timekeeping.employees
  const [row] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, id))
    .returning();

  if (row) {
    await logAction({
      tableName: "employees",
      recordId: id,
      action: "DELETE",
      oldValues: existing as unknown as Record<string, unknown>,
      actor,
    });
  }

  return existing;
}
