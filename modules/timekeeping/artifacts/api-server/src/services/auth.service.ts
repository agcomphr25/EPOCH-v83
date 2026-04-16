import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { SafeUser } from "@workspace/db";

export type { SafeUser };

function toSafe(user: typeof usersTable.$inferSelect): SafeUser {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

export async function getUserById(id: number): Promise<SafeUser | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return row ? toSafe(row) : null;
}

export async function getUserByEmail(email: string): Promise<SafeUser | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  return row ? toSafe(row) : null;
}

export async function validateCredentials(
  email: string,
  password: string
): Promise<SafeUser | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!row) return null;
  const valid = await bcrypt.compare(password, row.passwordHash);
  return valid ? toSafe(row) : null;
}

export async function createUser(data: {
  email: string;
  password: string;
  role: string;
  employeeId?: number | null;
}): Promise<SafeUser> {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const [row] = await db
    .insert(usersTable)
    .values({
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      employeeId: data.employeeId ?? null,
    })
    .returning();
  return toSafe(row!);
}

export async function listUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(usersTable);
  return rows.map(toSafe);
}
