import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

export async function validateActionToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const existingUser = (req as any).user;
  if (existingUser?.id) {
    return next();
  }

  const actionToken = req.headers['x-action-token'] as string;
  if (!actionToken) {
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT at.*, u.username, u.role
       FROM action_tokens at
       JOIN users u ON at.user_id = u.id
       WHERE at.token = $1 AND at.expires_at > NOW()`,
      [actionToken]
    );

    const rows = result?.rows || result;
    if (rows && rows.length > 0) {
      const tokenRecord = rows[0];
      (req as any).user = {
        id: tokenRecord.user_id,
        username: tokenRecord.username,
        role: tokenRecord.role,
        employeeId: null,
        canOverridePrices: false,
        isActive: true,
        authMethod: 'action_token',
      };
    }
  } catch (error) {
    console.error('[ActionToken] Validation error:', error);
  }

  next();
}

export async function cleanupExpiredTokens() {
  try {
    const result = await pool.query(
      'DELETE FROM action_tokens WHERE expires_at < NOW()'
    );
    if (result && (result as any).rowCount > 0) {
      console.log(`[ActionToken] Cleaned up ${(result as any).rowCount} expired tokens`);
    }
  } catch (error) {
    console.error('[ActionToken] Cleanup error:', error);
  }
}
