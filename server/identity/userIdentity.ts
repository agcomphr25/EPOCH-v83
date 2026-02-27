/*
EPOCH USER IDENTITY LAYER

Purpose:
Centralize all identity resolution and formatting logic.

Rules:
- Database stores UserId + DisplayName snapshot.
- Routes never manually build name strings.
- Routes never JOIN users directly for display.
- Frontend never renders numeric user IDs.
- Formatting rules are centralized here.

This layer sits between DB and API.
*/

import { db } from '../db';
import { users, employees } from '../schema';
import { eq } from 'drizzle-orm';

export type IdentitySnapshot = {
  userId: number;
  displayName: string;
  firstName: string;
  lastName: string;
};

export type IdentityFormat = 'full' | 'first' | 'initials';

export async function createIdentitySnapshot(userId: number): Promise<IdentitySnapshot> {
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return {
      userId,
      displayName: 'Unknown User',
      firstName: 'Unknown',
      lastName: '',
    };
  }

  const firstName = user.firstName ?? '';
  const lastName = user.lastName ?? '';
  const displayName = `${firstName} ${lastName}`.trim();

  return {
    userId,
    displayName: displayName || 'Unknown User',
    firstName: firstName || 'Unknown',
    lastName,
  };
}

export function formatIdentity(
  snapshot: IdentitySnapshot,
  format: IdentityFormat
): string {
  if (format === 'full') {
    return snapshot.displayName;
  }

  if (format === 'first') {
    return snapshot.firstName || snapshot.displayName;
  }

  if (format === 'initials') {
    const firstInitial = snapshot.firstName?.[0];
    const lastInitial = snapshot.lastName?.[0];

    if (firstInitial && lastInitial) {
      return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    if (firstInitial) {
      return firstInitial.toUpperCase();
    }

    return (snapshot.displayName[0] || '?').toUpperCase();
  }

  return snapshot.displayName;
}

export async function createEmployeeIdentitySnapshot(employeeId: number): Promise<IdentitySnapshot> {
  const [employee] = await db
    .select({
      name: employees.name,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    return {
      userId: employeeId,
      displayName: 'Unknown User',
      firstName: 'Unknown',
      lastName: '',
    };
  }

  const nameParts = (employee.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ');
  const displayName = employee.name || 'Unknown User';

  return {
    userId: employeeId,
    displayName,
    firstName,
    lastName,
  };
}

export async function buildIdentityInsertFields(userId: number) {
  const snapshot = await createIdentitySnapshot(userId);

  return {
    userId: snapshot.userId,
    displayName: snapshot.displayName,
  };
}

export async function buildEmployeeIdentityInsertFields(employeeId: number) {
  const snapshot = await createEmployeeIdentitySnapshot(employeeId);

  return {
    userId: snapshot.userId,
    displayName: snapshot.displayName,
  };
}
