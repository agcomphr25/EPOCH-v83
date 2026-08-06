import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';

import { db } from '../../db';
import { designControlRecords } from '../../schema';
import { getUserPermissions } from '../services/permissionService';
import {
  assertStructuredProjectAccess,
  DesignControlStructuredError,
  type StructuredActor,
} from '../services/designControlStructuredLifecycleService';

export async function structuredActorFromRequest(
  req: Request
): Promise<StructuredActor> {
  const cached = (
    req as Request & { designControlStructuredActor?: StructuredActor }
  ).designControlStructuredActor;
  if (cached) return cached;
  const user = req.user as unknown as {
    id?: number;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    email?: string;
    role?: string;
  };
  const userId = user.id;
  if (!Number.isInteger(userId) || !userId || userId <= 0) {
    throw new DesignControlStructuredError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authenticated user identity is required'
    );
  }
  const { permissions } = await getUserPermissions(userId, user.role);
  const actor = {
    id: userId,
    displayName:
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      user.email ||
      `user-${user.id}`,
    role: user.role || 'EMPLOYEE',
    capabilities: permissions,
    adminOverrideReason:
      req.get('x-design-control-admin-override-reason') || undefined,
  };
  (
    req as Request & { designControlStructuredActor?: StructuredActor }
  ).designControlStructuredActor = actor;
  return actor;
}

export function sendDesignControlStructuredError(
  res: Response,
  error: unknown,
  fallback: string
) {
  if (error instanceof DesignControlStructuredError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details ?? {}),
    });
    return;
  }
  console.error(`[qms-design-control] ${fallback}`, error);
  res
    .status(500)
    .json({ error: 'DESIGN_CONTROL_OPERATION_FAILED', message: fallback });
}

export async function enforceDesignControlProjectAssignment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const recordId = String(req.params.id ?? '');
    const [record] = await db
      .select({ rdProjectId: designControlRecords.rdProjectId })
      .from(designControlRecords)
      .where(eq(designControlRecords.id, recordId))
      .limit(1);
    if (record?.rdProjectId) {
      await assertStructuredProjectAccess({
        rdProjectId: record.rdProjectId,
        actor: await structuredActorFromRequest(req),
        action: 'READ',
      });
    }
    next();
  } catch (error) {
    sendDesignControlStructuredError(
      res,
      error,
      'Design Control project access was denied'
    );
  }
}
