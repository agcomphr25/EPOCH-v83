import { db, employeesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import type { Employee, InsertEmployee } from "@workspace/db";
import { logAction, type AuditActor } from "./audit.service";
import bcrypt from "bcryptjs";

const PIN_HASH_ROUNDS = 12;

function isAlreadyHashed(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

export async function hashPin(pin: string): Promise<string> {
  if (isAlreadyHashed(pin)) return pin;
  return bcrypt.hash(pin, PIN_HASH_ROUNDS);
}

export async function comparePinToHash(pin: string, hash: string): Promise<boolean> {
  if (!isAlreadyHashed(hash)) return pin === hash;
  return bcrypt.compare(pin, hash);
}

export type { Employee };
export type SafeEmployee = Omit<Employee, "pin"> & { pin: string | null };

export function stripPinHash(emp: Employee): SafeEmployee {
  return { ...emp, pin: emp.pin ? "••••" : null };
}

export async function listEmployees(filters?: {
  status?: string;
  department?: string;
}): Promise<SafeEmployee[]> {
  let rows = await db
    .select()
    .from(employeesTable)
    .orderBy(asc(employeesTable.lastName));

  if (filters?.status && filters.status !== "all") {
    rows = rows.filter((e) => e.status === filters.status);
  }
  if (filters?.department) {
    rows = rows.filter((e) => e.department === filters.department);
  }
  return rows.map(stripPinHash);
}

export async function getEmployee(id: number): Promise<Employee | null> {
  const [row] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id));
  return row ?? null;
}

export async function authenticateKioskEmployee(
  identifier: string,
  pin: string
): Promise<Employee | null> {
  const trimmed = identifier.trim();
  if (!trimmed || !pin) return null;

  const [byNumber] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.employeeNumber, trimmed));
  if (byNumber && byNumber.pin && byNumber.status === "active") {
    const pinMatch = await comparePinToHash(pin, byNumber.pin);
    if (pinMatch) return byNumber;
  }

  const lower = trimmed.toLowerCase();
  const all = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.status, "active"));
  const candidates = all.filter(
    (e) => e.lastName.toLowerCase() === lower && e.pin != null
  );
  const verified: Employee[] = [];
  for (const e of candidates) {
    if (await comparePinToHash(pin, e.pin!)) {
      verified.push(e);
    }
  }
  if (verified.length === 1) return verified[0]!;

  return null;
}

export async function createEmployee(
  data: InsertEmployee,
  actor: AuditActor
): Promise<Employee> {
  const toInsert = { ...data };
  if (toInsert.pin && !isAlreadyHashed(toInsert.pin)) {
    toInsert.pin = await hashPin(toInsert.pin);
  }
  const [row] = await db.insert(employeesTable).values(toInsert).returning();

  await logAction({
    tableName: "employees",
    recordId: row!.id,
    action: "INSERT",
    newValues: row as Record<string, unknown>,
    actor,
  });

  return row!;
}

export async function updateEmployee(
  id: number,
  data: Partial<InsertEmployee>,
  actor: AuditActor
): Promise<Employee | null> {
  const existing = await getEmployee(id);
  if (!existing) return null;

  const toUpdate = { ...data };
  if (toUpdate.pin && !isAlreadyHashed(toUpdate.pin)) {
    toUpdate.pin = await hashPin(toUpdate.pin);
  }

  const [row] = await db
    .update(employeesTable)
    .set(toUpdate)
    .where(eq(employeesTable.id, id))
    .returning();

  if (row) {
    await logAction({
      tableName: "employees",
      recordId: id,
      action: "UPDATE",
      oldValues: existing as Record<string, unknown>,
      newValues: row as Record<string, unknown>,
      actor,
    });
  }

  return row ?? null;
}

export async function deleteEmployee(
  id: number,
  actor: AuditActor
): Promise<Employee | null> {
  const existing = await getEmployee(id);
  if (!existing) return null;

  const [row] = await db
    .delete(employeesTable)
    .where(eq(employeesTable.id, id))
    .returning();

  if (row) {
    await logAction({
      tableName: "employees",
      recordId: id,
      action: "DELETE",
      oldValues: existing as Record<string, unknown>,
      actor,
    });
  }

  return row ?? null;
}
