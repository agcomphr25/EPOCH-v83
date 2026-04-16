import type { Request, Response, NextFunction } from "express";
import type { SafeUser } from "../services/auth.service";

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

/**
 * Middleware: requires a valid session. Attaches req.user.
 * Returns 401 if not authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Middleware: requires an authenticated admin-role user.
 * Returns 401 if not authenticated, 403 if wrong role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId || !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * Middleware: populates req.user from session if a valid session exists.
 * Does not reject unauthenticated requests — use requireAuth or requireAdmin for that.
 */
export async function populateUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.session?.userId;
  if (userId) {
    try {
      const { getUserById } = await import("../services/auth.service");
      const user = await getUserById(userId);
      if (user) req.user = user;
    } catch {
      // non-fatal — user stays undefined
    }
  }
  next();
}
