import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { accountingAdminUsers } from '../../schema';
import { getUserPermissions } from '../services/permissionService';

export async function isAccountingAdminUser(user: any): Promise<boolean> {
  if (!user) return false;
  const username = String(user.username ?? '').trim().toLowerCase();
  const role = String(user.role ?? '').trim().toUpperCase();
  if (!username) return false;
  if (role === 'ACCOUNTING_ADMIN' || role === 'ADMIN' || role === 'OWNER') return true;

  const userId = Number(user.id);
  if (Number.isFinite(userId)) {
    const { permissionSet } = await getUserPermissions(userId, user.role);
    if (permissionSet.has('finance.accounting_admin')) return true;
  }

  const [row] = await db
    .select({ id: accountingAdminUsers.id })
    .from(accountingAdminUsers)
    .where(and(eq(accountingAdminUsers.username, username), eq(accountingAdminUsers.active, true)))
    .limit(1);
  return !!row;
}

export async function requireAccountingAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (await isAccountingAdminUser((req as any).user)) {
      return next();
    }

    const user = (req as any).user;
    console.warn(
      `[accounting-admin] denied username=${user?.username ?? 'unknown'} role=${user?.role ?? 'none'} route=${req.method} ${req.originalUrl}`
    );
    return res.status(403).json({
      error: 'Access denied',
      message: 'This action requires accounting_admin access.',
    });
  } catch (err) {
    console.error('[accounting-admin] access check failed:', err);
    return res.status(500).json({ error: 'Accounting admin access check failed' });
  }
}
