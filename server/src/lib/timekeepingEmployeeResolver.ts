/**
 * timekeepingEmployeeResolver — native EPOCH cross-schema identity resolver.
 *
 * ARCHITECTURE (Phase 3+): public.employees is the canonical source of truth for
 * identity, PIN, timezone, status, hourly rate, salary, and pay type. All runtime
 * flows that need employee identity MUST start from public.employees.
 */

import { db } from "../../db";
import { employees } from "../../schema";
import { employeesTable } from "../schema/timekeeping";
import { eq } from "drizzle-orm";

export interface ResolvedEmployee {
  id: number | null;
  timekeepingId: number | null;
  epochEmployeeId: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  employeeCode: string | null;
  isActive: boolean;
  timekeeperPin: string | null;
  timezone: string;
  hourlyRate: string | null;
  salary: string | null;
  payType: string | null;
  department: string | null;
  jobTitle: string | null;
  phone: string | null;
  hireDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function splitName(name: string): { firstName: string; lastName: string } {
  const idx = name.indexOf(" ");
  if (idx === -1) return { firstName: name, lastName: "" };
  return { firstName: name.slice(0, idx), lastName: name.slice(idx + 1) };
}

type TkRow = typeof employeesTable.$inferSelect;
type PubRow = typeof employees.$inferSelect;

function buildResolved(pub: PubRow, tk: TkRow | null): ResolvedEmployee {
  const { firstName, lastName } = splitName(pub.name);
  return {
    id: tk?.id ?? null,
    timekeepingId: tk?.id ?? null,
    epochEmployeeId: pub.id,
    name: pub.name,
    firstName,
    lastName,
    email: pub.email ?? null,
    employeeCode: pub.employeeCode ?? null,
    isActive: pub.isActive ?? false,
    timekeeperPin: pub.timekeeperPin ?? null,
    timezone: pub.timezone,
    hourlyRate: pub.hourlyRate ?? null,
    salary: pub.salary ?? null,
    payType: pub.payType ?? null,
    department: tk?.department ?? null,
    jobTitle: tk?.jobTitle ?? null,
    phone: tk?.phone ?? null,
    hireDate: tk?.hireDate ?? null,
    createdAt: tk?.createdAt ?? new Date(),
    updatedAt: tk?.updatedAt ?? new Date(),
  };
}

export async function resolveByEpochId(
  epochEmployeeId: number
): Promise<ResolvedEmployee | null> {
  const [pubRow] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, epochEmployeeId));

  if (!pubRow) {
    console.warn(`[resolveByEpochId] No public.employees row for id=${epochEmployeeId}`);
    return null;
  }

  const [tkRow] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.epochEmployeeId, epochEmployeeId))
    .limit(1);

  if (!tkRow) {
    console.info(
      `[resolveByEpochId] No timekeeping.employees anchor for epochEmployeeId=${epochEmployeeId} — ` +
      `supplemental fields null. Punch recording is still allowed (Phase 3).`
    );
  }

  return buildResolved(pubRow, tkRow ?? null);
}

export async function resolveByTimekeepingId(
  timekeepingId: number
): Promise<ResolvedEmployee | null> {
  const [tkRow] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, timekeepingId));

  if (!tkRow) return null;

  if (tkRow.epochEmployeeId == null) {
    console.warn(`[resolveByTimekeepingId] Orphaned employee: timekeeping.id=${tkRow.id} has no epoch_employee_id`);
    return null;
  }

  return resolveByEpochId(tkRow.epochEmployeeId);
}

export async function listResolvedEmployees(): Promise<ResolvedEmployee[]> {
  const pubRows = await db.select().from(employees);
  if (pubRows.length === 0) return [];

  const tkRows = await db.select().from(employeesTable);

  const tkByEpochId = new Map<number, TkRow>();
  for (const tk of tkRows) {
    if (tk.epochEmployeeId != null) {
      tkByEpochId.set(tk.epochEmployeeId, tk);
    }
  }

  const results: ResolvedEmployee[] = [];
  for (const pub of pubRows) {
    const tk = tkByEpochId.get(pub.id) ?? null;
    if (!tk) {
      console.info(
        `[listResolvedEmployees] No timekeeping.employees row for public.employees.id=${pub.id} (${pub.name}) — ` +
        `supplemental fields null. Punch recording allowed (Phase 3).`
      );
    }
    results.push(buildResolved(pub, tk));
  }

  return results;
}
