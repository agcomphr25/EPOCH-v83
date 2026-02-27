import { db } from '../db';
import { users, employees } from '../schema';
import { eq, inArray } from 'drizzle-orm';

export type UserSnapshot = {
  userId: number;
  displayName: string;
};

export async function resolveUserSnapshot(userId: number): Promise<UserSnapshot> {
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { userId, displayName: 'Unknown User' };
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

  return {
    userId,
    displayName: displayName || 'Unknown User',
  };
}

export async function resolveUserSnapshots(userIds: number[]): Promise<Map<number, UserSnapshot>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const result = new Map<number, UserSnapshot>();

  if (uniqueIds.length === 0) return result;

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(uniqueIds.length === 1 ? eq(users.id, uniqueIds[0]) : inArray(users.id, uniqueIds));

  for (const row of rows) {
    const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
    result.set(row.id, {
      userId: row.id,
      displayName: displayName || 'Unknown User',
    });
  }

  for (const id of uniqueIds) {
    if (!result.has(id)) {
      result.set(id, { userId: id, displayName: 'Unknown User' });
    }
  }

  return result;
}

export async function resolveEmployeeSnapshot(employeeId: number): Promise<UserSnapshot> {
  const [employee] = await db
    .select({
      name: employees.name,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    return { userId: employeeId, displayName: 'Unknown User' };
  }

  return {
    userId: employeeId,
    displayName: employee.name || 'Unknown User',
  };
}

export async function resolveEmployeeSnapshots(employeeIds: number[]): Promise<Map<number, UserSnapshot>> {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  const result = new Map<number, UserSnapshot>();

  if (uniqueIds.length === 0) return result;

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
    })
    .from(employees)
    .where(uniqueIds.length === 1 ? eq(employees.id, uniqueIds[0]) : inArray(employees.id, uniqueIds));

  for (const row of rows) {
    result.set(row.id, {
      userId: row.id,
      displayName: row.name || 'Unknown User',
    });
  }

  for (const id of uniqueIds) {
    if (!result.has(id)) {
      result.set(id, { userId: id, displayName: 'Unknown User' });
    }
  }

  return result;
}
